"""Serves the robot's dashboard cards from this folder and keeps them in Home Assistant's resource list.

Each address ends in ?v=<version>-<fingerprint of the files>, so after an update every screen fetches the new card
instead of one it has kept. An older hand-installed copy (/local/echo-ui/echo-home-card.js and the like) is moved
over to this one, so the same card is never loaded twice.

If your dashboards' resources are kept in YAML, Home Assistant can't be told about new ones, so the cards are
loaded on every page instead (add_extra_js_url).
"""
from __future__ import annotations

import hashlib
from pathlib import Path

URL_BASE = '/echo_robot'
WWW = Path(__file__).parent / 'www'
CARDS = ('echo-home-card.js', 'echo-mobile-card.js')
PHOTOS = 'echo-photos.js'
# A hand-installed copy's file name, and which of ours takes its place.
SLOT_OF = {'echo-home-card.js': 'echo-home-card.js', 'echo-mobile-card.js': 'echo-mobile-card.js',
           'echo-mobile-loader.js': 'echo-mobile-card.js', 'echo-photos.js': 'echo-photos.js'}


def fingerprint(folder: Path, names) -> str:
    digest = hashlib.sha256()
    for name in sorted(names):
        digest.update(name.encode())
        digest.update((folder / name).read_bytes())
    return digest.hexdigest()[:8]


def addresses(version: str, tag: str, names) -> dict[str, str]:
    return {name: f'{URL_BASE}/{name}?v={version}-{tag}' for name in names}


def plan(items: list[dict], wanted: dict[str, str]) -> tuple[list, list, list]:
    """What to change in the resource list. Returns (updates [(id, url)], new urls, ids to delete).
    Our own entries, and hand-installed copies of the same files, are pointed at the current version; a second copy
    of the same card is deleted, as only one can load."""
    updates, deletes, filled = [], [], set()
    for item in items:
        path = str(item.get('url', '')).split('?')[0]
        name = path.rsplit('/', 1)[-1]
        ours = path.startswith(URL_BASE + '/')
        slot = SLOT_OF.get(name)
        if slot is None:
            continue
        if slot in wanted and slot not in filled:
            filled.add(slot)
            if item.get('url') != wanted[slot] or item.get('type') != 'module':
                updates.append((item['id'], wanted[slot]))
        elif ours or slot in filled:
            deletes.append(item['id'])
    creates = [url for slot, url in wanted.items() if slot not in filled]
    return updates, creates, deletes


def _resources(hass):
    data = hass.data.get('lovelace')
    if data is None:
        return None
    resources = data.get('resources') if isinstance(data, dict) else getattr(data, 'resources', None)
    # Resources kept in YAML can't be changed from here: that collection has no create.
    return resources if hasattr(resources, 'async_create_item') else None


async def _loaded(resources):
    if not getattr(resources, 'loaded', True):
        await resources.async_load()
        resources.loaded = True
    return list(resources.async_items())


async def async_register(hass, version: str, with_photos: bool) -> str:
    from homeassistant.components.http import StaticPathConfig  # noqa: PLC0415

    names = CARDS + ((PHOTOS,) if with_photos else ())
    tag = await hass.async_add_executor_job(fingerprint, WWW, CARDS + (PHOTOS,))
    await hass.http.async_register_static_paths([StaticPathConfig(URL_BASE, str(WWW), True)])
    wanted = addresses(version, tag, names)
    resources = _resources(hass)
    if resources is None:
        from homeassistant.components.frontend import add_extra_js_url  # noqa: PLC0415
        for url in wanted.values():
            add_extra_js_url(hass, url)
        return 'loaded on every page (resources are kept in YAML)'
    updates, creates, deletes = plan(await _loaded(resources), wanted)
    for item_id in deletes:
        await resources.async_delete_item(item_id)
    for item_id, url in updates:
        await resources.async_update_item(item_id, {'res_type': 'module', 'url': url})
    for url in creates:
        await resources.async_create_item({'res_type': 'module', 'url': url})
    return f'version {version}-{tag} ({len(creates)} added, {len(updates)} updated, {len(deletes)} removed)'


async def async_unregister(hass) -> None:
    resources = _resources(hass)
    if resources is None:
        return
    for item in await _loaded(resources):
        if str(item.get('url', '')).startswith(URL_BASE + '/'):
            await resources.async_delete_item(item['id'])
