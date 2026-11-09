"""Listens to a radio station for a few seconds and asks the speech recognition what's being sung.

Used only for lining up radio lyrics (see radio_sync.py). The station's sound comes from the broadcaster, exactly
as when you listen; it goes no further than this server. It's turned into words by the speech recognition your
voice assistant already uses (a Wyoming service, such as Parakeet or Whisper), so nothing new leaves the house.
Nothing is saved: the audio and words are only in memory while one song is matched.
"""
from __future__ import annotations

import asyncio
import json
import time

from aiohttp import ClientTimeout
from homeassistant.core import HomeAssistant

from .icy import IcyStrip
from .radio_sync import RECORD_SECONDS
from .station_clock import Notes

RADIO_BROWSER = ('https://de1.api.radio-browser.info', 'https://de2.api.radio-browser.info', 'https://fi1.api.radio-browser.info')
RATE = 16000
BYTES_PER_SECOND = RATE * 2
RECORD_TIMEOUT = 45
TRANSCRIBE_TIMEOUT = 30
HEADERS = {'User-Agent': 'echo-robot-dashboard/1.0'}
# Asked the way Music Assistant asks for the Echo, with song titles: some stations then send less catch-up audio.
STREAM_HEADERS = {**HEADERS, 'Icy-MetaData': '1'}
QUICK = ClientTimeout(total=10)
STREAM = ClientTimeout(total=None, sock_connect=10, sock_read=15)  # a station never finishes, so no overall limit
PEEK_SECONDS = 8       # longest a look at the station's clock takes
PEEK_IN_STEP = 6       # title blocks arriving in step with the station's clock needed (about 3 seconds)


class Unsupported(Exception):
    """This station can't be listened to like this (a playlist-style stream, say)."""


async def stream_url(session, content_id: str, known: dict) -> str:
    """The station's own address. Music Assistant names Radio Browser stations by their id."""
    cid = str(content_id or '')
    if cid in known:
        return known[cid]
    if cid.startswith('radiobrowser://radio/'):
        uuid = cid.rsplit('/', 1)[-1]
        url = None
        for server in RADIO_BROWSER:
            try:
                async with session.get(f'{server}/json/stations/byuuid/{uuid}', headers=HEADERS, timeout=QUICK) as r:
                    if r.status == 200:
                        found = await r.json(content_type=None)
                        if found:
                            url = found[0].get('url_resolved') or found[0].get('url')
                            break
            except Exception:  # noqa: BLE001 - try the next server
                continue
        if not url:
            raise Unsupported('station not found')
    elif cid.startswith(('http://', 'https://')):
        url = cid
    else:
        raise Unsupported('not a radio station')
    # Playlist-style streams (the BBC's) arrive in chunks, so the moment of connecting means nothing for timing.
    if '.m3u8' in url.lower() or '.isml' in url.lower():
        raise Unsupported('playlist stream')
    known[cid] = url
    return url


def ffmpeg_binary(hass: HomeAssistant) -> str:
    try:
        from homeassistant.components.ffmpeg import get_ffmpeg_manager
        return get_ffmpeg_manager(hass).binary
    except Exception:  # noqa: BLE001 - Home Assistant's image has it on the path anyway
        return 'ffmpeg'


