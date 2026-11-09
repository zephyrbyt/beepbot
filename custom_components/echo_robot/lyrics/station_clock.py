"""The station's own clock, for stations that send one in their song-title blocks (Global's do: Heart, Capital,
Smooth, Classic FM, Radio X, LBC, Gold).

Every half second their title block says when that sound was broadcast (UTC='20261109T124326.058') and lists the
tracks around now, each with its start time on the same clock (track_info, packed with MessagePack). The one marked
'H' is the one playing. So where the song is doesn't need guessing: it began at that time, and the Echo hears the
broadcast a measurable time later. Nothing is sent anywhere: this only reads what the station already sends.

Plain Python, so it's tested without Home Assistant.
"""
from __future__ import annotations

import base64
import calendar
import re
import statistics
import struct

_FIELD = re.compile(r"(\w+)='(.*?)';", re.S)
_UTC = re.compile(r'(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d(?:\.\d+)?)')
KEEP = 400                 # title blocks remembered per listen (a block every half second)
LAG_FROM = 5               # blocks in step with the station's clock needed to say how far behind it sound arrives
IN_STEP_SPREAD = 0.8       # blocks arriving in step with the clock are within this of each other (measured on Heart)
MAX_SONG_SECONDS = 15 * 60  # a 'playing' track that began longer ago than this isn't believed


def fields(text: str) -> dict:
    return dict(_FIELD.findall(text or ''))


def utc(value: str):
    """'20261109T124326.058' as seconds since 1970, or None."""
    m = _UTC.match(value or '')
    if not m:
        return None
    y, mo, d, h, mi, s = m.groups()
    return calendar.timegm((int(y), int(mo), int(d), int(h), int(mi), 0)) + float(s)


def unpack(data: bytes, i: int = 0):
    """The few MessagePack types track_info uses: (value, where the next one starts). Raises ValueError otherwise."""
    if i >= len(data):
        raise ValueError('cut off')
    t = data[i]
    if t <= 0x7f:
        return t, i + 1
    if t >= 0xe0:
        return t - 256, i + 1
    if 0x80 <= t <= 0x8f or 0x90 <= t <= 0x9f:
        n, i, out = t & 15, i + 1, ({} if t <= 0x8f else [])
        for _ in range(n):
            if t <= 0x8f:
                k, i = unpack(data, i)
                v, i = unpack(data, i)
                out[k] = v
            else:
                v, i = unpack(data, i)
                out.append(v)
        return out, i
    if 0xa0 <= t <= 0xbf or t == 0xd9:
        n, at = (t & 31, i + 1) if t != 0xd9 else (data[i + 1] if i + 1 < len(data) else 0, i + 2)
        if at + n > len(data):
            raise ValueError('cut off')
        return data[at:at + n].decode('utf-8', 'replace'), at + n
    sizes = {0xcc: ('>B', 1), 0xcd: ('>H', 2), 0xce: ('>I', 4), 0xcf: ('>Q', 8), 0xd0: ('>b', 1), 0xd1: ('>h', 2),
             0xd2: ('>i', 4), 0xd3: ('>q', 8), 0xca: ('>f', 4), 0xcb: ('>d', 8)}
    if t in sizes:
        form, n = sizes[t]
        if i + 1 + n > len(data):
            raise ValueError('cut off')
        return struct.unpack(form, data[i + 1:i + 1 + n])[0], i + 1 + n
    if t == 0xc0:
        return None, i + 1
    if t in (0xc2, 0xc3):
        return t == 0xc3, i + 1
    raise ValueError(f'type {t:#x}')


def tracks(value: str) -> list:
    """The tracks listed in a track_info field: [{'status', '@', 'type', 'id'}], or [] if it can't be read."""
    try:
        found = unpack(base64.b64decode(value or '', validate=False))[0]
    except (ValueError, TypeError, IndexError, struct.error):
        return []
    return [t for t in found if isinstance(t, dict)] if isinstance(found, list) else []


class Notes:
    """What a station's title blocks said during one connection: when each arrived and its clock, and the track
    marked as playing. Fed by IcyStrip."""

    def __init__(self) -> None:
        self.blocks: list = []    # (arrived, station clock)
        self.playing = None       # (start on the station's clock, track id, title) of the latest block
        self.title = ''
        self.seen = 0             # title blocks of any kind

    def add(self, arrived: float, text: str) -> None:
        self.seen += 1
        f = fields(text)
        if 'StreamTitle' in f:
            self.title = f['StreamTitle']
        clock = utc(f.get('UTC', ''))
        if clock is not None and arrived is not None:
            self.blocks.append((arrived, clock))
            del self.blocks[:-KEEP]
        if 'track_info' in f:
            here = [t for t in tracks(f['track_info']) if t.get('status') == 'H' and isinstance(t.get('@'), (int, float))]
            self.playing = (float(here[0]['@']), str(here[0].get('id', '')), self.title) if here else None

    def _in_step(self) -> list:
        """How long after the station's clock each block arrived, for those that came in step with it (not the
        catch-up burst at the start, which is older sound arriving all at once)."""
        behind = [arrived - clock for arrived, clock in self.blocks]
        if not behind:
            return []
        least = min(behind)
        return [b for b in behind if b <= least + IN_STEP_SPREAD]

    def live_lag(self):
        """How long after the station's clock its newest sound gets here, in seconds, or None: the middle of the
        blocks that arrived in step (each arrives a little early or late, by up to about half a second)."""
        in_step = self._in_step()
        if len(in_step) < LAG_FROM:
            return None
        return round(statistics.median(in_step), 3)

    def caught_up(self) -> int:
        """Blocks that arrived in step with the station's clock (after the catch-up burst)."""
        return len(self._in_step()) if self.live_lag() is not None else 0

    def song_start(self):
        """When the playing track began on the station's clock, if there is one and it's believable: (start, id)."""
        if not self.playing or not self.blocks:
            return None
        start, tid, _ = self.playing
        now = self.blocks[-1][1]
        if not (now - MAX_SONG_SECONDS <= start <= now + 1):
            return None
        return start, tid
