"""Takes the song titles back out of a radio stream that was asked for them.

The server asks a station for its stream the same way Music Assistant does for the Echo: with song titles mixed
in ("Icy-MetaData: 1"). That matters, because some stations (Heart's local ones, for example) hand a listener who
asks for titles about 5 seconds of catch-up audio, and one who doesn't about 15. The lyrics timing depends on the
server getting the same catch-up audio as the Echo did.

The titles arrive as a small block after every `metaint` bytes of sound: one length byte (times 16), then the
text. Only the sound is passed on. Each block's text can be handed to `notes` (station_clock.Notes), with when it
arrived: some stations' blocks say exactly when each song began. Plain Python, so it's tested without Home Assistant.
"""
from __future__ import annotations


class IcyStrip:
    def __init__(self, metaint: int, notes=None) -> None:
        self.metaint = max(0, int(metaint or 0))
        self.left = self.metaint   # sound bytes before the next title block
        self.skip = 0              # title bytes still to drop
        self.need_length = False   # the next byte is a title block's length
        self.notes = notes
        self.block = bytearray()
        self.sound = 0             # sound bytes passed on so far

    def _block_done(self, now) -> None:
        if self.notes is not None and self.block:
            self.notes.add(now, bytes(self.block).rstrip(b'\0').decode('utf-8', 'replace'))
        self.block.clear()

    def feed(self, chunk: bytes, now: float | None = None) -> bytes:
        if not self.metaint:
            self.sound += len(chunk)
            return chunk
        out = bytearray()
        i, n = 0, len(chunk)
        while i < n:
            if self.skip:
                step = min(self.skip, n - i)
                if self.notes is not None:
                    self.block += chunk[i:i + step]
                self.skip -= step
                i += step
                if not self.skip:
                    self.left = self.metaint
                    self._block_done(now)
            elif self.need_length:
                self.need_length = False
                self.skip = chunk[i] * 16
                i += 1
                if not self.skip:
                    self.left = self.metaint
            else:
                step = min(self.left, n - i)
                out += chunk[i:i + step]
                self.left -= step
                i += step
                if not self.left:
                    self.need_length = True
        self.sound += len(out)
        return bytes(out)
