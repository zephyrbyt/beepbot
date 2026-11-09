"""Finds how far into a song the radio is, by listening.

A station only says which song is on, not how far in, and its "new song" signal is often early or late. So the
server opens its own connection to the station, turns about 20 seconds of it into words with the speech
recognition Home Assistant already uses, and finds those words in the song's synced lyrics.

The timing works out because a station hands every new listener the same few seconds of catch-up audio. The
Echo got that when it tuned in, and so does the server, so at the moment the server connects, the Echo is
playing what the server's recording starts with. Whatever is left over (Music Assistant's own buffer) is the
same every time, and the Earlier/Later setting covers it.

Everything here is plain Python, so it can be tested without Home Assistant. Nothing is kept: the audio and the
words heard are only in memory while one song is being matched.
"""
from __future__ import annotations

import difflib
import re
import statistics
import xml.etree.ElementTree as ET

RECORD_SECONDS = 20.0   # how much of the station to listen to
WINDOW_SECONDS = 5.0    # it's transcribed in short overlapping pieces, so each word's place is roughly known
HOP_SECONDS = 2.5
MIN_WORDS = 3           # a piece with fewer words heard says too little
MIN_RATIO = 0.5         # how closely a piece must match some of the lyrics to count
AGREE_SECONDS = 2.0     # pieces that put the song within this of each other agree
LINE_CAP_SECONDS = 6.0
WORD_PACE_SECONDS = 0.28  # how long a sung word takes, on average (best fit on real radio recordings)
CLOSE_CALL = 1.0        # places scoring within this of the best are a close call (about a third of a well-heard piece)
NEAR_SECONDS = 6.0      # on a later listen, a place this close to where the song is already known to be...
NEAR_SHARE = 0.25       # ...wins if it scores at least this share of the best place anywhere (a chorus heard again)

_TIME = re.compile(r'\[(\d+):(\d+(?:\.\d+)?)\]')
_WORD = re.compile(r"[a-z0-9']+")
_NUMBERS = {'0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven',
            '8': 'eight', '9': 'nine', '10': 'ten'}


# Sung shorthand, written out: speech recognition and lyric sites don't agree on these.
_SPOKEN = {'wanna': 'want to', 'gonna': 'going to', 'gotta': 'got to', 'kinda': 'kind of', 'outta': 'out of',
           'lotta': 'lot of', 'hafta': 'have to', 'tryna': 'trying to', 'gimme': 'give me', 'lemme': 'let me',
           'dunno': 'dont know', 'cause': 'because', 'cuz': 'because', 'coz': 'because', 'til': 'until',
           'till': 'until', 'em': 'them', 'ya': 'you', 'yeah': 'yes', 'yea': 'yes', 'ok': 'okay', 'alright': 'all right'}


def _sound(w: str) -> str:
    """Long words compared by their first few consonants, so "rimbrand" and "rembrandt" count as the same."""
    if len(w) < 5:
        return w
    skeleton = w[0] + re.sub(r'[aeiouy]', '', w[1:])
    skeleton = re.sub(r'(.)\1+', r'\1', skeleton.replace('ph', 'f').replace('ck', 'k').replace('z', 's'))
    return '~' + skeleton[:4]


def words(text: str) -> list[str]:
    """Lower case, no punctuation, apostrophes dropped ("don't" -> "dont"), small numbers and sung shorthand
    written out, long words reduced to how they sound."""
    out = []
    for w in _WORD.findall(str(text).lower().replace('’', "'")):
        w = w.replace("'", '').replace('in', 'ing') if w.endswith("in'") else w.replace("'", '')
        if not w:
            continue
        w = _NUMBERS.get(w, w)
        out.extend(_sound(x) for x in _SPOKEN.get(w, w).split())
    return out


def parse_lrc(lrc: str) -> list[tuple[float, str]]:
    """Synced lyrics ("[01:02.50]Some words") as (seconds, text), in order. Lines can have more than one time."""
    lines = []
    for raw in str(lrc or '').splitlines():
        times = [int(m.group(1)) * 60 + float(m.group(2)) for m in _TIME.finditer(raw)]
        text = _TIME.sub('', raw).strip()
        lines.extend((t, text) for t in times)
    lines.sort(key=lambda x: x[0])
    return lines


