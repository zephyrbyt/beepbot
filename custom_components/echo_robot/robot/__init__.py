"""Timers and reminders for the Echo robot screens.

Timers: Home Assistant already keeps voice timers, but only tells the speaker that started them. This shares
the list (name, how long is left) with the robot screens, so they can count down. It only reads that list.

Reminders: "remind me to take the bins out at 6". They're kept here, in Home Assistant's own storage, said out
loud on the Echo when due and shown on the screens. The words are understood on the server, so asking for a
reminder in one of the usual ways doesn't go to the chat assistant. Only logged-in users can see or change them.

Alarms: "wake me up at 7". Kept with the reminders. Before the time, the wake-up lights come up slowly (wake.py);
at the time, the Echo says good morning, again every couple of minutes until someone says they're up.
"""
from __future__ import annotations

from datetime import datetime, timedelta
import logging
import re
import time

try:
    import probatio as vol
except ImportError:  # older Home Assistant
    import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv, intent
from homeassistant.helpers.event import async_track_point_in_utc_time, async_track_time_interval
from homeassistant.helpers.http import HomeAssistantView
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import ConfigType
from homeassistant.util import dt as dt_util

from .book import Book, MAX_REMINDERS, _words
from .bops import BopShelf
from .wake import Sunrise
from .words import NoTime, clock_words, parse_alarm, parse_reminder, speak_when, you_form

DOMAIN = 'echo_robot'
_LOGGER = logging.getLogger(__name__)
CONFIG_SCHEMA = vol.Schema({DOMAIN: vol.Schema({
    vol.Optional('announce', default=[]): cv.entity_ids,
    vol.Optional('wake_lights', default=[]): cv.entity_ids,          # lights that come up before an alarm
    vol.Optional('wake_minutes', default=15): vol.All(int, vol.Range(min=0, max=60)),   # 0: no wake-up light
})}, extra=vol.ALLOW_EXTRA)
DONE_KEEP_SECONDS = 120
SNOOZE_MINUTES = 10
ALARM_SNOOZE_MINUTES = 9
ALARM_REPEAT_SECONDS = 120


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    settings = config.get(DOMAIN) or {}
    hub = Hub(hass, settings.get('announce', []), settings.get('wake_lights', []), settings.get('wake_minutes', 15))
    await hub.start()
    hass.data[DOMAIN] = hub
    for command in (ws_subscribe, ws_timer_cancel, ws_reminder_done, ws_reminder_snooze, ws_bops, ws_bop_save, ws_bop_delete, ws_bop_use):
        websocket_api.async_register_command(hass, command)
    for handler in (AddReminder(), ListReminders(), CancelReminder(), SetAlarm(), ListAlarms(), StopAlarm(), SnoozeAlarm()):
        intent.async_register(hass, handler)
    hass.http.register_view(EchoRobotView())
    return True


