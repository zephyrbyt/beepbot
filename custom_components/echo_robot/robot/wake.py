"""The wake-up light: before an alarm, the chosen lights come up slowly, from a dim warm glow towards daylight.

It only touches lights that were off when it started, and lets go of any light someone switches off, or turns
up or down themselves, so it never fights a person. Nothing here is saved: after a restart it picks up again
from wherever the fade should be.
"""
from __future__ import annotations

STEP_SECONDS = 30           # how often the lights are nudged up
TRANSITION_FEATURE = 32     # LightEntityFeature.TRANSITION: the bulb can glide between steps by itself
WARM_KELVIN, DAY_KELVIN = 2200, 4000
HAND_MARGIN = 12            # brightness this far (in %) from what was last sent means someone changed it by hand
MIN_FADE_SECONDS = 60       # an alarm closer than this just goes off, without a fade


class Sunrise:
    def __init__(self, hass, lights, minutes, now, every):
        """now() gives epoch seconds; every(seconds, fn) runs fn repeatedly and returns a cancel function."""
        self.hass, self.lights, self.minutes = hass, list(lights or []), int(minutes or 0)
        self._now, self._every = now, every
        self.planned: dict[str, tuple[float, object]] = {}    # alarm id -> (due, cancel)
        self.running: dict[str, dict] = {}

    def ready(self) -> bool:
        return bool(self.lights) and self.minutes > 0

    def plan(self, alarms, schedule):
        """Given the alarms still waiting, starts or books a sunrise for each, and drops any no longer wanted."""
        wanted = {a['id']: a['due'] for a in alarms} if self.ready() else {}
        for alarm_id in list(self.planned):
            if self.planned[alarm_id][0] != wanted.get(alarm_id):
                self.planned.pop(alarm_id)[1]()
        for alarm_id in list(self.running):
            if self.running[alarm_id]['due'] != wanted.get(alarm_id):
                self.stop(alarm_id)
        now = self._now()
        for alarm_id, due in wanted.items():
            if alarm_id in self.planned or alarm_id in self.running or due <= now:
                continue
            start = due - self.minutes * 60
            if start <= now:
                # Less time than usual (an alarm set for 5 minutes' time): still start dim, just go up faster.
                self.start(alarm_id, due, begin=now)
            else:
                self.planned[alarm_id] = (due, schedule(start, lambda a=alarm_id, d=due: self._booked(a, d)))

    def _booked(self, alarm_id, due):
        self.planned.pop(alarm_id, None)
        self.start(alarm_id, due)

    def start(self, alarm_id, due, begin=None):
        begin = max(due - self.minutes * 60, begin or 0)
        if due - begin < MIN_FADE_SECONDS:
            return      # too close to fade; the alarm itself still goes off
        # Only lights that are off: if someone's already put one on, they're up.
        lights = {}
        for entity_id in self.lights:
            state = self.hass.states.get(entity_id)
            if state is not None and state.state == 'off':
                lights[entity_id] = None
        if not lights:
            return
        run = {'start': begin, 'due': due, 'lights': lights, 'stop': None}
        self.running[alarm_id] = run
        run['stop'] = self._every(STEP_SECONDS, lambda: self.step(alarm_id))
        self.step(alarm_id)

    def finish(self, alarm_id):
        """The alarm is going off: full brightness, then stop."""
        if alarm_id in self.running:
            self.step(alarm_id, final=True)
        self.stop(alarm_id)

    def stop(self, alarm_id):
        run = self.running.pop(alarm_id, None)
        if run and run['stop']:
            run['stop']()

    def step(self, alarm_id, final=False):
        run = self.running.get(alarm_id)
        if not run:
            return
        span = max(1.0, run['due'] - run['start'])
        part = 1.0 if final else max(0.0, min(1.0, (self._now() - run['start']) / span))
        pct = max(1, round(1 + 99 * part))
        for entity_id, last in list(run['lights'].items()):
            state = self.hass.states.get(entity_id)
            if state is None or state.state in ('unavailable', 'unknown'):
                continue
            a = state.attributes or {}
            if last is not None:
                brightness = a.get('brightness')
                if state.state == 'off' or (brightness is not None and abs(round(brightness / 2.55) - last) > HAND_MARGIN):
                    del run['lights'][entity_id]     # switched off or changed by hand: leave it be
                    continue
            data = {'entity_id': entity_id, 'brightness_pct': pct}
            if 'color_temp' in (a.get('supported_color_modes') or []):
                warm = max(WARM_KELVIN, int(a.get('min_color_temp_kelvin') or WARM_KELVIN))
                day = max(warm, min(DAY_KELVIN, int(a.get('max_color_temp_kelvin') or DAY_KELVIN)))
                data['color_temp_kelvin'] = round(warm + (day - warm) * part)
            if not final and int(a.get('supported_features') or 0) & TRANSITION_FEATURE:
                data['transition'] = STEP_SECONDS
            run['lights'][entity_id] = pct
            self.hass.async_create_task(self.hass.services.async_call('light', 'turn_on', data, blocking=True))
        if not run['lights'] or part >= 1:
            self.stop(alarm_id)
