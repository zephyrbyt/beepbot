"""Looks up lyrics on the server for the Echo dashboard, so the Echo itself contacts nothing outside.

Better Lyrics doesn't accept requests from web pages on other sites, so the page asks Home Assistant,
and Home Assistant asks the lyrics services. Only logged-in Home Assistant users can use this.

For the radio it can also line the lyrics up by listening (radio_sync.py and listen.py): the station's sound
goes no further than this server, and the words are worked out by your own speech recognition. How far behind
live the Echo's stream began is measured from Music Assistant's connection to the station (conn_watch.py).
Stations that send their own clock (Global's, like Heart) say exactly when each song began (station_clock.py), so
for those no guessing is needed: listening only checks it.
"""
from __future__ import annotations

import asyncio
from collections import deque
from datetime import timedelta
import math
import re
import socket
import time
from urllib.parse import urlsplit

from aiohttp import ClientTimeout, web

from homeassistant.helpers.http import HomeAssistantView
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import ConfigType

from . import conn_watch, listen
from .lookup import MAX_BYTES, Lookup
from .radio_sync import (RECORD_SECONDS, STATION_STILL_MS, STILL_MS, combine, estimate, follow_on, parse_lrc, pieces_of,
                         switch_point, words)

DOMAIN = 'echo_lyrics'
CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)
HEADERS = {'User-Agent': 'echo-robot-dashboard/1.0'}
TIMEOUT = ClientTimeout(total=8)
MAX_TEXT = 300
WATCH_EVERY = timedelta(seconds=1)
WATCH_GIVE_UP = 5      # failed looks in a row before the connection watch stops (lyrics still line up, less exactly)
SONG_END_SECONDS = 8   # a following listen this long after the last lyric line is skipped: the song may be over
STATION_LEAD = 0.4     # from a station's start time for a song to its lyrics' time 0, on average (Heart: 0 to 1.1s)
STATION_WEIGHT = 2     # how much the station's start counts against a listen (backed by 3 to 7 pieces) when combined
LEARN_WITHIN_SECONDS = 90  # a move listening makes this early in a song says where its lyrics sit for next time
MAX_SHIFTS = 3000          # tracks remembered
FIRST_CHECK_SECONDS = 60  # a listen this early in a song that disagrees with the station's time moves it straight away
CUT_FROM_MS = 25000       # a switch found later than this into a song is a radio edit's cut (earlier: the intro)
CUT_SAME_MS = 15000        # a cut found this close to one already known replaces it
MAX_CUTS = 6               # cuts remembered per track
SONG_ADJUST_LIMIT_MS = 15000  # the most a song's own Earlier/Later timing can be (the same as the card's radio limit)
TRACK_ID = re.compile(r'[\w-]{1,40}')


def advance(answer: dict, at_ms: float) -> dict:
    """An answer for a track whose radio edit's cuts are known, as it stands at at_ms (server time): any cut due by
    then has happened, so its timing is the one in force."""
    later = answer.get('later') or []
    due = [x for x in later if x[0] <= at_ms]
    if not due:
        return answer
    return {**answer, 'started': due[-1][1], 'later': [x for x in later if x[0] > at_ms]}