class Hub:
    def __init__(self, hass: HomeAssistant, announce: list[str], wake_lights: list[str] | None = None, wake_minutes: int = 15):
        self.hass = hass
        self.announce = announce
        self.wake_minutes = wake_minutes
        self.store = Store(hass, 1, f'{DOMAIN}.reminders')
        self.listeners: set = set()
        self._repeats: dict[str, object] = {}
        now = lambda: dt_util.now().timestamp()
        self.sunrise = Sunrise(hass, wake_lights, wake_minutes, now, self._every)
        self.book = Book(now, self._schedule, self._changed, self._ring)
        self._timers_seen: dict[str, dict] = {}
        self._done: list[dict] = []
        self._poll_stop = None
        self._timer_key = None
        self._warned = False
        # Bops: the robot screens' face characters (bops.py), kept apart from the reminders
        self.bop_store = Store(hass, 1, f'{DOMAIN}.bops')
        self.bop_listeners: set = set()
        self.bops = BopShelf(self._bops_changed)

    async def start(self):
        saved = await self.store.async_load() or {}
        self.book.load(saved.get('items'))
        self._plan_alarms()
        self.bops.load(await self.bop_store.async_load())

    @callback
    def _bops_changed(self):
        self.bop_store.async_delay_save(self.bops.dump, 1)
        data = self.bops.snapshot()
        for send in list(self.bop_listeners):
            send(data)

    # ---- sharing with the screens ----
    def snapshot(self) -> dict:
        now = time.time()
        self._done = [d for d in self._done if now - d['at'] <= DONE_KEEP_SECONDS]
        return {'now': now * 1000, 'timers': [dict(t, ends=t['ends'] and t['ends'] * 1000) for t in self._timers_seen.values()],
                'done': [dict(d, at=d['at'] * 1000) for d in self._done], 'reminders': [
                    dict(r, due=r['due'] * 1000, rang=r['rang'] and r['rang'] * 1000) for r in self.book.snapshot()]}

    def add_listener(self, send):
        self.listeners.add(send)
        if self._poll_stop is None:
            self._read_timers()
            self._poll_stop = async_track_time_interval(self.hass, self._poll, timedelta(seconds=1))

        def remove():
            self.listeners.discard(send)
            if not self.listeners and self._poll_stop:
                self._poll_stop()
                self._poll_stop = None
        return remove

    @callback
    def _changed(self):
        self.store.async_delay_save(lambda: {'items': self.book.dump()}, 1)
        self._plan_alarms()
        self._send()

    def _send(self):
        if not self.listeners:
            return
        data = self.snapshot()
        for send in list(self.listeners):
            send(data)

    @callback
    def _poll(self, _now=None):
        if self._read_timers():
            self._send()

    # ---- timers: read from Home Assistant's own timer list, never changed except to cancel ----
    def timer_manager(self):
        try:
            from homeassistant.components.intent.const import TIMER_DATA
        except ImportError:
            TIMER_DATA = None
        manager = self.hass.data.get(TIMER_DATA) if TIMER_DATA else None
        if manager is None and not self._warned:
            self._warned = True
            _LOGGER.warning('Home Assistant\'s timer list was not found, so the screens can\'t show timers')
        return manager

    def _read_timers(self) -> bool:
        """Reads the timers. Returns True if anything changed."""
        manager = self.timer_manager()
        timers = dict(getattr(manager, 'timers', {}) or {})
        key = tuple(sorted((t.id, t.seconds, t.is_active, t.updated_at, t.name) for t in timers.values()))
        if key == self._timer_key:
            return False
        self._timer_key = key
        now, mono = time.time(), time.monotonic_ns()
        seen = {}
        for timer in timers.values():
            left = timer.seconds - ((mono - timer.updated_at) / 1e9 if timer.is_active else 0)
            seen[timer.id] = {'id': timer.id, 'name': timer.name or '', 'command': timer.conversation_command or '',
                              'total': getattr(timer, 'created_seconds', timer.seconds), 'left': max(0.0, left),
                              'ends': now + max(0.0, left) if timer.is_active else None, 'paused': not timer.is_active,
                              'device_id': timer.device_id, 'area': timer.area_name or ''}
        for timer_id, old in self._timers_seen.items():
            # Gone with no time left means it finished; gone early means it was cancelled.
            if timer_id not in seen and old['ends'] and old['ends'] - now <= 1.5:
                self._done.append({'id': timer_id, 'name': old['name'], 'command': old['command'], 'total': old['total'],
                                   'device_id': old['device_id'], 'at': now})
        self._timers_seen = seen
        return True

    def cancel_timer(self, timer_id: str) -> bool:
        manager = self.timer_manager()
        if not manager or timer_id not in manager.timers:
            return False
        manager.cancel_timer(timer_id)
        self._poll()
        return True

    # ---- reminders ----
    def _schedule(self, at: float, fn):
        return async_track_point_in_utc_time(self.hass, callback(lambda _now: fn()), dt_util.utc_from_timestamp(at))

    def _every(self, seconds: float, fn):
        return async_track_time_interval(self.hass, callback(lambda _now: fn()), timedelta(seconds=seconds))

    def _ring(self, item: dict):
        if item['kind'] == 'alarm':
            self._wake(item)
            return
        message = f"Reminder: {you_form(item['text'])}." if item['text'] else 'This is your reminder.'
        self.hass.bus.async_fire(f'{DOMAIN}_reminder', {'id': item['id'], 'text': item['text']})
        self._say(message)

    # ---- alarms ----
    def _wake(self, item: dict):
        self.sunrise.finish(item['id'])
        self.hass.bus.async_fire(f'{DOMAIN}_alarm', {'id': item['id']})
        self._say(f"Good morning! It's {clock_words(dt_util.now())}.")
        alarm_id = item['id']
        self._stop_repeat(alarm_id)
        self._repeats[alarm_id] = self._every(ALARM_REPEAT_SECONDS, lambda: self._wake_again(alarm_id))

    def _wake_again(self, alarm_id: str):
        item = self.book.items.get(alarm_id)
        if not item or item['status'] != 'ringing':
            self._stop_repeat(alarm_id)
            return
        self._say(f"It's {clock_words(dt_util.now())}. Time to get up.")

    def _stop_repeat(self, alarm_id: str):
        cancel = self._repeats.pop(alarm_id, None)
        if cancel:
            cancel()

    def _plan_alarms(self):
        self.sunrise.plan(self.book.waiting('alarm'), self._schedule)
        for alarm_id in list(self._repeats):
            item = self.book.items.get(alarm_id)
            if not item or item['status'] != 'ringing':
                self._stop_repeat(alarm_id)

    def add_alarm_from_words(self, words: str) -> tuple[dict | None, str]:
        now = dt_util.now()
        try:
            due, relative = _alarm_when(words, now)
        except NoTime as error:
            return None, _no_alarm_reply(str(error))
        when = speak_when(due, now, relative)
        for other in self.book.waiting('alarm'):
            if abs(other['due'] - due.timestamp()) < 60:
                return other, f'You already have an alarm {when}.'
        if len(self.book.items) >= MAX_REMINDERS:
            return None, f'You already have {MAX_REMINDERS} reminders and alarms. Cancel some first.'
        item = self.book.add('', due.timestamp(), kind='alarm')
        speech = f"Okay, I'll wake you {when}."
        if self.sunrise.ready() and (due - now).total_seconds() > self.wake_minutes * 60 + 60:
            speech += f' The light will start coming up at {clock_words(due - timedelta(minutes=self.wake_minutes))}.'
        return item, speech

    def alarm_when(self, item: dict) -> str:
        return speak_when(dt_util.as_local(dt_util.utc_from_timestamp(item['due'])), dt_util.now())

    def _say(self, message: str):
        for entity_id in self.announce:
            state = self.hass.states.get(entity_id)
            if state is None or state.state in ('unavailable', 'unknown'):
                continue
            self.hass.async_create_task(self.hass.services.async_call(
                'assist_satellite', 'announce', {'entity_id': entity_id, 'message': message}, blocking=True))

    def add_from_words(self, words: str, when_words: str | None = None) -> tuple[dict | None, str]:
        now = dt_util.now()
        try:
            if when_words:
                task = (words or '').strip()
                due, relative = _when_only(when_words, now)
            else:
                task, due, relative = parse_reminder(words or '', now)
        except NoTime as error:
            return None, _no_time_reply(str(error))
        if len(self.book.items) >= MAX_REMINDERS:
            return None, f'You already have {MAX_REMINDERS} reminders. Cancel some first.'
        item = self.book.add(task, due.timestamp())
        what = _about(task)
        return item, f"Okay, I'll remind you{what} {speak_when(due, now, relative)}."

    def describe(self, item: dict) -> str:
        now = dt_util.now()
        due = dt_util.as_local(dt_util.utc_from_timestamp(item['due']))
        what = you_form(item['text']) if item['text'] else 'a reminder'
        return f'{what} {speak_when(due, now)}'


