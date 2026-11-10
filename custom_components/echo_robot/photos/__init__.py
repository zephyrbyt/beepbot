"""Photos for the Echo robot's idle slideshow, from one Immich album.

Home Assistant asks Immich, and passes the photos on to the robot screen. So the Immich key stays here, in
Home Assistant's settings (secrets.yaml), and never reaches the screen's web page. Only the album named in the
settings can be read through this, and only by admin logins (as the Echo uses), unless admin_only is false.

Immich has to be on this server or your home network: a public address is refused, so photos never travel
over the internet. The key needs only Immich's album.read, asset.read and asset.view permissions.

    echo_photos:
      album: Echo Show                      # the album's name, or its id from the address bar
      api_key: !secret echo_photos_immich_key
      url: http://127.0.0.1:2283            # optional, this is the default
"""
from __future__ import annotations

import ipaddress
import logging
from urllib.parse import urlsplit

from aiohttp import ClientTimeout, web

try:
    import probatio as vol
except ImportError:  # older Home Assistant
    import voluptuous as vol

from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.http import HomeAssistantView
from homeassistant.helpers.typing import ConfigType

from .album import MAX_BYTES, Album, NotInAlbum, Problem

DOMAIN = 'echo_photos'
_LOGGER = logging.getLogger(__name__)
TIMEOUT = ClientTimeout(total=15)
LOCAL_NAMES = ('.home.arpa', '.local', '.lan', '.internal')


def local_address(url: str) -> bool:
    """Only this server, a home network address, or a home name: photos never cross the internet."""
    try:
        parts = urlsplit(url)
    except ValueError:
        return False
    host = (parts.hostname or '').lower()
    if parts.scheme not in ('http', 'https') or not host or parts.username or parts.password:
        return False
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return host == 'localhost' or '.' not in host or host.endswith(LOCAL_NAMES)   # no dot: a Docker name
    return address.is_private or address.is_loopback


CONFIG_SCHEMA = vol.Schema({DOMAIN: vol.Schema({
    vol.Required('album'): cv.string,
    vol.Required('api_key'): cv.string,
    vol.Optional('url', default='http://127.0.0.1:2283'): cv.string,
    vol.Optional('admin_only', default=True): cv.boolean,
})}, extra=vol.ALLOW_EXTRA)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    settings = config.get(DOMAIN) or {}
    base = str(settings.get('url', 'http://127.0.0.1:2283')).rstrip('/')
    if not local_address(base):
        _LOGGER.error('echo_photos: Immich must be on this server or your home network, not %s. Photos are off.',
                      urlsplit(base).hostname)
        return False
    key = settings['api_key']
    session = async_get_clientsession(hass)

    async def fetch(method: str, path: str, params: dict, body) -> tuple:
        headers = {'x-api-key': key, 'Accept': 'application/json' if not path.endswith('/thumbnail') else 'image/*'}
        try:
            async with session.request(method, base + path, params=params, json=body, headers=headers,
                                       timeout=TIMEOUT, allow_redirects=False) as response:
                data = bytearray()
                async for chunk in response.content.iter_chunked(65536):
                    data.extend(chunk)
                    if len(data) > MAX_BYTES:
                        break
                return response.status, response.headers, bytes(data)
        except Exception as error:  # noqa: BLE001 - reported as unreachable, never with the key
            raise Problem('immich_unreachable') from error

    album = Album(fetch, settings['album'])
    admin_only = settings.get('admin_only', True)
    hass.data[DOMAIN] = album
    hass.http.register_view(PhotosView(album, admin_only))
    hass.http.register_view(PhotoView(album, admin_only))
    return True


def _allowed(request, admin_only: bool) -> bool:
    user = request.get('hass_user')
    return bool(user) and (user.is_admin or not admin_only)


class PhotosView(HomeAssistantView):
    """GET /api/echo_photos: the album's photo ids, and whether Immich could be reached."""

    url = '/api/echo_photos'
    name = 'api:echo_photos'
    requires_auth = True

    def __init__(self, album: Album, admin_only: bool):
        self.album, self.admin_only = album, admin_only

    async def get(self, request):
        if not _allowed(request, self.admin_only):
            return self.json({'ok': False, 'photos': [], 'problem': 'not_admin'}, status_code=403)
        answer = await self.album.photos()
        response = self.json(answer)
        response.headers['Cache-Control'] = 'no-store'
        return response


class PhotoView(HomeAssistantView):
    """GET /api/echo_photos/photo/<id>: one photo from the album, at screen size."""

    url = '/api/echo_photos/photo/{asset_id}'
    name = 'api:echo_photos:photo'
    requires_auth = True

    def __init__(self, album: Album, admin_only: bool):
        self.album, self.admin_only = album, admin_only

    async def get(self, request, asset_id: str):
        if not _allowed(request, self.admin_only):
            return web.Response(status=403)
        try:
            kind, body = await self.album.photo(asset_id)
        except NotInAlbum:
            return web.Response(status=404)
        except Problem as problem:
            return web.Response(status=404 if problem.code == 'photo_gone' else 502, text=problem.code)
        # Kept by the screen only in its own memory; never by anything shared in between.
        return web.Response(body=body, content_type=kind,
                            headers={'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff'})