def word_times(lines: list[tuple[float, str]]) -> list[tuple[str, float]]:
    """Each lyric word with roughly when it's sung, for lyrics timed by the line: sung at a natural pace from the
    line's start, with any time left before the next line as a pause (measured on real radio: spreading the words
    over the whole gap put songs about 0.7 seconds too far along)."""
    out = []
    for i, (start, text) in enumerate(lines):
        ws = words(text)
        if not ws:
            continue
        end = lines[i + 1][0] if i + 1 < len(lines) else start + LINE_CAP_SECONDS
        gap = max(0.5, min(end - start, LINE_CAP_SECONDS))
        span = min(gap, max(0.4, len(ws) * WORD_PACE_SECONDS))
        out.extend((w, start + span * (k + 0.5) / len(ws)) for k, w in enumerate(ws))
    return out


def ttml_word_times(ttml: str) -> list[tuple[str, float]]:
    """Each word with when it's really sung, from word-timed TTML (Better Lyrics, Apple Music, NetEase).
    Background vocals are left out, as they're rarely heard clearly. Empty if the words aren't timed.
    Apple times syllables ("beau" "ti" "ful"); pieces with no space between them are joined back into a word."""
    try:
        root = ET.fromstring(ttml)
    except ET.ParseError:
        return []
    pieces = []  # (text, start, ends a word)

    def walk(node, background):
        role = next((v for k, v in node.attrib.items() if k.endswith('role')), '')
        background = background or role == 'x-bg'
        tag = node.tag.rsplit('}', 1)[-1]
        if tag == 'p' and pieces:
            pieces[-1] = (pieces[-1][0], pieces[-1][1], True)  # a new line always starts a new word
        if tag == 'span' and node.get('begin') and not len(node) and not background:
            start, text = _ttml_seconds(node.get('begin')), node.text or ''
            if start is not None and text.strip():
                pieces.append((text, start, text[-1:].isspace() or bool(node.tail and node.tail[:1].isspace())))
        elif tag == 'span' and pieces and node.tail and node.tail[:1].isspace():
            pieces[-1] = (pieces[-1][0], pieces[-1][1], True)
        for child in node:
            walk(child, background)
    walk(root, False)
    out, text, began = [], '', None
    for piece, start, done in pieces:
        if began is None:
            began = start
        text += piece
        if done:
            out.extend((w, began) for w in words(text))
            text, began = '', None
    if text:
        out.extend((w, began) for w in words(text))
    out.sort(key=lambda x: x[1])
    return out


def _ttml_seconds(value):
    if not value:
        return None
    value = value.strip()
    try:
        if value.endswith('s'):
            return float(value[:-1])
        total = 0.0
        for part in value.split(':'):
            total = total * 60 + float(part)
        return total
    except ValueError:
        return None


def _candidates(heard: list[str], lyric: list[tuple[str, float]], clip_start: float, clip_len: float):
    """Places in the lyrics this piece could be, as (offset, weight, ratio). The offset is the song's position
    at the very start of the recording."""
    names = [w for w, _ in lyric]
    span = len(heard) + 3
    scored = []
    for j in range(max(1, len(names) - len(heard) + 1)):
        sm = difflib.SequenceMatcher(None, heard, names[j:j + span], autojunk=False)
        # Scored against a full-length stretch even at the end of the song, so the last chorus isn't favoured.
        ratio = 2 * sum(b.size for b in sm.get_matching_blocks()) / (len(heard) + span)
        if ratio >= MIN_RATIO:
            scored.append((ratio, j, sm))
    scored.sort(key=lambda x: -x[0])
    picked = []
    for ratio, j, sm in scored:
        pairs, sung = [], []
        for block in sm.get_matching_blocks():
            for n in range(block.size):
                a, b = block.a + n, j + block.b + n
                heard_at = clip_start + clip_len * (a + 0.5) / len(heard)
                pairs.append(lyric[b][1] - heard_at)
                sung.append(lyric[b][1])
        if len(pairs) < 2:
            continue
        offset = statistics.median(pairs)
        if any(abs(offset - o) < 1.0 for o, _, _ in picked):
            continue  # the same place again
        # Where in the piece the words fell is only known if singing filled it, so a mostly quiet piece counts less.
        filled = min(1.0, (max(sung) - min(sung) + clip_len / len(heard)) / clip_len)
        picked.append((offset, ratio * len(pairs) * filled, ratio))
        if len(picked) >= 4:
            break
    return picked