def _when_only(when_words: str, now: datetime):
    try:
        due = datetime.fromisoformat(when_words.strip())
        due = due if due.tzinfo else due.replace(tzinfo=now.tzinfo)
        if due <= now:
            raise NoTime('that time has passed')
        return due, False
    except ValueError:
        pass
    _, due, relative = parse_reminder(when_words, now)
    return due, relative


def _alarm_when(words: str, now: datetime):
    try:
        due = datetime.fromisoformat((words or '').strip())
        due = due if due.tzinfo else due.replace(tzinfo=now.tzinfo)
        if due <= now:
            raise NoTime('that time has passed')
        return due, False
    except ValueError:
        pass
    return parse_alarm(words or '', now)


def _no_alarm_reply(reason: str) -> str:
    if reason == 'too far ahead':
        return 'I can only set alarms up to a year ahead.'
    if reason == 'that time has passed':
        return 'That time has already gone. What time should I wake you?'
    return 'What time should I wake you? You could say, wake me up at 7.'


def _about(task: str) -> str:
    if not task:
        return ''
    first = task.split()[0]
    if first.lower() in ('the', 'my', 'your', 'a', 'an', 'his', 'her', 'their', 'our', 'this', 'that') or first[:1].isupper() and len(task.split()) == 1:
        return f' about {you_form(task)}'
    return f' to {you_form(task)}'


