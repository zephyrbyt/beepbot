"""Find time-stamped lyrics for a song, word-by-word where any source has it.

No Home Assistant code in this file, so it can be tested by itself. Nothing is saved to disk,
and song details and lyrics are never written to the log.

Sources, in order. The first with word (or syllable) timing wins; otherwise the best line-timed one:
  1. Better Lyrics (https://docs.betterlyrics.org): syllable timing, but only for songs already in its cache,
     as it isn't issuing keys for fresh lookups.
  2. Apple Music, through Paxsenix's Lyrically API (https://lyrics.paxsenix.org): syllable or line timing.
     The song is found with Apple's public iTunes search first.
  3. NetEase Cloud Music: word timing for most songs, line timing otherwise.
  4. LRCLIB (https://lrclib.net): line timing, community-made.
Each is sent the song's title and artist (and album and length where it uses them), from this server.
"""
from __future__ import annotations

from collections import OrderedDict
import difflib
import html
import json
import re
import time
import xml.etree.ElementTree as ET

BETTER_LYRICS = 'https://api.betterlyrics.org/getLyrics'
ITUNES_SEARCH = 'https://itunes.apple.com/search'
APPLE_LYRICS = 'https://lyrics.paxsenix.org/apple-music/lyrics'
NETEASE_SEARCH = 'https://music.163.com/api/cloudsearch/pc'
NETEASE_LYRICS = 'https://music.163.com/api/song/lyric/v1'
LRCLIB_GET = 'https://lrclib.net/api/get'
LRCLIB_SEARCH = 'https://lrclib.net/api/search'
MIN_SCORE = 0.5        # below this, Better Lyrics isn't confident it found the right song
DURATION_SLACK = 3     # seconds a search result may differ by and still count as the same recording
VERSION_SLACK = 6      # a little more for other services, whose lengths are rounded differently
SAME_TITLE = 0.85      # how alike two titles must be to count as the same song
MAX_BYTES = 2_000_000
CACHE_SIZE = 64
NOTHING_FOUND_KEEP = 6 * 3600  # look again after this long, in case a song has been added
LINE_ORDER = ('betterlyrics', 'apple', 'lrclib', 'netease')  # best line-timed source first
SOURCES = ('betterlyrics', 'apple', 'netease', 'lrclib')     # the order they're asked in (the first with words wins)

NOTHING = {'source': None}
_INSTRUMENTAL = {'source': None, 'instrumental': True}

_EXTRA_AFTER_DASH = re.compile(r'\s+[-–]\s+(?:\d{4}\s+)?(?:(?:digital\s+)?remaster|radio edit|single version|album version|mono|stereo|bonus track|\d{4}\s+mix).*$', re.I)
_EXTRA_IN_BRACKETS = re.compile(r'\s*[(\[](?:feat\.?|ft\.?|with|(?:\d{4}\s+)?(?:digital\s+)?remaster(?:ed)?(?:\s+\d{4})?|radio edit|single version|album version)[^)\]]*[)\]]', re.I)
_MORE_ARTISTS = re.compile(r'\s*(?:,|&|\bfeat\.?|\bft\.?|\bx\b)\s+.*$', re.I)
_CREDIT = re.compile(r'^[^\[]*[㐀-鿿][^:：]{0,12}[:：]')  # NetEase's Chinese credit lines ("作词 : ...")


def tidy_title(title: str) -> str:
    """Drops additions like "- Remastered 2011" or "(feat. Someone)" that services don't match on."""
    return _EXTRA_IN_BRACKETS.sub('', _EXTRA_AFTER_DASH.sub('', title)).strip() or title


def first_artist(artist: str) -> str:
    """Spotify lists every artist ("A, B"); services usually want just the first."""
    return _MORE_ARTISTS.sub('', artist).strip() or artist


def variants(title: str, artist: str) -> list[tuple[str, str]]:
    """Exact details first, then tidier ones. Better Lyrics only answers when they match closely."""
    tried = []
    for pair in ((title, artist), (title, first_artist(artist)), (tidy_title(title), first_artist(artist))):
        if pair not in tried:
            tried.append(pair)
    return tried


