"""Which photos the Echo may show: the ones in one Immich album, and nothing else.

Kept apart from Home Assistant so it can be tested on its own. `fetch` does the actual asking:
    await fetch(method, path, params, body) -> (status, headers, bytes)
with the Immich address and key added by the caller, so neither appears here.
"""
from __future__ import annotations

import asyncio
import json
import re
import time

LIST_EVERY = 600        # seconds before the album is asked for again (new photos show up within this)
RETRY_EVERY = 60        # after Immich didn't answer, wait this long before trying again
MAX_PHOTOS = 2000       # more than enough for a slideshow; keeps the answer small
MAX_BYTES = 12_000_000  # one photo, as Immich sends it for screens (its "preview" size, about 1440 pixels)
PAGE = 250
UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
HIDDEN = {'hidden', 'locked'}   # Immich's locked folder and hidden parts of live photos


class Problem(Exception):
    """Something the card or the installer can be told about, by a short code (never with the key in it)."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class NotInAlbum(Exception):
    """Asked for a photo that isn't in the album: refused, whatever it is."""


def _json(body: bytes):
    try:
        return json.loads(body.decode('utf-8'))
    except (ValueError, UnicodeDecodeError) as error:
        raise Problem('immich_odd_answer') from error


def _check(status: int, missing: str = 'album_not_found') -> None:
    if status in (401, 403):
        raise Problem('key_refused')
    if status in (400, 404):
        raise Problem(missing)
    if status >= 500 or status == 0:
        raise Problem('immich_unreachable')
    if status != 200:
        raise Problem('immich_odd_answer')


def _usable(asset: dict) -> bool:
    return (isinstance(asset, dict) and asset.get('type') == 'IMAGE' and not asset.get('isTrashed')
            and asset.get('visibility') not in HIDDEN and bool(UUID.match(str(asset.get('id', '')))))


class Album:
    def __init__(self, fetch, album: str, clock=time.monotonic):
        self.fetch = fetch
        self.album = str(album).strip()
        self.clock = clock
        self.album_id: str | None = None
        self.ids: list[str] = []
        self.allowed: set[str] = set()
        self.checked = 0.0
        self.failed_at = 0.0
        self.problem: str | None = None
        self._lock = asyncio.Lock()

    def answer(self) -> dict:
        # An old list is still worth showing while Immich is briefly away.
        return {'ok': self.problem is None or bool(self.ids), 'photos': list(self.ids), 'problem': self.problem}

    def _fresh(self) -> bool:
        now = self.clock()
        if self.checked and self.problem is None and now - self.checked < LIST_EVERY:
            return True
        return bool(self.failed_at and now - self.failed_at < RETRY_EVERY)

    async def photos(self) -> dict:
        """The album's photos, as Immich ids, in album order. Asks Immich at most every LIST_EVERY seconds."""
        if self._fresh():
            return self.answer()
        async with self._lock:
            if self._fresh():   # someone else just asked
                return self.answer()
            try:
                ids = await self._load()
            except Problem as problem:
                self.problem, self.failed_at = problem.code, self.clock()
            except Exception:  # noqa: BLE001 - no connection, timeout: the card just keeps the face
                self.problem, self.failed_at = 'immich_unreachable', self.clock()
            else:
                self.ids, self.allowed = ids, set(ids)
                self.problem, self.checked, self.failed_at = None, self.clock(), 0.0
        return self.answer()

    async def _find_album(self) -> str:
        if UUID.match(self.album.lower()):
            return self.album.lower()
        wanted = self.album.casefold()
        for params in ({}, {'shared': 'true'}):
            status, _, body = await self.fetch('GET', '/api/albums', params, None)
            _check(status)
            for album in _json(body) or []:
                if isinstance(album, dict) and str(album.get('albumName', '')).strip().casefold() == wanted:
                    return str(album['id'])
        raise Problem('album_not_found')

    async def _load(self) -> list[str]:
        if not self.album_id:
            self.album_id = await self._find_album()
        status, _, body = await self.fetch('GET', f'/api/albums/{self.album_id}', {}, None)
        try:
            _check(status)
        except Problem as problem:
            if problem.code == 'album_not_found':
                self.album_id = None   # renamed or remade: look it up by name again next time
            raise
        album = _json(body)
        assets = album.get('assets') if isinstance(album, dict) else None
        if not assets and isinstance(album, dict) and (album.get('assetCount') or 0) > 0:
            assets = await self._search()   # newer Immich can leave the photos out of the album's answer
        ids, seen = [], set()
        for asset in assets or []:
            if _usable(asset) and asset['id'] not in seen:
                seen.add(asset['id'])
                ids.append(asset['id'])
                if len(ids) >= MAX_PHOTOS:
                    break
        return ids

    async def _search(self) -> list:
        found, page = [], 1
        while page and len(found) < MAX_PHOTOS:
            request = {'albumIds': [self.album_id], 'type': 'IMAGE', 'size': PAGE, 'page': page, 'withDeleted': False}
            status, _, body = await self.fetch('POST', '/api/search/metadata', {}, request)
            if status in (401, 403):
                raise Problem('key_needs_asset_read')
            _check(status)
            assets = (_json(body).get('assets') or {})
            found.extend(assets.get('items') or [])
            page = int(assets['nextPage']) if str(assets.get('nextPage') or '').isdigit() else None
        return found

    async def photo(self, asset_id: str) -> tuple[str, bytes]:
        """One photo, at screen size. Only ever one in the album."""
        asset_id = str(asset_id).lower()
        if not self.allowed:
            await self.photos()
        if asset_id not in self.allowed:
            raise NotInAlbum(asset_id)
        try:
            status, headers, body = await self.fetch('GET', f'/api/assets/{asset_id}/thumbnail', {'size': 'preview'}, None)
        except Problem:
            raise
        except Exception as error:  # noqa: BLE001 - no connection, timeout
            raise Problem('immich_unreachable') from error
        _check(status, missing='photo_gone')
        kind = str(headers.get('Content-Type') or headers.get('content-type') or '').split(';')[0].strip().lower()
        if not kind.startswith('image/') or not body or len(body) > MAX_BYTES:
            raise Problem('immich_odd_answer')
        return kind, body