def _no_time_reply(reason: str) -> str:
    if reason == 'too soon':
        return 'That\'s a bit soon for a reminder. A timer might be better.'
    if reason == 'too far ahead':
        return 'I can only set reminders up to a year ahead.'
    if reason == 'that time has passed':
        return 'That time has already gone. When should I remind you?'
    return 'When should I remind you? You could say, remind me to take the bins out at 6.'


def _join(parts: list[str]) -> str:
    return parts[0] if len(parts) == 1 else ', '.join(parts[:-1]) + ' and ' + parts[-1]


def list_words(hub: Hub) -> str:
    waiting = hub.book.waiting('reminder')
    missed = [r for r in hub.book.ringing('reminder') if r['status'] == 'missed']
    if not waiting and not missed:
        return 'You don\'t have any reminders.'
    parts = []
    if waiting:
        shown = [hub.describe(r) for r in waiting[:5]]
        more = f', and {len(waiting) - 5} more' if len(waiting) > 5 else ''
        parts.append(f"You have {'one reminder' if len(waiting) == 1 else f'{len(waiting)} reminders'}: {_join(shown)}{more}.")
    if missed:
        what = you_form(missed[0]['text']) or 'a reminder'
        parts.append(f'You missed one: {what}.' if len(missed) == 1 else f'You missed {len(missed)}, including {what}.')
    return ' '.join(parts)


def cancel_words(hub: Hub, words: str, everything: bool) -> str:
    book = hub.book
    if everything:
        gone = book.remove_all('reminder')
        return 'You don\'t have any reminders.' if not gone else f"Okay, I've cancelled {'your reminder' if len(gone) == 1 else f'all {len(gone)} reminders'}."
    if not book.of_kind('reminder'):
        return 'You don\'t have any reminders.'
    if _words(words):       # not just "my" or "the", which the phrase matcher can leave here
        found = book.find(words)
        if not found:
            return 'I couldn\'t find a reminder like that.'
    else:
        ringing = book.ringing('reminder')
        found = ringing if len(ringing) == 1 else book.of_kind('reminder')
    if len(found) > 1:
        return f'You have {len(found)} reminders like that: {_join([hub.describe(r) for r in found[:4]])}. Which one should I cancel?'
    book.remove(found[0]['id'])
    return f"Okay, I've cancelled the reminder{_about(found[0]['text'])}." if found[0]['text'] else 'Okay, I\'ve cancelled it.'


# Words that can end up where a time or a reminder's words should be ("turn off the alarm" can give "the").
NOT_A_TIME = {'the', 'my', 'that', 'this', 'a', 'an', 'please', 'thanks', 'thank', 'you', 'wake', 'up', 'wake-up', 'alarm', 'alarms'}


def _no_time_in(words: str) -> bool:
    return not [w for w in re.findall(r"[a-z0-9':-]+", (words or '').lower()) if w not in NOT_A_TIME]


def alarm_list_words(hub: Hub) -> str:
    alarms = sorted((a for a in hub.book.of_kind('alarm') if a['status'] != 'missed'), key=lambda a: a['due'])
    if not alarms:
        return 'You don\'t have an alarm set.'
    if any(a['status'] == 'ringing' for a in alarms):
        return 'Your alarm is going off now. Say I\'m up to stop it, or snooze.'
    if len(alarms) == 1:
        return f'You have an alarm {hub.alarm_when(alarms[0])}.'
    return f'You have {len(alarms)} alarms: {_join([hub.alarm_when(a) for a in alarms[:5]])}.'


