#!/usr/bin/env python3
"""Connects Home Assistant to the Kokoro voice, using only Python's standard library.

Home Assistant speaks the Wyoming protocol and Kokoro speaks HTTP, so this sits between them. It also:
  * tidies text for speech, so "8-10" isn't read as "8 dash 10" and "11°C" becomes "11 degrees Celsius"
  * speaks a long reply a sentence at a time, so it starts sooner, but a short one in one go, so it flows
  * falls back to Piper if Kokoro fails or is too slow, so the Echo always answers

It listens on this computer only, and never writes what's being said to a log.
"""
import argparse
import array
import asyncio
from collections import OrderedDict
import http.client
import json
import logging
import re
import threading
import time
from urllib.parse import urlparse

KOKORO_RATE = 24000
FIRST_AUDIO_S = 15        # no sound from Kokoro by then: use Piper for this sentence
KOKORO_REST_S = 60        # after a failure, skip Kokoro this long so replies don't keep waiting for it
CHUNK_BYTES = 4096
MAX_TEXT = 2000
SPLIT_OVER = 70           # sentences longer than this are spoken a phrase at a time, so the first sound comes sooner
PIECE_AT_LEAST = 35       # but phrases stay long enough to sound natural
QUIET_BELOW = 300         # sound level that counts as silence
PHRASE_PAUSE_SAMPLES = int(KOKORO_RATE * 0.12)  # the short pause kept between phrases
SENTENCE_PAUSE_SAMPLES = int(KOKORO_RATE * 0.18)  # and between sentences (the next adds ~0.1s of its own); the voice leaves up to a second
HOLD_BYTES = KOKORO_RATE * 2 * 2                # how much of a phrase's end to hold back, in case it's silence
HOLD_LAST_BYTES = int(KOKORO_RATE * 1.2) * 2    # the same at the end of a sentence (its silence is under a second)
JOIN_UP_TO = 70           # a short sentence after another ("... Good morning!") goes with it, up to this long in all
JOIN_SHORT = 24           # what counts as short: longer ones stay apart, as joining would delay the first sound
JOIN_WAIT_S = 0.15        # when text arrives in parts, how long to wait for the next sentence before speaking a short one
# Said so often that they're prepared in advance. They start instantly, and the rest of the reply is prepared meanwhile.
OPENERS = ('Sure thing.', 'Okay.', 'Of course.', 'No problem.', 'Let me see.', 'Right then.', 'Alright.', 'Here we go.')
REMEMBER_UP_TO = 40       # short phrases this long or less are kept in memory once spoken, as they tend to come up again
REMEMBER_BYTES = 16 * 1024 * 1024               # the most sound to keep in memory; nothing is written to disk
WARM_RETRY_S = 60         # how long to wait before preparing the openers again, if the voice wasn't ready

# The voices Home Assistant can pick: what it shows, and what Kokoro is asked for. That can be one of Kokoro's voices
# or a blend ("bm_george(2)+am_onyx(1)" is two parts George to one part Onyx), and a speed (1 is normal).
VOICES = {
    'bm_fable': ('Fable (British male)', 'bm_fable', 1.0),
    'bm_lewis': ('Lewis (British male)', 'bm_lewis', 1.0),
    'af_sarah': ('Sarah (American female)', 'af_sarah', 1.0),
    'af_sky': ('Sky (American female)', 'af_sky', 1.0),
    'am_echo': ('Echo (American male)', 'am_echo', 1.0),
    'am_onyx': ('Onyx (American male)', 'am_onyx', 1.0),
    'am_santa': ('Santa (American male)', 'am_santa', 1.0),
}
DEFAULT_VOICE = 'bm_fable'
LOG = logging.getLogger('echo-voice-bridge')

_EMOJI = re.compile('[\U0001F000-\U0001FAFF☀-➿️‍]')
_ABBREVIATIONS = re.compile(r'(?:^|\s)(?:Mr|Mrs|Ms|Dr|St|No|vs|etc|e\.g|i\.e)\.$', re.I)