def estimate(pieces: list[tuple[float, float, str]], lrc: str, expect: float | None = None, ttml: str = '',
             near: list[float] | None = None) -> dict:
    """Where the song was when the recording started.

    pieces: (start within the recording, length, words heard) for each transcribed piece.
    ttml: word-timed lyrics, if there are any (more exact than the lines in lrc).
    expect: roughly where the song should be then, from when the station said it changed. Only used to choose
    between equally good answers, like a chorus that comes round more than once.
    near: on a later listen, where the song is already known to be (and any place another listen suggested).
    A decent match close to one of these is taken over a slightly better one far away, because a chorus heard
    again matches every time it comes round, and jumping to another one is what makes lyrics land in the wrong place.
    Returns {'ok': True, 'offset': seconds, 'agree': pieces that agree, 'pieces': pieces with words} or
    {'ok': False, 'reason': ...}.
    """
    # Word-timed lyrics give each word's real time; otherwise a line's words are spread across it.
    lyric = (ttml_word_times(ttml) if ttml else []) or word_times(parse_lrc(lrc))
    if len(lyric) < 8:
        return {'ok': False, 'reason': 'no lyrics'}
    found = []  # (offset, weight, piece number)
    heard_any = 0
    for n, (start, length, text) in enumerate(pieces):
        heard = words(text)
        if len(heard) < MIN_WORDS:
            continue
        heard_any += 1
        places = _candidates(heard, lyric, start, length)
        total = sum(w for _, w, _ in places) or 1.0
        for offset, weight, _ in places:
            found.append((offset, weight * weight / total, n))  # a chorus that fits three places counts a third each
    if not found:
        return {'ok': False, 'reason': 'no singing heard' if not heard_any else 'no match', 'pieces': heard_any}
    # Group answers that agree. Each piece counts once per group, with its best match there.
    groups = []
    for offset, weight, n in sorted(found):
        for g in groups:
            if abs(offset - g['centre']) <= AGREE_SECONDS:
                if weight > g['best'].get(n, (0, 0))[0]:
                    g['best'][n] = (weight, offset)
                g['centre'] = statistics.median(o for _, o in g['best'].values())
                break
        else:
            groups.append({'centre': offset, 'best': {n: (weight, offset)}})
    for g in groups:
        g['score'] = sum(w for w, _ in g['best'].values())
    groups.sort(key=lambda g: -g['score'])
    top = groups[0]
    close_by = [g for g in groups if near and any(abs(g['centre'] - p) <= NEAR_SECONDS for p in near)]
    if close_by and close_by[0]['score'] >= top['score'] * NEAR_SHARE:
        # A line repeated a few seconds apart: of the near places that score about as well, the nearest.
        best = close_by[0]['score']
        top = min((g for g in close_by if best - g['score'] < CLOSE_CALL),
                  key=lambda g: min(abs(g['centre'] - p) for p in near))
        close = [top]
    else:
        # Close calls (a repeated chorus): the one nearer where the song should be, or not sure if that isn't known.
        close = [g for g in groups if top['score'] - g['score'] < CLOSE_CALL]
    if len(close) > 1:
        if expect is None:
            return {'ok': False, 'reason': 'not sure', 'pieces': heard_any, 'places': sorted(round(g['centre'], 1) for g in close)}
        top = min(close, key=lambda g: abs(g['centre'] - expect))
    agree = len(top['best'])
    strong = max(w for w, _ in top['best'].values())
    if agree < 2 and strong < 4:
        return {'ok': False, 'reason': 'not sure', 'pieces': heard_any}
    weights = sorted(((o, w) for w, o in top['best'].values()))
    total, run, offset = sum(w for _, w in weights), 0.0, weights[0][0]
    for o, w in weights:  # weighted median
        run += w
        if run >= total / 2:
            offset = o
            break
    return {'ok': True, 'offset': round(offset, 2), 'agree': agree, 'pieces': heard_any}