def alarm_stop_words(hub: Hub, words: str = '', everything: bool = False, awake: bool = False, soundalike: bool = False) -> str:
    """ "Stop the alarm" or "I'm up" stops one going off; "cancel my 7 am alarm" cancels a waiting one."""
    book = hub.book
    if _no_time_in(words):
        words = ''
    if everything:
        gone = book.remove_all('alarm')
        return 'You don\'t have any alarms.' if not gone else f"Okay, I've turned off {'your alarm' if len(gone) == 1 else f'all {len(gone)} alarms'}."
    ringing = [a for a in book.of_kind('alarm') if a['status'] == 'ringing']
    if ringing and not (words or '').strip():
        for a in ringing:
            book.remove(a['id'])
        return 'Okay, alarm off. Good morning!'
    now = dt_util.now()
    alarms = sorted(book.of_kind('alarm'), key=lambda a: a['due'])
    if awake:
        # "I'm up" while the light is coming up: no need for the alarm after all.
        soon = [a for a in alarms if a['status'] == 'pending' and a['due'] - now.timestamp() <= hub.wake_minutes * 60 + 300]
        if not soon:
            # "Hi Mark" can be a misheard "I'm up", but with no alarm about it was probably just hello.
            return 'Hi there!' if soundalike else 'There\'s no alarm going off.'
        book.remove(soon[0]['id'])
        return f"Okay, I've turned off your alarm for {clock_words(dt_util.as_local(dt_util.utc_from_timestamp(soon[0]['due'])))}. Good morning!"
    if not alarms:
        return 'You don\'t have an alarm set.'
    found = alarms
    if (words or '').strip():
        try:
            wanted, _ = parse_alarm(words, now)
            found = [a for a in alarms if (lambda d: (d.hour, d.minute) == (wanted.hour, wanted.minute))(dt_util.as_local(dt_util.utc_from_timestamp(a['due'])))]
        except NoTime:
            found = []
        if not found:
            return 'I couldn\'t find an alarm at that time.'
    if len(found) > 1:
        return f'You have {len(found)} alarms: {_join([hub.alarm_when(a) for a in found[:4]])}. Which one should I cancel?'
    when = hub.alarm_when(found[0])
    book.remove(found[0]['id'])
    return f"Okay, I've cancelled your alarm {when}."


def snooze_words(hub: Hub) -> str:
    book = hub.book
    for kind, minutes, again in (('alarm', ALARM_SNOOZE_MINUTES, 'wake you'), ('reminder', SNOOZE_MINUTES, 'remind you')):
        ringing = [a for a in book.of_kind(kind) if a['status'] == 'ringing']
        if ringing:
            for a in ringing:
                book.snooze(a['id'], minutes)
            return f"Okay, I'll {again} again in {minutes} minutes."
    return 'There\'s nothing going off to snooze.'


def _hub(hass) -> Hub:
    return hass.data[DOMAIN]


# ---- voice: matched on the server by custom_sentences/en/echo_reminders.yaml ----
class AddReminder(intent.IntentHandler):
    intent_type = 'EchoReminderAdd'
    description = 'Sets a reminder that is said out loud and shown on the robot screens when it is due'
    slot_schema = {vol.Optional('reminder'): cv.string}

    async def async_handle(self, intent_obj):
        words = intent_obj.slots.get('reminder', {}).get('value', '')
        _, speech = _hub(intent_obj.hass).add_from_words(words)
        response = intent_obj.create_response()
        response.async_set_speech(speech)
        return response


class ListReminders(intent.IntentHandler):
    intent_type = 'EchoReminderList'
    description = 'Says which reminders are set'

    async def async_handle(self, intent_obj):
        response = intent_obj.create_response()
        response.async_set_speech(list_words(_hub(intent_obj.hass)))
        return response


class CancelReminder(intent.IntentHandler):
    intent_type = 'EchoReminderCancel'
    description = 'Cancels or dismisses a reminder'
    slot_schema = {vol.Optional('reminder'): cv.string, vol.Optional('everything'): cv.string}

    async def async_handle(self, intent_obj):
        slots = intent_obj.slots
        speech = cancel_words(_hub(intent_obj.hass), slots.get('reminder', {}).get('value', ''), bool(slots.get('everything')))
        response = intent_obj.create_response()
        response.async_set_speech(speech)
        return response


class SetAlarm(intent.IntentHandler):
    intent_type = 'EchoAlarmSet'
    description = 'Sets a wake-up alarm; the bedroom light comes up slowly before it'
    slot_schema = {vol.Optional('alarm'): cv.string}

    async def async_handle(self, intent_obj):
        _, speech = _hub(intent_obj.hass).add_alarm_from_words(intent_obj.slots.get('alarm', {}).get('value', ''))
        response = intent_obj.create_response()
        response.async_set_speech(speech)
        return response


class ListAlarms(intent.IntentHandler):
    intent_type = 'EchoAlarmList'
    description = 'Says which alarms are set'

    async def async_handle(self, intent_obj):
        response = intent_obj.create_response()
        response.async_set_speech(alarm_list_words(_hub(intent_obj.hass)))
        return response