def clean_for_speech(text):
    """Rewrites anything a voice would read out literally or get wrong."""
    text = _EMOJI.sub('', str(text))
    text = re.sub(r'(?m)^\s*(?:[-*•]|\d+\.)\s+', '', text)                 # list markers
    text = re.sub(r'[*_#`~]+', '', text)                                          # markdown
    text = re.sub(r'\b(\d{4})-(\d{2})-(\d{2})\b', r'\1 \2 \3', text)              # dates: no "dash"
    text = re.sub(r'(\d)\s*°\s*C\b', r'\1 degrees Celsius', text)
    text = re.sub(r'(\d)\s*°\s*F\b', r'\1 degrees Fahrenheit', text)
    text = re.sub(r'(\d)\s*°', r'\1 degrees', text)
    text = re.sub(r'(\d)\s*C\b(?![\w-])', r'\1 degrees Celsius', text)
    # ranges and times: 8-10, 5pm-8pm, 10:30-11:00
    text = re.sub(r'(\d(?:\s?[ap]\.?m\.?)?)\s*[-–—]+\s*(?=\d)', r'\1 to ', text, flags=re.I)
    text = re.sub(r'(^|[\s(,:])-(?=\d)', r'\1minus ', text)                       # negative numbers
    text = re.sub(r'\s*(?:--+|[–—])\s*', ', ', text)                    # dashes between phrases
    text = re.sub(r'\s+-\s+', ', ', text)
    text = re.sub(r'(\d)\s*%', r'\1 percent', text)
    text = re.sub(r'\bkm/h\b', 'kilometres an hour', text, flags=re.I)
    text = re.sub(r'\bmph\b', 'miles an hour', text, flags=re.I)
    text = text.replace('&', ' and ')
    text = re.sub(r'\s*\n+\s*', '. ', text)
    text = re.sub(r'\s{2,}', ' ', text)
    text = re.sub(r'([.,!?])(?:\s*[.,])+', r'\1', text)
    return text.strip(' ,')[:MAX_TEXT]


def take_sentences(text, final=False):
    """Splits off complete sentences. Returns (sentences, whatever is left waiting)."""
    sentences, start = [], 0
    for match in re.finditer(r'[.!?]+(?=\s|$)', text):
        piece = text[start:match.end()]
        if match.end() == len(text) and not final:
            break                                  # could still be mid-number, like "11." then "5"
        if piece.strip() not in OPENERS and (_ABBREVIATIONS.search(piece.rstrip()) or len(piece.strip()) < 12):
            continue                               # keep very short bits with the next sentence
        sentences.append(piece.strip())
        start = match.end()
    rest = text[start:]
    if final and rest.strip():
        sentences.append(rest.strip())
        rest = ''
    return sentences, rest


def speech_pieces(sentence):
    """Splits a long sentence at its commas, because the voice can only start once a whole piece is ready."""
    if len(sentence) <= SPLIT_OVER:
        return [sentence]
    pieces = []
    for part in re.split(r'(?<=[,;:])\s+', sentence):
        if pieces and len(pieces[-1]) < PIECE_AT_LEAST:
            pieces[-1] += ' ' + part
        else:
            pieces.append(part)
    if len(pieces) > 1 and len(pieces[-1]) < PIECE_AT_LEAST:
        last = pieces.pop()
        pieces[-1] += ' ' + last
    return pieces


def join_short(sentences):
    """Puts a short sentence back with the one before ("Okay, alarm off." + "Good morning!"), so the voice says them
    in one go. Said separately, there's a long gap while the short one is made. The ready-made openers stay apart."""
    out = []
    for sentence in sentences:
        if (out and out[-1] not in OPENERS and sentence not in OPENERS and len(sentence) <= JOIN_SHORT
                and len(out[-1]) + 1 + len(sentence) <= JOIN_UP_TO):
            out[-1] += ' ' + sentence
        else:
            out.append(sentence)
    return out


def tighten_end(pcm, pause=PHRASE_PAUSE_SAMPLES):
    """Trims the long silence the voice leaves after each piece, so a sentence keeps flowing."""
    samples = array.array('h')
    samples.frombytes(pcm[:len(pcm) & ~1])
    end = len(samples)
    while end > 0 and abs(samples[end - 1]) < QUIET_BELOW:
        end -= 1
    return samples[:end + pause].tobytes()