def _plain(text: str) -> str:
    return re.sub(r'\s+', ' ', re.sub(r"[^\w\s]", '', str(text).casefold().replace('&', 'and'))).strip()


def same_song(title: str, artist: str, their_title: str, their_artists: str, their_seconds: float | None, seconds: int) -> bool:
    """Whether a search result is this song: the title alike, the main artist among theirs, the length close."""
    # Compared without spaces, so "S & M" and "S&M" are the same title.
    a, b = _plain(tidy_title(title)).replace(' ', ''), _plain(tidy_title(their_title)).replace(' ', '')
    if not a or not b or difflib.SequenceMatcher(None, a, b).ratio() < SAME_TITLE:
        return False
    singer, theirs = _plain(first_artist(artist)), _plain(their_artists)
    if not singer or (singer not in theirs and difflib.SequenceMatcher(None, singer, theirs).ratio() < SAME_TITLE):
        return False
    return not (seconds and their_seconds and abs(their_seconds - seconds) > VERSION_SLACK)


def _seconds(value: str | None) -> float | None:
    """TTML times: "12.5s", "1:02.5" or "00:01:02.5"."""
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


def _stamp(seconds: float) -> str:
    return f'[{int(seconds // 60):02d}:{seconds % 60:05.2f}]'


def ttml_lines(ttml: str) -> tuple[list[tuple[float, str]], bool]:
    """(start, text) for each line of TTML, and whether its words have their own times."""
    try:
        root = ET.fromstring(ttml)
    except ET.ParseError:
        return [], False
    lines, worded = [], False
    for p in root.iter():
        if not p.tag.endswith('}p') and p.tag != 'p':
            continue
        spans = [s for s in p.iter() if (s.tag.endswith('}span') or s.tag == 'span') and s.get('begin')]
        worded = worded or bool(spans)
        start = _seconds(p.get('begin')) if p.get('begin') else (_seconds(spans[0].get('begin')) if spans else None)
        parts = []

        def walk(node):
            role = next((v for k, v in node.attrib.items() if k.endswith('role')), '')
            if role == 'x-bg':
                return  # background vocals
            if node.text:
                parts.append(node.text)
            for child in node:
                walk(child)
                if child.tail:
                    parts.append(child.tail)
        walk(p)
        text = re.sub(r'\s+', ' ', ''.join(parts)).strip()
        if start is not None and text:
            lines.append((start, text))
    return lines, worded


def lrc_of(lines: list[tuple[float, str]]) -> str:
    return '\n'.join(f'{_stamp(t)}{text}' for t, text in sorted(lines))


def yrc_to_ttml(yrc: str) -> str:
    """NetEase's word-timed lyrics ("[start,length](start,length,0)word...") as TTML the screen can read."""
    out = []
    for raw in str(yrc or '').splitlines():
        head = re.match(r'^\[(\d+),(\d+)\]', raw)
        if not head:
            continue  # credits arrive as JSON lines
        words = re.findall(r'\((\d+),(\d+),\d+\)([^(]*)', raw[head.end():])
        text = ''.join(w for _, _, w in words)
        if not text.strip() or _CREDIT.match(text):
            continue
        start, length = int(head.group(1)) / 1000, int(head.group(2)) / 1000
        spans = ''.join(f'<span begin="{int(b) / 1000:.3f}s" end="{(int(b) + int(d)) / 1000:.3f}s">{html.escape(w, quote=False)}</span>'
                        for b, d, w in words if w)
        out.append(f'<p begin="{start:.3f}s" end="{start + length:.3f}s">{spans}</p>')
    if not out:
        return ''
    return '<tt xmlns="http://www.w3.org/ns/ttml"><body><div>' + ''.join(out) + '</div></body></tt>'


def tidy_lrc(lrc: str) -> str:
    """Drops credit lines and empty lines from a line-timed lyric."""
    keep = []
    for raw in str(lrc or '').splitlines():
        text = re.sub(r'^(\[\d+:\d+(?:\.\d+)?\])+', '', raw).strip()
        if re.match(r'^\[\d+:\d+', raw) and text and not _CREDIT.match(text):
            keep.append(raw)
    return '\n'.join(keep)