async def record(hass: HomeAssistant, session, url: str, info: dict | None = None) -> tuple[bytes, float, float]:
    """About RECORD_SECONDS of the station as 16 kHz mono audio, and when the first sound arrived (and the last).

    A station sends a burst of the last few seconds first, then keeps up in real time, just as it did for the Echo.
    It's asked exactly as Music Assistant asks (with song titles), since some stations send a different burst
    otherwise; the titles are taken back out before the sound is decoded.
    info, if given, is filled in with the bytes received from the station (titles included), this connection's
    own port, so the connection watch can tell this listen apart from the Echo's, and what the title blocks said
    ('notes', a station_clock.Notes).
    """
    want = int(RECORD_SECONDS * BYTES_PER_SECOND)
    proc = await asyncio.create_subprocess_exec(
        ffmpeg_binary(hass), '-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-f', 's16le', '-ac', '1', '-ar', str(RATE), 'pipe:1',
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
    first = {'at': None}
    info = info if info is not None else {}
    info['raw'] = 0
    info['notes'] = Notes()

    async def feed(response, strip):
        try:
            async for chunk in response.content.iter_chunked(8192):
                now = time.time()
                if first['at'] is None:
                    first['at'] = now
                info['raw'] += len(chunk)
                proc.stdin.write(strip.feed(chunk, now))
                await proc.stdin.drain()
        except (ConnectionError, asyncio.CancelledError):
            pass

    pcm = bytearray()
    try:
        async with session.get(url, headers=STREAM_HEADERS, timeout=STREAM) as response:
            if response.status != 200:
                raise Unsupported(f'station answered {response.status}')
            try:
                info['port'] = response.connection.transport.get_extra_info('sockname')[1]
            except Exception:  # noqa: BLE001 - only used to tell this listen apart from the Echo's connection
                info['port'] = None
            try:
                metaint = int(response.headers.get('icy-metaint') or 0)
            except ValueError:
                metaint = 0
            feeder = asyncio.create_task(feed(response, IcyStrip(metaint, info['notes'])))
            try:
                async with asyncio.timeout(RECORD_TIMEOUT):
                    while len(pcm) < want:
                        chunk = await proc.stdout.read(want - len(pcm))
                        if not chunk:
                            break
                        pcm.extend(chunk)
            finally:
                feeder.cancel()
    finally:
        if proc.returncode is None:
            proc.kill()
        await proc.wait()
    if len(pcm) < want or first['at'] is None:
        raise Unsupported('could not record the station')
    return bytes(pcm), first['at'], time.time()


async def peek(session, url: str, info: dict) -> Notes:
    """A few seconds of the station, only to read its title blocks (nothing is decoded or heard): enough for a
    station that sends its own clock to say when the playing song began, and how far behind that clock its sound
    arrives here. info is filled in like record()'s, plus 'raw_per_second' (bytes the station sends per second of
    sound, titles included), so the connection watch can measure the Echo's connection."""
    notes = Notes()
    info.update({'raw': 0, 'notes': notes, 'port': None, 'raw_per_second': 0})
    async with session.get(url, headers=STREAM_HEADERS, timeout=STREAM) as response:
        if response.status != 200:
            raise Unsupported(f'station answered {response.status}')
        try:
            info['port'] = response.connection.transport.get_extra_info('sockname')[1]
        except Exception:  # noqa: BLE001 - only used to tell this look apart from the Echo's connection
            info['port'] = None
        try:
            metaint = int(response.headers.get('icy-metaint') or 0)
            kbit = int(response.headers.get('icy-br') or 0)
        except ValueError:
            metaint, kbit = 0, 0
        if not metaint:
            return notes  # no title blocks: nothing to read
        strip = IcyStrip(metaint, notes)
        began = time.time()
        try:
            async with asyncio.timeout(PEEK_SECONDS):
                async for chunk in response.content.iter_chunked(8192):
                    now = time.time()
                    info['raw'] += len(chunk)
                    strip.feed(chunk, now)
                    if notes.caught_up() >= PEEK_IN_STEP:
                        break  # in step with the station's clock: enough to know, song or not
                    if not notes.blocks and now - began > 3:
                        break  # this station's title blocks carry no clock
        except TimeoutError:
            pass
    # Sound bytes per second: from the station's clock (a block every metaint bytes), or its stated bit rate.
    clocks = [c for _, c in notes.blocks]
    rate = 0.0
    if len(clocks) >= 4 and clocks[-1] > clocks[0]:
        rate = metaint * (len(clocks) - 1) / (clocks[-1] - clocks[0])
    elif kbit:
        rate = kbit * 125.0
    if rate and strip.sound:
        info['raw_per_second'] = info['raw'] / (strip.sound / rate)
    return notes


def find_speech(hass: HomeAssistant) -> tuple[str, int]:
    """The speech recognition the voice assistant uses, if it's a Wyoming service: (host, port)."""
    from homeassistant.helpers import entity_registry as er
    engine = None
    try:
        from homeassistant.components.assist_pipeline import async_get_pipeline
        engine = async_get_pipeline(hass).stt_engine
    except Exception:  # noqa: BLE001 - fall back to any Wyoming speech recognition
        engine = None
    registry = er.async_get(hass)
    entries = []
    if engine:
        entity = registry.async_get(engine)
        if entity and entity.config_entry_id:
            entries.append(hass.config_entries.async_get_entry(entity.config_entry_id))
    for entity in registry.entities.values():
        if entity.domain == 'stt' and entity.platform == 'wyoming' and entity.config_entry_id:
            entries.append(hass.config_entries.async_get_entry(entity.config_entry_id))
    for entry in entries:
        if entry and entry.domain == 'wyoming' and entry.data.get('host') and entry.data.get('port'):
            return entry.data['host'], int(entry.data['port'])
    raise Unsupported('no Wyoming speech recognition found')


def _event(kind: str, data: dict | None = None, payload: bytes = b'') -> bytes:
    body = json.dumps(data or {}).encode()
    head = {'type': kind, 'version': '1.5.0', 'data_length': len(body)}
    if payload:
        head['payload_length'] = len(payload)
    return json.dumps(head).encode() + b'\n' + body + payload


async def transcribe(host: str, port: int, pcm: bytes, language: str = 'en') -> str:
    """Words heard in a piece of audio, from a Wyoming speech recognition service."""
    reader, writer = await asyncio.wait_for(asyncio.open_connection(host, port), 10)
    try:
        form = {'rate': RATE, 'width': 2, 'channels': 1}
        writer.write(_event('transcribe', {'language': language}) + _event('audio-start', form))
        for i in range(0, len(pcm), 4096):
            writer.write(_event('audio-chunk', form, pcm[i:i + 4096]))
        writer.write(_event('audio-stop'))
        await writer.drain()
        async with asyncio.timeout(TRANSCRIBE_TIMEOUT):
            while True:
                line = await reader.readline()
                if not line:
                    return ''
                head = json.loads(line)
                data = head.get('data') or {}
                if head.get('data_length'):
                    data = {**data, **json.loads(await reader.readexactly(head['data_length']))}
                if head.get('payload_length'):
                    await reader.readexactly(head['payload_length'])
                if head.get('type') == 'transcript':
                    text = str(data.get('text', '')).strip()
                    return '' if text.startswith('ERROR') else text
    finally:
        writer.close()