def resample(pcm, source, target):
    """Simple rate change for the rare case Piper has to step in part way through a reply."""
    if source == target or not pcm:
        return pcm
    samples = array.array('h')
    samples.frombytes(pcm[: len(pcm) // 2 * 2])
    size = int(len(samples) * target / source)
    out = array.array('h', bytes(size * 2))
    ratio = source / target
    for i in range(size):
        at = i * ratio
        low = int(at)
        high = min(low + 1, len(samples) - 1)
        out[i] = int(samples[low] + (samples[high] - samples[low]) * (at - low))
    return out.tobytes()


class Bridge:
    def __init__(self, kokoro_url, piper_host, piper_port, piper_voice):
        self.kokoro = urlparse(kokoro_url)
        self.piper = (piper_host, piper_port)
        self.piper_voice = piper_voice
        self.kokoro_rest_until = 0
        self.remembered = OrderedDict()

    def info(self):
        attribution = {'name': 'Kokoro', 'url': 'https://github.com/hexgrad/kokoro'}
        return {'asr': [], 'intent': [], 'wake': [], 'handle': [], 'tts': [{
            'name': 'echo-voice', 'attribution': attribution, 'installed': True,
            'description': 'Kokoro, with Piper as a backup', 'version': '1.0.0', 'supports_synthesize_streaming': True,
            'voices': [{'name': name, 'attribution': attribution, 'installed': True, 'description': description,
                        'version': None, 'languages': ['en_GB'], 'speakers': None} for name, (description, _, _) in VOICES.items()],
        }]}

    def _kokoro_thread(self, text, voice, loop, queue):
        """Runs in a thread, as the standard library's web client isn't asynchronous."""
        put = lambda item: loop.call_soon_threadsafe(queue.put_nowait, item)
        connection = None
        try:
            connection = http.client.HTTPConnection(self.kokoro.hostname, self.kokoro.port, timeout=FIRST_AUDIO_S)
            _, kokoro_voice, speed = VOICES.get(voice, VOICES[DEFAULT_VOICE])
            request = {'model': 'kokoro', 'input': text, 'voice': kokoro_voice, 'response_format': 'pcm', 'stream': True}
            if speed != 1.0:
                request['speed'] = speed
            body = json.dumps(request)
            connection.request('POST', '/v1/audio/speech', body, {'Content-Type': 'application/json'})
            response = connection.getresponse()
            if response.status != 200:
                put(RuntimeError(f'Kokoro answered {response.status}'))
                return
            while True:
                data = response.read1(CHUNK_BYTES)
                if not data:
                    break
                put(data)
            put(None)
        except Exception as error:  # noqa: BLE001 - passed back so Piper can step in
            put(error)
        finally:
            if connection:
                connection.close()

    def _remember(self, key, pcm):
        pcm = tighten_end(pcm) if key[1] in OPENERS else tighten_end(pcm, SENTENCE_PAUSE_SAMPLES)
        self.remembered[key] = pcm
        self.remembered.move_to_end(key)
        while sum(len(sound) for sound in self.remembered.values()) > REMEMBER_BYTES and len(self.remembered) > 1:
            self.remembered.popitem(last=False)

    async def warm_up(self):
        """Prepares the openers in the background, trying again later if the voice isn't ready yet."""
        while True:
            missing = [text for text in OPENERS if (DEFAULT_VOICE, text) not in self.remembered]
            if not missing:
                LOG.info('Openers ready')
                return
            for text in missing:
                await self._speak_kokoro(text, DEFAULT_VOICE, _NoOutput(), remember=True)
                if (DEFAULT_VOICE, text) not in self.remembered:
                    break
            if any((DEFAULT_VOICE, text) not in self.remembered for text in OPENERS):
                await asyncio.sleep(WARM_RETRY_S)

    async def _speak_kokoro(self, text, voice, output, more_to_come=False, remember=False):
        """Returns True if it spoke. Falls back only if no sound has gone out yet. The end is always held back a
        little and its silence trimmed: to a short pause mid-sentence, or a sentence's pause at the end."""
        hold, pause = (HOLD_BYTES, PHRASE_PAUSE_SAMPLES) if more_to_come else (HOLD_LAST_BYTES, SENTENCE_PAUSE_SAMPLES)
        if time.monotonic() < self.kokoro_rest_until:
            return False
        loop, queue = asyncio.get_running_loop(), asyncio.Queue()
        threading.Thread(target=self._kokoro_thread, args=(text, voice, loop, queue), daemon=True).start()
        began, held = False, b''
        kept = bytearray() if remember else None
        while True:
            try:
                item = await asyncio.wait_for(queue.get(), FIRST_AUDIO_S)
            except asyncio.TimeoutError:
                item = RuntimeError('Kokoro took too long')
            if item is None:
                if began:
                    if held:
                        await output.audio(tighten_end(held, pause), KOKORO_RATE)
                    if kept is not None:
                        self._remember((voice, text), bytes(kept))
                    return True
                item = RuntimeError('Kokoro sent no sound')
            if isinstance(item, Exception):
                self.kokoro_rest_until = time.monotonic() + KOKORO_REST_S
                LOG.warning('Kokoro problem, using Piper for a while: %s', item)
                if held:
                    await output.audio(held, KOKORO_RATE)
                if kept and text in OPENERS:
                    await output.audio(bytes(kept), KOKORO_RATE)  # it was being saved up, so don't lose it
                return began
            began = True
            if kept is not None:
                kept += item
                if text in OPENERS:
                    continue                       # sent once complete, with its long silence trimmed off
            held += item
            cut = (len(held) - hold) & ~1
            if cut > 0:
                await output.audio(held[:cut], KOKORO_RATE)
                held = held[cut:]

    async def _speak_piper(self, text, output):
        reader, writer = await asyncio.wait_for(asyncio.open_connection(*self.piper), 5)
        try:
            await write_event(writer, 'synthesize', {'text': text, 'voice': {'name': self.piper_voice}})
            while True:
                kind, data, payload = await asyncio.wait_for(read_event(reader), 60)
                if kind == 'audio-chunk':
                    await output.audio(payload, data.get('rate', 22050))
                elif kind == 'audio-stop':
                    return
                elif kind == 'error':
                    raise RuntimeError(data.get('text', 'Piper reported an error'))
        finally:
            writer.close()

    async def speak(self, text, voice, output):
        text = clean_for_speech(text)
        if not text:
            return
        voice = voice if voice in VOICES else DEFAULT_VOICE
        pieces = speech_pieces(text)
        for index, piece in enumerate(pieces):
            known = self.remembered.get((voice, piece))
            if known is not None:
                self.remembered.move_to_end((voice, piece))
                await output.audio(known, KOKORO_RATE)
            elif not await self._speak_kokoro(piece, voice, output, more_to_come=index < len(pieces) - 1, remember=len(piece) <= REMEMBER_UP_TO and index == len(pieces) - 1):
                await self._speak_piper(piece, output)
            elif piece in OPENERS and (voice, piece) in self.remembered:
                await output.audio(self.remembered[(voice, piece)], KOKORO_RATE)


class _NoOutput:
    """Used when preparing sound for later."""

    async def audio(self, pcm, rate):
        pass


class Output:
    """Sends sound to Home Assistant, all at one rate."""

    def __init__(self, writer):
        self.writer = writer
        self.rate = None

    async def audio(self, pcm, rate):
        if self.rate is None:
            self.rate = rate
            await write_event(self.writer, 'audio-start', {'rate': rate, 'width': 2, 'channels': 1})
        pcm = resample(pcm, rate, self.rate)
        for start in range(0, len(pcm), CHUNK_BYTES):
            await write_event(self.writer, 'audio-chunk', {'rate': self.rate, 'width': 2, 'channels': 1}, pcm[start:start + CHUNK_BYTES])

    async def finish(self):
        if self.rate is None:  # nothing to say: still end properly, at the usual rate
            self.rate = KOKORO_RATE
            await write_event(self.writer, 'audio-start', {'rate': self.rate, 'width': 2, 'channels': 1})
        await write_event(self.writer, 'audio-stop', {})


async def read_event(reader):
    line = await reader.readline()
    if not line:
        raise ConnectionError('closed')
    head = json.loads(line)
    data = dict(head.get('data') or {})
    if head.get('data_length'):
        data.update(json.loads(await reader.readexactly(head['data_length'])))
    payload = await reader.readexactly(head['payload_length']) if head.get('payload_length') else b''
    return head['type'], data, payload


async def write_event(writer, kind, data, payload=b''):
    body = json.dumps(data).encode()
    head = {'type': kind, 'version': '1.5.0', 'data_length': len(body)}
    if payload:
        head['payload_length'] = len(payload)
    writer.write(json.dumps(head).encode() + b'\n' + body + payload)
    await writer.drain()


def voice_of(data):
    voice = data.get('voice')
    return voice.get('name') if isinstance(voice, dict) else None


async def handle(bridge, reader, writer):
    stream = None  # set while Home Assistant is sending text piece by piece
    try:
        while True:
            kind, data, _ = await read_event(reader)
            if kind == 'describe':
                await write_event(writer, 'info', bridge.info())
            elif kind == 'synthesize' and stream is None:
                output = Output(writer)
                try:
                    sentences, _ = take_sentences(clean_for_speech(data.get('text', '')), final=True)
                    for sentence in join_short(sentences):
                        await bridge.speak(sentence, voice_of(data), output)
                    await output.finish()
                except Exception as error:  # noqa: BLE001 - tell Home Assistant rather than go silent
                    LOG.error('Could not speak: %s', error)
                    await write_event(writer, 'error', {'text': 'Neither voice could speak', 'code': 'tts-failed'})
            elif kind == 'synthesize-start':
                stream = {'voice': voice_of(data), 'text': '', 'queue': asyncio.Queue(), 'output': Output(writer)}

                async def speaker(state):
                    queue, finished = state['queue'], False
                    while not finished and (sentence := await queue.get()) is not None:
                        # A short sentence is often followed straight away by another ("Okay, alarm off." then
                        # "Good morning!"): wait a moment, and say them together if they're still short.
                        while sentence not in OPENERS and len(sentence) + 2 + JOIN_SHORT <= JOIN_UP_TO:
                            try:
                                following = await asyncio.wait_for(queue.get(), JOIN_WAIT_S)
                            except asyncio.TimeoutError:
                                break
                            if following is None:
                                finished = True
                                break
                            joined = join_short([sentence, following])
                            if len(joined) == 1:
                                sentence = joined[0]
                                continue
                            await bridge.speak(sentence, state['voice'], state['output'])
                            sentence = following
                        await bridge.speak(sentence, state['voice'], state['output'])

                stream['task'] = asyncio.create_task(speaker(stream))
            elif kind == 'synthesize-chunk' and stream is not None:
                stream['text'] += data.get('text', '')
                sentences, stream['text'] = take_sentences(stream['text'])
                for sentence in sentences:
                    stream['queue'].put_nowait(sentence)
            elif kind == 'synthesize-stop' and stream is not None:
                sentences, _ = take_sentences(stream['text'], final=True)
                for sentence in sentences:
                    stream['queue'].put_nowait(sentence)
                stream['queue'].put_nowait(None)
                try:
                    await stream['task']
                    await stream['output'].finish()
                except Exception as error:  # noqa: BLE001
                    LOG.error('Could not speak: %s', error)
                    await write_event(writer, 'error', {'text': 'Neither voice could speak', 'code': 'tts-failed'})
                await write_event(writer, 'synthesize-stopped', {})
                stream = None
    except (ConnectionError, asyncio.IncompleteReadError, json.JSONDecodeError):
        pass
    finally:
        if stream and 'task' in stream:
            stream['task'].cancel()
        writer.close()


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=10210)
    parser.add_argument('--kokoro', required=True)
    parser.add_argument('--piper-host', required=True)
    parser.add_argument('--piper-port', type=int, default=10200)
    parser.add_argument('--piper-voice', default='en_GB-alan-medium')
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
    bridge = Bridge(args.kokoro, args.piper_host, args.piper_port, args.piper_voice)
    server = await asyncio.start_server(lambda r, w: handle(bridge, r, w), '127.0.0.1', args.port)
    warming = asyncio.create_task(bridge.warm_up())  # noqa: F841 - kept so it isn't cleaned up while running
    LOG.info('Ready on 127.0.0.1:%d', args.port)
    async with server:
        await server.serve_forever()


if __name__ == '__main__':
    asyncio.run(main())