def same_song(stream_title: str, title: str, artist: str) -> bool:
    """Whether the station's own title ("Artist - Title") is the song the Echo shows."""
    said, want = set(words(stream_title)), words(title)
    return bool(said and want) and all(w in said for w in want)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the lookup. Nothing runs until the dashboard asks for a song."""
    session = async_get_clientsession(hass)

    async def get(url: str, params: dict) -> tuple:
        async with session.get(url, params=params, headers=HEADERS, timeout=TIMEOUT) as response:
            # Read to the end: a single read only returns what has arrived so far, which cut off bigger answers.
            body = bytearray()
            async for chunk in response.content.iter_chunked(65536):
                body.extend(chunk)
                if len(body) > MAX_BYTES:
                    break
            return response.status, response.headers, bytes(body)

    # Which lyrics services to ask (lookup.SOURCES), if not all: e.g. {'echo_lyrics': {'sources': ['lrclib']}}.
    # Only the lyrics: lining up the radio listens to the station either way.
    sources = (config.get(DOMAIN) or {}).get('sources')
    lookup = Lookup(get, sources=sources)
    watch = conn_watch.Watch()
    store = Store(hass, 1, f'{DOMAIN}.radio_connection')
    saved = await store.async_load() or {}
    state = {'fails': 0, 'unsub': None, 'restored': False}

    async def look(_now=None) -> None:
        try:
            await hass.async_add_executor_job(watch.poll)
        except Exception:  # noqa: BLE001 - no connection watch here: the lyrics fall back to the listen's own timing
            state['fails'] += 1
            if state['fails'] >= WATCH_GIVE_UP and state['unsub']:
                state['unsub']()
                state['unsub'] = None
            return
        state['fails'] = 0
        if not state['restored']:
            # The Echo's connection outlives a Home Assistant restart, and so does what was measured about it.
            state['restored'] = True
            key = tuple(saved.get('key') or ())
            if len(key) == 4 and key in watch.seen:
                watch.remember(key, {'first': saved['first'], 'samples': [tuple(x) for x in saved.get('samples', [])]})

    state['unsub'] = async_track_time_interval(hass, look, WATCH_EVERY)
    shift_store = Store(hass, 1, f'{DOMAIN}.song_shifts')
    shifts = await shift_store.async_load() or {}
    hass.http.register_view(EchoLyricsView(lookup))
    hass.http.register_view(RadioSyncView(hass, session, lookup, watch, store, shift_store, shifts))
    return True


class EchoLyricsView(HomeAssistantView):
    """GET /api/echo_lyrics?title=&artist=&album=&duration="""

    url = '/api/echo_lyrics'
    name = 'api:echo_lyrics'
    requires_auth = True

    def __init__(self, lookup: Lookup) -> None:
        self._lookup = lookup

    async def get(self, request: web.Request) -> web.Response:
        query = request.query
        title, artist = query.get('title', '').strip(), query.get('artist', '').strip()
        album = query.get('album', '').strip()
        if not title or not artist or max(len(title), len(artist), len(album)) > MAX_TEXT:
            return self.json_message('title and artist are required', 400)
        try:
            duration = max(0, min(int(float(query.get('duration', 0))), 86400))
        except ValueError:
            duration = 0
        return self.json(await self._lookup.find(title, artist, album, duration))


class RadioSyncView(HomeAssistantView):
    """GET /api/echo_lyrics/radio_sync?content_id=&title=&artist=&expect=

    Listens to the station for a few seconds and works out when the current song started, as the Echo hears it.
    expect: roughly how far into the song the card thinks it is (from when the station changed song), in seconds.
    Answers {'ok': True, 'started': ms since 1970, 'now': ms} or {'ok': False, 'reason': ...}.
    """

    url = '/api/echo_lyrics/radio_sync'
    name = 'api:echo_lyrics:radio_sync'
    requires_auth = True

    def __init__(self, hass: HomeAssistant, session, lookup: Lookup, watch=None, store=None, shift_store=None,
                 shifts: dict | None = None) -> None:
        self._hass = hass
        self._session = session
        self._lookup = lookup
        self._watch = watch
        self._store = store
        # For stations with their own clock: how far each track's lyrics sit from the station's start time, learnt by
        # listening (the lyrics are often for a version with a shorter or longer intro), where its radio edit cuts, and
        # the Earlier/Later timing you set for it on the Echo. Track number -> [ms, when, cuts, your timing].
        self._shift_store = shift_store
        self._shifts: dict = dict(shifts or {})
        self._lock = asyncio.Lock()  # one listen at a time
        self._done: dict = {}         # songs already lined up, so a second screen asking doesn't listen again
        self._streams: dict = {}
        self._own_ports: deque = deque(maxlen=64)  # this server's own listens, never mistaken for the Echo's
        self._addresses: dict = {}    # station address -> (when looked up, its IP addresses)
        self._saved_key = None

    async def _station_ips(self, url: str) -> tuple[set, int]:
        parts = urlsplit(url)
        port = parts.port or (443 if parts.scheme == 'https' else 80)
        known = self._addresses.get(url)
        if known and time.time() - known[0] < 600:
            return known[1], port
        try:
            infos = await self._hass.async_add_executor_job(socket.getaddrinfo, parts.hostname, port, 0, socket.SOCK_STREAM)
            ips = {i[4][0] for i in infos}
        except OSError:
            ips = set()
        self._addresses[url] = (time.time(), ips)
        return ips, port

    async def _echo_behind(self, url: str, raw_per_second: float):
        """How far behind live the Echo's stream began: measured from Music Assistant's connection to the station,
        or None if it can't be (no connection watch, or that connection isn't to be seen)."""
        if not self._watch or not raw_per_second:
            return None
        ips, port = await self._station_ips(url)
        key, rec = self._watch.station_connection(ips, port, set(self._own_ports))
        behind = conn_watch.behind_live(rec, raw_per_second)
        if behind is not None and self._store and key != self._saved_key:
            self._saved_key = key
            self._store.async_delay_save(lambda: {'key': list(key), 'first': rec['first'], 'samples': rec['samples']}, 5)
        return behind

    async def _station_answer(self, url: str, notes, raw_per_second: float, title: str, artist: str):
        """When the Echo began playing the song, from the station's own clock: or None if the station doesn't send
        one, says something else is playing, or the Echo's connection can't be measured.
        The song began at `start` on the station's clock; its sound reaches here `lag` later than that clock, and the
        Echo's stream runs `echo_behind` behind what arrives here."""
        if notes is None:
            return None
        start, lag = notes.song_start(), notes.live_lag()
        if not start or lag is None or not same_song(notes.title, title, artist):
            return None
        echo_behind = await self._echo_behind(url, raw_per_second)
        if echo_behind is None:
            return None
        raw = round((start[0] + STATION_LEAD + lag + echo_behind) * 1000)
        shift = self._shift_of(start[1])
        answer = {'ok': True, 'started': raw + shift, 'agree': STATION_WEIGHT, 'how': 'station', 'track': start[1],
                  'shift': shift, 'echo_burst': echo_behind}
        # A radio edit this track is known to have: where it cuts, and the timing from there on.
        cuts = self._cuts_of(start[1])
        if cuts:
            answer['later'] = [[raw + at, raw + moved] for at, moved in cuts]
        return answer

    @staticmethod
    def _track_key(track: str) -> str:
        return str(track or '').split('-')[0]  # Heart writes the same track as "170331" and "170331-HSE"

    def _shift_of(self, track: str) -> int:
        known = self._shifts.get(self._track_key(track))
        return int(known[0]) if isinstance(known, list) and known and isinstance(known[0], (int, float)) else 0

    def _cuts_of(self, track: str) -> list:
        known = self._shifts.get(self._track_key(track))
        cuts = known[2] if isinstance(known, list) and len(known) > 2 and isinstance(known[2], list) else []
        return sorted([int(c[0]), int(c[1])] for c in cuts
                      if isinstance(c, list) and len(c) == 2 and all(isinstance(x, (int, float)) for x in c))

    def _learn_shift(self, track: str, shift_ms: int) -> None:
        """Remember how far this track's lyrics sit from the station's start time, so next time it plays they're
        right from the first line. Only what listening found near the song's start is learnt (a cut later on, in a
        radio edit, is learnt separately)."""
        key = self._track_key(track)
        if not key:
            return
        self._put(key, int(shift_ms), self._cuts_of(track), self._adjust_of(track))

    def _learn_cut(self, track: str, at_ms: int, moved_ms: int) -> None:
        """Remember where this track's radio edit cuts (ms into the song, on the station's timing) and the timing
        from there (ms from the station's start), so next time it plays the lyrics jump there by themselves."""
        key = self._track_key(track)
        if not key:
            return
        cuts = [c for c in self._cuts_of(track) if abs(c[0] - at_ms) > CUT_SAME_MS] + [[int(at_ms), int(moved_ms)]]
        self._put(key, self._shift_of(track), sorted(cuts)[-MAX_CUTS:], self._adjust_of(track))

    def _adjust_of(self, track: str):
        """The Earlier/Later timing you set on the Echo for this track, in ms, or None if you haven't."""
        known = self._shifts.get(self._track_key(track))
        value = known[3] if isinstance(known, list) and len(known) > 3 else None
        return int(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None

    def set_adjust(self, track: str, adjust_ms) -> None:
        """Your own timing for this track (on top of what listening found), kept for every time it plays."""
        key = self._track_key(track)
        if key:
            self._put(key, self._shift_of(track), self._cuts_of(track), adjust_ms)

    def _put(self, key: str, shift_ms: int, cuts: list, adjust_ms) -> None:
        # Saved as [shift, when, cuts, your timing]: the last two only when there are any.
        entry = [int(shift_ms), round(time.time())]
        if cuts or adjust_ms is not None:
            entry.append(cuts or [])
        if adjust_ms is not None:
            entry.append(int(adjust_ms))
        self._shifts[key] = entry
        self._save_shifts()

    def _save_shifts(self) -> None:
        if len(self._shifts) > MAX_SHIFTS:
            for old in sorted(self._shifts, key=lambda k: self._shifts[k][1])[:len(self._shifts) - MAX_SHIFTS]:
                del self._shifts[old]
        if self._shift_store:
            self._shift_store.async_delay_save(lambda: dict(self._shifts), 10)

    @staticmethod
    def _cut_at(pieces, lrc: str, found: dict, old: float, new: float, at: int, heard_to):
        """Where a listen that heard the song out of place had the switch, in ms into the song (station timing):
        from its pieces, or between the last listen heard in place and this one. None if it can't be told."""
        point = switch_point(pieces, lrc, old, new, found.get('ttml', '') if found.get('words') else '')
        if point is None:
            return None, None
        seconds, how = point
        if how == 'before':
            return (round((heard_to + at) / 2) if heard_to is not None and heard_to < at else at), how
        return at + round(seconds * 1000), how

    def _keep(self, key, asked: float, answer: dict) -> dict:
        self._done[key] = {'at': asked, 'answer': answer}
        while len(self._done) > 32:
            self._done.pop(next(iter(self._done)))
        return answer

    async def get(self, request: web.Request) -> web.Response:
        query = request.query
        cid, title, artist = query.get('content_id', '').strip(), query.get('title', '').strip(), query.get('artist', '').strip()
        if not cid or not title or not artist or max(len(cid), len(title), len(artist)) > MAX_TEXT * 2:
            return self.json_message('content_id, title and artist are required', 400)
        try:
            expect = float(query['expect']) if query.get('expect') else None
        except ValueError:
            expect = None
        again, follow, quick = query.get('again') == '1', query.get('follow') == '1', query.get('quick') == '1'
        answer = {**await self._sync(cid, title, artist, expect, again, follow, quick), 'now': round(time.time() * 1000)}
        # The timing you set for this track on the Echo, if you have: looked up afresh, as you may have just changed it.
        adjust = self._adjust_of(answer['track']) if answer.get('track') else None
        if adjust is not None:
            answer['adjust'] = adjust / 1000
        return self.json(answer)

    async def post(self, request: web.Request) -> web.Response:
        """POST {track, adjust}: your Earlier/Later timing for a track (seconds), kept for whenever it plays."""
        try:
            data = await request.json()
            track, adjust = str(data.get('track') or ''), float(data.get('adjust'))
        except (ValueError, TypeError, AttributeError):
            return self.json_message('track and adjust are required', 400)
        if not TRACK_ID.fullmatch(track) or not math.isfinite(adjust):
            return self.json_message('track and adjust are required', 400)
        adjust_ms = max(-SONG_ADJUST_LIMIT_MS, min(SONG_ADJUST_LIMIT_MS, round(adjust * 1000)))
        self.set_adjust(track, adjust_ms)
        return self.json({'ok': True, 'adjust': adjust_ms / 1000})

    async def _sync(self, cid: str, title: str, artist: str, expect, again: bool = False, follow: bool = False,
                    quick: bool = False) -> dict:
        """again: a second listen to check the first. They're combined, so one slightly-off listen counts for less.
        follow: later listens while the song plays, which catch a wrong first answer (or a radio edit skipping a
        part): the timing only moves when two in a row agree it's out.
        quick: only look at the station's own clock (a few seconds, nothing heard), for stations that send one;
        {'ok': False, 'quick': True} if it doesn't, and the card listens a little later instead."""
        key = (cid, title.casefold(), artist.casefold())
        asked = time.time()
        if quick:
            # Doesn't wait for a listen still going on for the song before: it only reads the station's clock.
            done = self._done.get(key)
            if done and asked - done['at'] < 900:
                return done['answer']
            return await self._quick(key, asked, cid, title, artist)
        async with self._lock:
            done = self._done.get(key)
            fresh_needed = follow or (again and done and not done['answer'].get('checked'))
            if done and asked - done['at'] < 900 and not fresh_needed:
                return done['answer']
            later = again or follow
            known = done['answer'] if later and done and done['answer'].get('ok') else None
            again = later
            found = await self._lookup.find(title, artist, '', 0)
            lrc = found.get('lrc')
            if not lrc:
                return {'ok': False, 'reason': 'no lyrics', 'final': True}
            lines = parse_lrc(lrc)
            if follow and known and lines and asked - known['started'] / 1000 > lines[-1][0] + SONG_END_SECONDS:
                return known  # the singing is over: what's playing now may already be the next song or a presenter
            try:
                url = await listen.stream_url(self._session, cid, self._streams)
                host, port = listen.find_speech(self._hass)
                info: dict = {}
                pcm, first, last = await listen.record(self._hass, self._session, url, info)
                self._own_ports.append(info.get('port'))
                pieces = []
                for start, length in pieces_of(len(pcm) / listen.BYTES_PER_SECOND):
                    part = pcm[int(start * listen.RATE) * 2:int((start + length) * listen.RATE) * 2]
                    pieces.append((start, length, await listen.transcribe(host, port, part)))
            except listen.Unsupported as err:
                return {'ok': False, 'reason': str(err), 'final': True}
            except Exception:  # noqa: BLE001 - a network or speech hiccup: the card tries again later
                return {'ok': False, 'reason': 'could not listen'}
            # The card's guess comes from when Music Assistant saw the song change, which is when it arrived, not
            # when the Echo played it: the Echo is behind by the station's catch-up burst. Moved to the start of
            # this recording, which is also that far behind.
            audio_seconds = len(pcm) / listen.BYTES_PER_SECOND
            burst = max(0.0, audio_seconds - (last - first))
            # Stations don't always hand out the same catch-up (Heart: sometimes about 5 seconds, sometimes 15), so
            # this listen's and the Echo's can differ. The Echo's is measured from Music Assistant's own connection;
            # the difference is allowed for. If it can't be measured, the Echo is taken to have got the same.
            echo_behind = await self._echo_behind(url, info.get('raw', 0) / audio_seconds if audio_seconds else 0)
            extra = burst - echo_behind if echo_behind is not None else 0.0
            # The Echo plays what this recording holds from (first - extra): a cut the track is known to have, due
            # by the middle of the recording, has already happened for the Echo too.
            heard_at = round((first - extra) * 1000)
            if known:
                known = advance(known, heard_at + RECORD_SECONDS * 500)
            # What the station's own clock says, if it has one: exact, so listening only checks it.
            station = await self._station_answer(url, info.get('notes'), info.get('raw', 0) / audio_seconds if audio_seconds else 0, title, artist)
            near = None
            if known:
                # A later listen: the song's place is already known (as the Echo hears it), so no burst to allow
                # for, and a match near it (or near a move another listen suggested) is preferred.
                guess = first - known['started'] / 1000 - extra
                near = [guess] + ([first - known['pending']['started'] / 1000 - extra] if known.get('pending') else [])
            elif later:
                guess = None if expect is None else expect + (first - asked) - extra  # the card's place is already lined up
            else:
                guess = None if expect is None else expect + (first - asked) - burst
            result = estimate(pieces, lrc, guess, found.get('ttml', '') if found.get('words') else '', near=near)
            # At the moment this server connected, the Echo was playing what the recording starts with (once any
            # unusual burst is allowed for).
            heard = None
            if result.get('ok'):
                heard = {'ok': True, 'started': round((first - result['offset'] - extra) * 1000), 'agree': result['agree']}
            measured = {'burst': round(burst, 1), 'echo_burst': echo_behind}
            if station:
                # A song that already has an answer from the station (or one listening has since put right) keeps it.
                same = done and done['answer'].get('ok') and done['answer'].get('track') == station['track']
                current = known if same and known else done['answer'] if same else advance(station, heard_at + RECORD_SECONDS * 500)
                raw = station['started'] - station['shift']   # the station's start, before anything learnt
                at = heard_at - raw                            # where in the song (on the station's timing) this listen began
                if not heard:
                    return self._keep(key, asked, {**current, 'checked': True, **measured})
                still = STATION_STILL_MS if current.get('how') == 'station' else STILL_MS
                if abs(heard['started'] - current['started']) <= still:
                    base = {k: v for k, v in current.items() if k != 'pending'}
                    base['heard_to'] = at + RECORD_SECONDS * 1000   # heard where expected up to here
                    if current.get('how') == 'station':
                        # The station's place confirmed. Its start can be up to a second out for the lyrics' version
                        # (measured on Heart), and a listen at the right place is closer, so the two are combined,
                        # once, and remembered for this track: next time it plays, it's right from the first line.
                        a, b = STATION_WEIGHT, heard.get('agree', 1)
                        base.update(started=round((current['started'] * a + heard['started'] * b) / (a + b)), agree=a + b, how='both')
                        if result['offset'] < LEARN_WITHIN_SECONDS:
                            self._learn_shift(station['track'], base['started'] - raw)
                    return self._keep(key, asked, {**base, 'checked': True, **measured})
                # Out: where did the switch happen?
                heard['cut_at'], how = self._cut_at(pieces, lrc, found, first - extra - current['started'] / 1000,
                                                    result['offset'], at, current.get('heard_to'))
                # Moved straight away, without waiting for a second listen, when it's clear: the first listen of a
                # song timed only by the station (near a song's start a listen was right every time on Heart; the
                # lyrics are often for a version with another intro), or one that heard the old part and then the
                # new one (a radio edit's cut, caught in the act). Otherwise the next listen has to agree.
                strong = result['agree'] >= 3
                now = strong and ((current.get('how') == 'station' and result['offset'] < FIRST_CHECK_SECONDS) or how == 'between')
                if now:
                    moved = {'ok': True, 'started': heard['started'], 'agree': heard['agree'], 'checked': True}
                    cut = heard['cut_at']
                else:
                    moved = follow_on(current, heard, still)
                    cut = (current.get('pending') or {}).get('cut_at')
                if moved['started'] != current['started']:
                    # Two listens agree the timing is out: a radio edit's cut there, or (near the start) lyrics for a
                    # version with another intro. Remembered for this track either way.
                    moved = {**moved, 'how': 'heard', 'track': station['track'], 'shift': station['shift'],
                             'heard_to': at + RECORD_SECONDS * 1000, 'later': current.get('later') or []}
                    if cut is not None and cut >= CUT_FROM_MS:
                        self._learn_cut(station['track'], cut, moved['started'] - raw)
                    elif result['offset'] < LEARN_WITHIN_SECONDS:
                        self._learn_shift(station['track'], moved['started'] - raw)
                return self._keep(key, asked, {**moved, **measured})
            if not heard:
                if again and done and done['answer'].get('ok'):
                    return done['answer']  # the check didn't work out: the first answer stands
                return {'ok': False, 'reason': result.get('reason', 'no match')}
            answer = heard
            if done and done['answer'].get('ok') and (follow or done['answer'].get('how') == 'station'):
                before = known or done['answer']
                answer = follow_on(before, answer, STATION_STILL_MS if before.get('how') == 'station' else None)
            elif again and done and done['answer'].get('ok'):
                answer = combine(done['answer'], answer)
            # What was measured, to make any timing problem easy to see (no words, nothing personal).
            return self._keep(key, asked, {**answer, **measured})

    async def _quick(self, key, asked: float, cid: str, title: str, artist: str) -> dict:
        """The station's own clock only (see _sync)."""
        not_here = {'ok': False, 'reason': 'no station clock', 'quick': True}
        try:
            url = await listen.stream_url(self._session, cid, self._streams)
            info: dict = {}
            try:
                notes = await listen.peek(self._session, url, info)
            finally:
                self._own_ports.append(info.get('port'))
        except listen.Unsupported:
            return not_here
        except Exception:  # noqa: BLE001 - a network hiccup: the card listens instead
            return not_here
        answer = await self._station_answer(url, notes, info.get('raw_per_second', 0), title, artist)
        if not answer:
            return not_here
        return self._keep(key, asked, answer)