class StopAlarm(intent.IntentHandler):
    intent_type = 'EchoAlarmStop'
    description = 'Stops an alarm that is going off, or cancels one'
    slot_schema = {vol.Optional('alarm'): cv.string, vol.Optional('everything'): cv.string, vol.Optional('awake'): cv.string,
                   vol.Optional('soundalike'): cv.string}

    async def async_handle(self, intent_obj):
        slots = intent_obj.slots
        speech = alarm_stop_words(_hub(intent_obj.hass), slots.get('alarm', {}).get('value', ''),
                                  bool(slots.get('everything')), bool(slots.get('awake')), bool(slots.get('soundalike')))
        response = intent_obj.create_response()
        response.async_set_speech(speech)
        return response


class SnoozeAlarm(intent.IntentHandler):
    intent_type = 'EchoAlarmSnooze'
    description = 'Snoozes an alarm or reminder that is going off'

    async def async_handle(self, intent_obj):
        response = intent_obj.create_response()
        response.async_set_speech(snooze_words(_hub(intent_obj.hass)))
        return response


# ---- the screens ----
@websocket_api.websocket_command({vol.Required('type'): 'echo_robot/subscribe'})
@callback
def ws_subscribe(hass, connection, msg):
    hub = _hub(hass)

    def send(data):
        connection.send_message(websocket_api.event_message(msg['id'], data))
    connection.subscriptions[msg['id']] = hub.add_listener(send)
    connection.send_result(msg['id'])
    send(hub.snapshot())


@websocket_api.websocket_command({vol.Required('type'): 'echo_robot/timer_cancel', vol.Required('timer_id'): str})
@callback
def ws_timer_cancel(hass, connection, msg):
    if _hub(hass).cancel_timer(msg['timer_id']):
        connection.send_result(msg['id'])
    else:
        connection.send_error(msg['id'], 'not_found', 'That timer has already finished')


@websocket_api.websocket_command({vol.Required('type'): 'echo_robot/reminder_done', vol.Required('reminder_id'): str})
@callback
def ws_reminder_done(hass, connection, msg):
    _hub(hass).book.remove(msg['reminder_id'])
    connection.send_result(msg['id'])


@websocket_api.websocket_command({vol.Required('type'): 'echo_robot/reminder_snooze', vol.Required('reminder_id'): str,
                                  vol.Optional('minutes', default=SNOOZE_MINUTES): vol.All(int, vol.Range(min=1, max=1440))})
@callback
def ws_reminder_snooze(hass, connection, msg):
    if _hub(hass).book.snooze(msg['reminder_id'], msg['minutes']):
        connection.send_result(msg['id'])
    else:
        connection.send_error(msg['id'], 'not_found', 'That reminder has gone')


# ---- Bops: the face characters every screen can pick from (bops.py) ----
@websocket_api.websocket_command({vol.Required('type'): 'echo_robot/bops'})
@callback
def ws_bops(hass, connection, msg):
    hub = _hub(hass)

    def send(data):
        connection.send_message(websocket_api.event_message(msg['id'], data))
    hub.bop_listeners.add(send)
    connection.subscriptions[msg['id']] = lambda: hub.bop_listeners.discard(send)
    connection.send_result(msg['id'])
    send(hub.bops.snapshot())


@websocket_api.websocket_command({vol.Required('type'): 'echo_robot/bop_save', vol.Required('bop'): dict})
@callback
def ws_bop_save(hass, connection, msg):
    try:
        connection.send_result(msg['id'], _hub(hass).bops.save(msg['bop']))
    except ValueError as err:
        connection.send_error(msg['id'], 'invalid_format', str(err))


@websocket_api.websocket_command({vol.Required('type'): 'echo_robot/bop_delete', vol.Required('bop_id'): str})
@callback
def ws_bop_delete(hass, connection, msg):
    _hub(hass).bops.delete(msg['bop_id'])
    connection.send_result(msg['id'])


@websocket_api.websocket_command({vol.Required('type'): 'echo_robot/bop_use', vol.Required('device_id'): str, vol.Required('bop'): dict})
@callback
def ws_bop_use(hass, connection, msg):
    try:
        connection.send_result(msg['id'], _hub(hass).bops.use(msg['device_id'], msg['bop']))
    except ValueError as err:
        connection.send_error(msg['id'], 'invalid_format', str(err))


class EchoRobotView(HomeAssistantView):
    """GET /api/echo_robot: lets the installer check the add-on loaded. Needs a login, like everything here."""

    url = '/api/echo_robot'
    name = 'api:echo_robot'
    requires_auth = True

    async def get(self, request):
        return self.json({'ok': True})

