"""Reminder and alarm tools for a chat assistant (Grok, through Home Assistant's Assist tools).

Most reminder requests are understood on the server and never reach the assistant. These are for the ones
worded differently. The reminder itself is still kept here, in Home Assistant.
"""
from __future__ import annotations

try:
    import probatio as vol
except ImportError:
    import voluptuous as vol

from homeassistant.components.llm import LLMTools
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.llm import LLM_API_ASSIST, LLMContext, Tool, ToolAnnotations, ToolInput, ToolResult

from . import DOMAIN, alarm_list_words, alarm_stop_words, cancel_words, list_words


class SetReminderTool(Tool):
    name = f'{DOMAIN}__set_reminder'
    title = 'Set a reminder'
    description = ('Set a reminder. When it is due it is said out loud and shown on the home screens. '
                   'Use this for "remind me" requests; use a timer for plain countdowns. '
                   'Reply to the person with the speech this returns.')
    parameters = vol.Schema({
        vol.Required('task', description='What to remind them about, in their words, such as "take the bins out". Can be empty.'): str,
        vol.Required('when', description='When, as they said it: "in 10 minutes", "at 6pm", "tomorrow at 9am", "on Friday at noon".'): str,
    })
    annotations = ToolAnnotations(destructive=False, open_world=False)
    integration = DOMAIN

    async def async_call(self, hass: HomeAssistant, tool_input: ToolInput, llm_context: LLMContext) -> ToolResult:
        args = self.parameters(tool_input.tool_args)
        item, speech = hass.data[DOMAIN].add_from_words(args['task'], args['when'])
        return ToolResult(data={'speech': speech, 'set': item is not None}, error=item is None)


class ListRemindersTool(Tool):
    name = f'{DOMAIN}__list_reminders'
    title = 'List reminders'
    description = 'Say which reminders are set. Reply with the speech this returns.'
    annotations = ToolAnnotations(read_only=True, destructive=False, idempotent=True, open_world=False)
    integration = DOMAIN

    async def async_call(self, hass: HomeAssistant, tool_input: ToolInput, llm_context: LLMContext) -> ToolResult:
        return ToolResult(data={'speech': list_words(hass.data[DOMAIN])})


class CancelReminderTool(Tool):
    name = f'{DOMAIN}__cancel_reminder'
    title = 'Cancel a reminder'
    description = ('Cancel a reminder, or stop one that is going off. Give some of its words, or set everything to true '
                   'only when they asked to cancel all of them. Reply with the speech this returns.')
    parameters = vol.Schema({
        vol.Optional('task', description='Words from the reminder, such as "bins".'): str,
        vol.Optional('everything', description='True only if they asked to cancel all reminders.'): bool,
    })
    annotations = ToolAnnotations(open_world=False)
    integration = DOMAIN

    async def async_call(self, hass: HomeAssistant, tool_input: ToolInput, llm_context: LLMContext) -> ToolResult:
        args = self.parameters(tool_input.tool_args)
        return ToolResult(data={'speech': cancel_words(hass.data[DOMAIN], args.get('task', ''), bool(args.get('everything')))})


class SetAlarmTool(Tool):
    name = f'{DOMAIN}__set_alarm'
    title = 'Set a wake-up alarm'
    description = ('Set a wake-up alarm. Before it, the bedroom light comes up slowly; at the time, the Echo says good morning '
                   'until they say they are up. Use this for alarms and "wake me up" requests, not a timer. '
                   'Reply with the speech this returns.')
    parameters = vol.Schema({
        vol.Required('when', description='When, as they said it: "at 7", "at 6:30 am", "tomorrow at 6", "in 8 hours". A bare hour means the morning.'): str,
    })
    annotations = ToolAnnotations(destructive=False, open_world=False)
    integration = DOMAIN

    async def async_call(self, hass: HomeAssistant, tool_input: ToolInput, llm_context: LLMContext) -> ToolResult:
        args = self.parameters(tool_input.tool_args)
        item, speech = hass.data[DOMAIN].add_alarm_from_words(args['when'])
        return ToolResult(data={'speech': speech, 'set': item is not None}, error=item is None)


class ListAlarmsTool(Tool):
    name = f'{DOMAIN}__list_alarms'
    title = 'List alarms'
    description = 'Say which wake-up alarms are set. Reply with the speech this returns.'
    annotations = ToolAnnotations(read_only=True, destructive=False, idempotent=True, open_world=False)
    integration = DOMAIN

    async def async_call(self, hass: HomeAssistant, tool_input: ToolInput, llm_context: LLMContext) -> ToolResult:
        return ToolResult(data={'speech': alarm_list_words(hass.data[DOMAIN])})


class CancelAlarmTool(Tool):
    name = f'{DOMAIN}__cancel_alarm'
    title = 'Stop or cancel an alarm'
    description = ('Stop an alarm that is going off, or cancel a wake-up alarm. Give its time if they said one; set everything '
                   'to true only when they asked to cancel all alarms. Reply with the speech this returns.')
    parameters = vol.Schema({
        vol.Optional('when', description='The alarm\'s time, if they said one, such as "7 am".'): str,
        vol.Optional('everything', description='True only if they asked to cancel all alarms.'): bool,
    })
    annotations = ToolAnnotations(open_world=False)
    integration = DOMAIN

    async def async_call(self, hass: HomeAssistant, tool_input: ToolInput, llm_context: LLMContext) -> ToolResult:
        args = self.parameters(tool_input.tool_args)
        return ToolResult(data={'speech': alarm_stop_words(hass.data[DOMAIN], args.get('when', ''), bool(args.get('everything')))})


@callback
def async_get_tools(hass: HomeAssistant, llm_context: LLMContext, api_id: str) -> LLMTools | None:
    if api_id != LLM_API_ASSIST or DOMAIN not in hass.data:
        return None
    return LLMTools(tools=[SetReminderTool(), ListRemindersTool(), CancelReminderTool(), SetAlarmTool(), ListAlarmsTool(), CancelAlarmTool()])