class Lookup:
    """`get` is an async function: get(url, params) -> (status, headers, body bytes)."""

    def __init__(self, get, clock=time.monotonic, sources=None):
        """sources: which services to ask, by name (SOURCES); None asks them all. Names it doesn't know are ignored."""
        self._get = get
        self._clock = clock
        self._cache: OrderedDict = OrderedDict()
        self._blocked_until: dict[str, float] = {}
        if isinstance(sources, str):
            sources = [sources]
        allowed = SOURCES if sources is None else {str(name).strip().casefold() for name in sources}
        self._sources = tuple(name for name in SOURCES if name in allowed)

    async def find(self, title: str, artist: str, album: str = '', duration: int = 0) -> dict:
        """{'source': name, 'ttml' and/or 'lrc', 'words': whether words are timed}, or {'source': None}.
        'lrc' is always there when anything is found, for lining up the radio."""
        key = (title.casefold(), artist.casefold(), album.casefold(), duration)
        hit = self._cache.get(key)
        if hit and hit[1] > self._clock():
            self._cache.move_to_end(key)
            return hit[0]
        found, certain, best = {}, True, None
        for name in self._sources:
            result, sure = await getattr(self, f'_{name}')(title, artist, album, duration)
            certain = certain and sure
            if result is _INSTRUMENTAL:
                found = {}
                break
            if result:
                found[result['source']] = result
                if result.get('words'):
                    best = result
                    break
        if best is None:
            best = next((found[name] for name in LINE_ORDER if name in found), None)
        # A network fault isn't an answer, so only remember what the services actually said.
        if best or certain:
            keep = float('inf') if best else self._clock() + NOTHING_FOUND_KEEP
            self._cache[key] = (best or NOTHING, keep)
            while len(self._cache) > CACHE_SIZE:
                self._cache.popitem(last=False)
        return best or NOTHING

    async def _fetch(self, name, url, params):
        """Returns (status, parsed JSON or None). Status 0 means it couldn't be reached."""
        if self._blocked_until.get(name, 0) > self._clock():
            return 0, None
        try:
            status, headers, body = await self._get(url, params)
        except Exception:  # noqa: BLE001 - any network fault just means "try the next source"
            return 0, None
        if status == 429:
            try:
                wait = float(headers.get('Retry-After', 60))
            except (TypeError, ValueError):
                wait = 60
            self._blocked_until[name] = self._clock() + min(wait, 3600)
            return 429, None
        if status != 200 or len(body) > MAX_BYTES:
            return status, None
        try:
            return 200, json.loads(body)
        except ValueError:
            return 0, None

    async def _betterlyrics(self, title, artist, album, duration):
        """Only cached songs, and its cache is keyed on all four details, so they're sent as given first."""
        tries = []
        for song, singer in variants(title, artist):
            params = {'s': song, 'a': singer}
            if album:
                params['al'] = album
            if duration:
                params['d'] = str(duration)
            tries.append(params)
        if album or duration:
            tries.append({'s': tidy_title(title), 'a': first_artist(artist)})  # without them, in case those differ
        for params in tries[:4]:
            status, data = await self._fetch('betterlyrics', BETTER_LYRICS, params)
            if isinstance(data, dict) and isinstance(data.get('ttml'), str) and data['ttml'].strip():
                score = data.get('score')
                if not isinstance(score, (int, float)) or score >= MIN_SCORE:
                    lines, worded = ttml_lines(data['ttml'])
                    return {'source': 'betterlyrics', 'ttml': data['ttml'], 'lrc': lrc_of(lines), 'words': worded}, True
            # 401 is its normal answer for a song not in its cache.
            if status not in (200, 401, 404):
                return None, False
        return None, True

    async def _apple(self, title, artist, album, duration):
        """Apple's own search finds the track (in the US store, which is what Paxsenix reads), then Paxsenix gives
        Apple's lyrics."""
        status, data = await self._fetch('itunes', ITUNES_SEARCH, {'term': f'{tidy_title(title)} {first_artist(artist)}', 'entity': 'song', 'limit': '25', 'country': 'US'})
        if status != 200 or not isinstance(data, dict):
            return None, status in (404,)
        matches = [r for r in data.get('results') or [] if isinstance(r, dict) and r.get('trackId')
                   and same_song(title, artist, str(r.get('trackName', '')), str(r.get('artistName', '')), (r.get('trackTimeMillis') or 0) / 1000 or None, duration)]
        if not matches:
            return None, True
        if duration:
            matches.sort(key=lambda r: abs((r.get('trackTimeMillis') or 0) / 1000 - duration))
        status, data = await self._fetch('paxsenix', APPLE_LYRICS, {'id': str(matches[0]['trackId'])})
        if status == 404:
            return None, True
        if status != 200 or not isinstance(data, dict):
            return None, False  # busy (it often says so) or down: not an answer
        ttml = data.get('ttmlContent') or ''
        lines, worded = ttml_lines(ttml) if ttml else ([], False)
        lrc = tidy_lrc(data.get('lrc') or '') or lrc_of(lines)
        if not lrc:
            return None, True
        words = worded and str(data.get('type', '')).lower() in ('syllable', 'word')
        result = {'source': 'apple', 'lrc': lrc, 'words': words}
        if ttml and lines:
            result['ttml'] = ttml
        return result, True

    async def _netease(self, title, artist, album, duration):
        status, data = await self._fetch('netease', NETEASE_SEARCH, {'s': f'{tidy_title(title)} {first_artist(artist)}', 'type': '1', 'limit': '20'})
        songs = ((data or {}).get('result') or {}).get('songs') if isinstance(data, dict) else None
        if status != 200 or not isinstance(songs, list):
            return None, status == 200
        matches = [s for s in songs if isinstance(s, dict) and s.get('id')
                   and same_song(title, artist, str(s.get('name', '')), ' '.join(str(a.get('name', '')) for a in s.get('ar') or [] if isinstance(a, dict)),
                                 (s.get('dt') or 0) / 1000 or None, duration)]
        if not matches:
            return None, True
        if duration:
            matches.sort(key=lambda s: abs((s.get('dt') or 0) / 1000 - duration))
        status, data = await self._fetch('netease', NETEASE_LYRICS, {'id': str(matches[0]['id']), 'lv': '1', 'yv': '1', 'tv': '0'})
        if status != 200 or not isinstance(data, dict):
            return None, False
        lrc = tidy_lrc(((data.get('lrc') or {}).get('lyric')) or '')
        ttml = yrc_to_ttml(((data.get('yrc') or {}).get('lyric')) or '')
        if not lrc and ttml:
            lrc = lrc_of(ttml_lines(ttml)[0])
        if not lrc:
            return None, True
        result = {'source': 'netease', 'lrc': lrc, 'words': bool(ttml)}
        if ttml:
            result['ttml'] = ttml
        return result, True

    async def _lrclib(self, title, artist, album, duration):
        params = {'track_name': tidy_title(title), 'artist_name': first_artist(artist)}
        if duration:
            exact = {'track_name': title, 'artist_name': artist, 'duration': str(duration)}
            if album:
                exact['album_name'] = album
            status, data = await self._fetch('lrclib', LRCLIB_GET, exact)
            if status == 200 and isinstance(data, dict):
                if data.get('instrumental'):
                    return _INSTRUMENTAL, True
                if data.get('syncedLyrics'):
                    return {'source': 'lrclib', 'lrc': data['syncedLyrics'], 'words': False}, True
            elif status not in (200, 404, 400):
                return None, False
        status, data = await self._fetch('lrclib', LRCLIB_SEARCH, params)
        if status != 200 or not isinstance(data, list):
            return None, False
        for item in data:
            if not isinstance(item, dict) or item.get('instrumental') or not item.get('syncedLyrics'):
                continue
            # Same title but a different length is usually a live or alternate version.
            length = item.get('duration')
            if duration and isinstance(length, (int, float)) and abs(length - duration) > DURATION_SLACK:
                continue
            return {'source': 'lrclib', 'lrc': item['syncedLyrics'], 'words': False}, True
        return None, True
