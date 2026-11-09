"""The settings page: Settings > Devices & services > Add integration > Beepbot, and Configure afterwards."""
from __future__ import annotations

try:
    import probatio as vol
except ImportError:
    import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import DEFAULTS, DOMAIN, LYRICS_SOURCES, STATE


def settings_form(hass, current: dict) -> vol.Schema:
    now = {**DEFAULTS, **current}
    if not current:
        # One voice device in the house: that's almost certainly the one to say reminders on.
        satellites = hass.states.async_entity_ids('assist_satellite')
        now['announce'] = satellites if len(satellites) == 1 else []
    return vol.Schema({
        vol.Optional('announce', default=now['announce']): selector.EntitySelector(
            selector.EntitySelectorConfig(domain='assist_satellite', multiple=True)),
        vol.Optional('wake_lights', default=now['wake_lights']): selector.EntitySelector(
            selector.EntitySelectorConfig(domain='light', multiple=True)),
        vol.Optional('wake_minutes', default=now['wake_minutes']): selector.NumberSelector(
            selector.NumberSelectorConfig(min=0, max=60, step=1, mode=selector.NumberSelectorMode.BOX,
                                          unit_of_measurement='min')),
        vol.Optional('lyrics', default=now['lyrics']): selector.BooleanSelector(),
        vol.Optional('lyrics_sources', default=now['lyrics_sources']): selector.SelectSelector(
            selector.SelectSelectorConfig(options=LYRICS_SOURCES, translation_key='lyrics_sources')),
        vol.Optional('phrases', default=now['phrases']): selector.BooleanSelector(),
    })


def tidy(answer: dict) -> dict:
    return {**DEFAULTS, **answer, 'wake_minutes': int(answer.get('wake_minutes', DEFAULTS['wake_minutes']))}


class EchoRobotFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        if self._async_current_entries():
            return self.async_abort(reason='single_instance_allowed')
        if (self.hass.data.get(STATE) or {}).get('started') == 'configuration.yaml':
            return self.async_abort(reason='set_in_yaml')
        if user_input is not None:
            return self.async_create_entry(title='Beepbot', data={}, options=tidy(user_input))
        return self.async_show_form(step_id='user', data_schema=settings_form(self.hass, {}))

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return EchoRobotOptions()


class EchoRobotOptions(OptionsFlow):
    async def async_step_init(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(data=tidy(user_input))
        return self.async_show_form(step_id='init', data_schema=settings_form(self.hass, dict(self.config_entry.options)))
