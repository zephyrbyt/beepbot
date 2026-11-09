"""Beepbot: the robot face for a Home Assistant screen, as one integration that HACS can install and update.

It brings everything the robot needs from Home Assistant's side, so an update is one tap in HACS and a restart:
  - the dashboard cards, served from this folder and added to your dashboards' resources by itself, with the
    version in the address so screens fetch the new card after an update (frontend.py);
  - timers, reminders and alarms (robot/);
  - lyrics for what's playing, and lining radio lyrics up (lyrics/);
  - an idle photo slideshow from an Immich album on your own network, if you set one up (photos/);
  - the spoken phrases for reminders and alarms, copied into custom_sentences/en (sentences.py).

Set it up under Settings > Devices & services > Add integration > Beepbot. A section in configuration.yaml
works too (it then takes the place of the settings page):

    echo_robot:
      announce: [assist_satellite.kitchen_echo]   # where reminders and alarms are said
      wake_lights: [light.bedroom]                 # lights that come up slowly before an alarm
      wake_minutes: 15
      lyrics: true
      lyrics_sources: all                          # or "open": LRCLIB only
      photos:                                      # optional, YAML only, because of the key
        album: Echo Show
        api_key: !secret echo_photos_immich_key
        url: http://127.0.0.1:2283

The parts can't be taken down while Home Assistant runs, so changed settings apply after a restart.
"""
from __future__ import annotations

import logging

try:
    import probatio as vol
except ImportError:
    import voluptuous as vol

from homeassistant.components import persistent_notification
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.start import async_at_started
from homeassistant.helpers.typing import ConfigType
from homeassistant.loader import async_get_integration

from . import frontend, sentences
from .const import DEFAULTS, DOMAIN, LYRICS_SOURCES, OPEN_SOURCES, STATE

_LOGGER = logging.getLogger(__name__)

PHOTOS_SCHEMA = vol.Schema({
    vol.Required('album'): cv.string,
    vol.Required('api_key'): cv.string,
    vol.Optional('url', default='http://127.0.0.1:2283'): cv.string,
    vol.Optional('admin_only', default=True): cv.boolean,
})
CONFIG_SCHEMA = vol.Schema({DOMAIN: vol.Schema({
    vol.Optional('announce', default=[]): cv.entity_ids,
    vol.Optional('wake_lights', default=[]): cv.entity_ids,
    vol.Optional('wake_minutes', default=15): vol.All(vol.Coerce(int), vol.Range(min=0, max=60)),
    vol.Optional('lyrics', default=True): cv.boolean,
    vol.Optional('lyrics_sources', default='all'): vol.In(LYRICS_SOURCES),
    vol.Optional('phrases', default=True): cv.boolean,
    vol.Optional('photos'): PHOTOS_SCHEMA,
})}, extra=vol.ALLOW_EXTRA)

RESTART_ID = 'echo_robot_restart'


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    hass.data.setdefault(STATE, {'started': None})
    if DOMAIN in config:
        await _start(hass, config[DOMAIN], 'configuration.yaml')
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    state = hass.data.setdefault(STATE, {'started': None})
    entry.async_on_unload(entry.add_update_listener(_settings_changed))
    if state['started'] == 'configuration.yaml':
        _LOGGER.warning('Beepbot is set up in configuration.yaml, so the settings page is not used')
        return True
    if not state['started']:
        await _start(hass, {**DEFAULTS, **entry.data, **entry.options}, 'settings page')
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Nothing to take down until a restart: the parts keep running, and set up again only after one."""
    return True


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Deleted from the settings page: take the cards out of the dashboards' resources and the phrase files out of
    custom_sentences (only the ones this integration put there). The rest stops at the next restart."""
    try:
        await frontend.async_unregister(hass)
    except Exception:  # noqa: BLE001 - removal goes ahead regardless
        _LOGGER.exception('Beepbot: could not take the cards out of the resource list')
    await hass.async_add_executor_job(sentences.remove, hass.config.path())
    _restart_note(hass, 'Beepbot was removed. Restart Home Assistant to finish.')


async def _settings_changed(hass: HomeAssistant, entry: ConfigEntry) -> None:
    _restart_note(hass, 'Beepbot settings were saved. Restart Home Assistant to use them.')


def _restart_note(hass: HomeAssistant, text: str) -> None:
    persistent_notification.async_create(hass, text, title='Beepbot', notification_id=RESTART_ID)


async def _start(hass: HomeAssistant, settings: dict, source: str) -> None:
    """Start each part on its own, so one that fails (or isn't wanted) doesn't stop the others."""
    hass.data[STATE]['started'] = source
    version = (await async_get_integration(hass, DOMAIN)).version
    _LOGGER.info('Beepbot %s starting (settings from the %s)', version, source)

    from . import robot  # noqa: PLC0415 - imported here so the platform files load without starting anything
    await _part('timers, reminders and alarms', robot.async_setup(hass, {'echo_robot': {
        'announce': list(settings.get('announce') or []),
        'wake_lights': list(settings.get('wake_lights') or []),
        'wake_minutes': int(settings.get('wake_minutes', 15)),
    }}))

    if settings.get('lyrics', True):
        from . import lyrics  # noqa: PLC0415
        sources = OPEN_SOURCES if settings.get('lyrics_sources') == 'open' else None
        await _part('lyrics', lyrics.async_setup(hass, {'echo_lyrics': {'sources': sources}}))

    photos_on = False
    if settings.get('photos'):
        from . import photos  # noqa: PLC0415
        photos_on = await _part('photos', photos.async_setup(hass, {'echo_photos': settings['photos']}))

    try:
        how = await frontend.async_register(hass, version, photos_on)
        _LOGGER.info('Beepbot cards: %s', how)
    except Exception:  # noqa: BLE001 - the screens keep their old card; everything else works
        _LOGGER.exception('Beepbot: the dashboard cards could not be added. Add /echo_robot/echo-home-card.js '
                          'as a JavaScript module under Settings > Dashboards > Resources')

    if settings.get('phrases', True):
        changed = await hass.async_add_executor_job(sentences.install, hass.config.path())
        if changed:
            async def reload(_hass) -> None:
                if hass.services.has_service('conversation', 'reload'):
                    await hass.services.async_call('conversation', 'reload', {}, blocking=False)
            async_at_started(hass, reload)


async def _part(name: str, setup) -> bool:
    try:
        return bool(await setup)
    except Exception:  # noqa: BLE001 - logged with the details; the other parts carry on
        _LOGGER.exception('Beepbot: %s could not start', name)
        return False