def switch_point(pieces: list[tuple[float, float, str]], lrc: str, old: float, new: float, ttml: str = ''):
    """A listen that heard the song somewhere other than expected (a radio edit that cut a part): where, within the
    recording, the switch from the old place to the new one happened: (seconds into the recording, how sure), or
    None if no piece heard only the new place. How sure:
    'between': a piece still at the old place came before it, so the switch is between the two.
    'by': at or before then. The pieces before fitted both places (a chorus sung at both, which is where a radio
    edit usually cuts), so jumping anywhere up to there shows the same words.
    'before': every piece heard the new place, so the switch came before the recording began (0 is returned).
    old / new: where the song was at the start of the recording, by the old timing and by this listen."""
    lyric = (ttml_word_times(ttml) if ttml else []) or word_times(parse_lrc(lrc))
    if len(lyric) < 8:
        return None
    before, after, both = [], [], []
    for start, length, text in pieces:
        heard = words(text)
        if len(heard) < MIN_WORDS:
            continue
        places = [o for o, _, _ in _candidates(heard, lyric, start, length)]
        at_old = any(abs(o - old) <= AGREE_SECONDS for o in places)
        at_new = any(abs(o - new) <= AGREE_SECONDS for o in places)
        middle = start + length / 2
        (both if at_old and at_new else before if at_old else after if at_new else []).append(middle)
    if not after:
        return None
    first_new = min(after)
    old_before = [b for b in before if b < first_new]
    if old_before:
        # Between the middle of the last piece still at the old place and the first one at the new place.
        return round((max(old_before) + first_new) / 2, 2), 'between'
    if any(b < first_new for b in both):
        return round(max(0.0, first_new - HOP_SECONDS), 2), 'by'
    return 0.0, 'before'


def pieces_of(total_seconds: float) -> list[tuple[float, float]]:
    """(start, length) of each overlapping piece of a recording."""
    out, start = [], 0.0
    while start + WINDOW_SECONDS <= total_seconds + 0.01:
        out.append((start, WINDOW_SECONDS))
        start += HOP_SECONDS
    return out


# ---- how later listens of the same song change its timing ----
# The Echo plays in real time and how far behind live it is gets measured, so a song's timing doesn't really drift.
# Later listens are there to catch a wrong first answer (a chorus matched in the wrong place), not to nudge: each
# listen is only good to about a second, so nudging towards every one made the lyrics wander early and late.

AGREE_MS = 2000           # two listens this close agree
STILL_MS = 1500           # a later listen this close to the timing is measuring noise: nothing moves
CONFIRM_MS = 1000         # a move of up to MOVE_BIG_MS needs two listens in a row agreeing this closely
MOVE_BIG_MS = 8000
# A song timed by the station's own clock is exact for the station's version; a listen is usually within half a second
# but now and then a second or more out, so it takes two listens in a row agreeing it's out by more than this (lyrics
# for a version with another intro, or a radio edit that cut a part) to move it. Measured on Heart: two listens in a
# row never agreed wrongly by this much except where the radio edit really had cut a part.
STATION_STILL_MS = 2000


def _maybe(heard: dict) -> dict:
    kept = {'started': heard['started'], 'agree': heard.get('agree', 1)}
    if heard.get('cut_at') is not None:
        kept['cut_at'] = heard['cut_at']  # where a radio edit's cut seemed to be, for learning if it's confirmed
    return kept


def combine(first: dict, second: dict) -> dict:
    """Two listens to the same song. If they agree, their average, weighted by how many pieces backed each. If not,
    the first stands and the second is kept as a possible move, made only if the next listen agrees with it: one
    listen that matched a chorus somewhere else must never move the lyrics on its own."""
    a, b = first.get('agree', 1), second.get('agree', 1)
    if abs(first['started'] - second['started']) <= AGREE_MS:
        started = round((first['started'] * a + second['started'] * b) / (a + b))
        return {'ok': True, 'started': started, 'agree': a + b, 'checked': True}
    return {'ok': True, 'started': first['started'], 'agree': a, 'checked': True, 'pending': _maybe(second)}


def follow_on(current: dict, heard: dict, still_ms: int | None = None) -> dict:
    """A later listen while the song plays. Close to the timing (within still_ms): nothing moves. Further out: kept as
    a possible move, made only when the next listen agrees with it (the timing really was out), to where the two of
    them put it."""
    base = {k: v for k, v in current.items() if k != 'pending'}
    diff = heard['started'] - current['started']
    if abs(diff) <= (STILL_MS if still_ms is None else still_ms):
        return {**base, 'checked': True}
    pending = current.get('pending')
    close = CONFIRM_MS if abs(diff) <= MOVE_BIG_MS else AGREE_MS
    if pending and abs(pending['started'] - heard['started']) <= close:
        a, b = pending.get('agree', 1), heard.get('agree', 1)
        return {'ok': True, 'started': round((pending['started'] * a + heard['started'] * b) / (a + b)), 'agree': a + b, 'checked': True}
    return {**base, 'checked': True, 'pending': _maybe(heard)}
