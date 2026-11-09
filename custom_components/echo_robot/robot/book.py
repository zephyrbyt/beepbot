"""The reminder list: what's waiting, what's ringing, and what was missed. No Home Assistant parts in here.

A reminder waits until it's due, then rings: it's said out loud and shown on the screens until someone taps it
or says it's done. Nobody answering for RING_SECONDS makes it "missed", which stays in a corner of the screen
for a while, then goes. An alarm ("wake me up at 7") is kept the same way, marked kind "alarm".
"""
from __future__ import annotations

import re
import uuid

RING_SECONDS = 600
MISSED_SECONDS = 3 * 3600
LATE_RING_SECONDS = 3600      # due while Home Assistant was off: still ring if it's no later than this
MAX_REMINDERS = 50
MAX_TEXT = 200
KINDS = ('reminder', 'alarm')


class Book:
    def __init__(self, now, schedule, changed, ring):
        """now() gives epoch seconds; schedule(at, fn) runs fn at that time and returns a cancel function;
        changed() is called after every change; ring(item) announces one that is due."""
        self._now, self._schedule, self._changed, self._ring = now, schedule, changed, ring
        self.items: dict[str, dict] = {}
        self._cancel: dict[str, object] = {}

    # ---- keeping ----
    def load(self, saved):
        now = self._now()
        for raw in saved or []:
            try:
                item = {'id': str(raw['id']), 'text': str(raw.get('text', ''))[:MAX_TEXT], 'due': float(raw['due']),
                        'status': raw.get('status', 'pending'), 'created': float(raw.get('created', now)), 'rang': raw.get('rang'),
                        'kind': raw.get('kind') if raw.get('kind') in KINDS else 'reminder'}
            except (KeyError, TypeError, ValueError):
                continue
            if item['status'] not in ('pending', 'ringing', 'missed'):
                continue
            self.items[item['id']] = item
            if item['status'] == 'pending' and item['due'] <= now:
                # It came due while Home Assistant was away.
                if now - item['due'] <= LATE_RING_SECONDS:
                    self._start_ringing(item, announce=True)
                else:
                    item.update(status='missed', rang=item['due'])
            elif item['status'] == 'ringing':
                item['status'] = 'missed'   # a restart ends the ringing
            self._arm(item)
        self._tidy()

    def dump(self):
        return [dict(item) for item in self.items.values()]

    def snapshot(self):
        return sorted(({k: v for k, v in item.items() if k != 'created'} for item in self.items.values()),
                      key=lambda x: (x['status'] != 'ringing', x['due']))

    # ---- changing ----
    def add(self, text, due, kind='reminder'):
        if len(self.items) >= MAX_REMINDERS:
            raise ValueError('too many reminders')
        now = self._now()
        item = {'id': uuid.uuid4().hex[:12], 'text': (text or '').strip()[:MAX_TEXT], 'due': float(due),
                'status': 'pending', 'created': now, 'rang': None, 'kind': kind if kind in KINDS else 'reminder'}
        self.items[item['id']] = item
        if item['due'] <= now:
            self._start_ringing(item, announce=True)
        self._arm(item)
        self._changed()
        return item

    def remove(self, reminder_id):
        item = self.items.pop(reminder_id, None)
        self._disarm(reminder_id)
        if item:
            self._changed()
        return item

    def remove_all(self, kind=None):
        gone = [i for i in self.items.values() if kind is None or i['kind'] == kind]
        for item in gone:
            self._disarm(item['id'])
            del self.items[item['id']]
        if gone:
            self._changed()
        return gone

    def snooze(self, reminder_id, minutes):
        item = self.items.get(reminder_id)
        if not item:
            return None
        item.update(status='pending', due=self._now() + max(1, min(int(minutes), 24 * 60)) * 60, rang=None)
        self._arm(item)
        self._changed()
        return item

    def waiting(self, kind=None):
        return sorted((i for i in self.items.values() if i['status'] == 'pending' and kind in (None, i['kind'])), key=lambda i: i['due'])

    def ringing(self, kind=None):
        return [i for i in self.items.values() if i['status'] in ('ringing', 'missed') and kind in (None, i['kind'])]

    def of_kind(self, kind):
        return [i for i in self.items.values() if i['kind'] == kind]

    def find(self, words):
        """Reminders whose text shares the most words with what was said."""
        wanted = _words(words)
        if not wanted:
            return []
        scored = []
        for item in self.of_kind('reminder'):
            have = _words(item['text'])
            overlap = len(wanted & have)
            if overlap:
                scored.append((overlap / len(wanted | have), item))
        if not scored:
            return []
        best = max(score for score, _ in scored)
        return [item for score, item in scored if score == best]

    # ---- timing ----
    def _start_ringing(self, item, announce):
        item.update(status='ringing', rang=self._now())
        if announce:
            self._ring(item)

    def _arm(self, item):
        self._disarm(item['id'])
        reminder_id = item['id']
        if item['status'] == 'pending':
            at, fn = item['due'], lambda: self._due(reminder_id)
        elif item['status'] == 'ringing':
            at, fn = (item['rang'] or self._now()) + RING_SECONDS, lambda: self._unanswered(reminder_id)
        else:
            at, fn = (item['rang'] or item['due']) + MISSED_SECONDS, lambda: self.remove(reminder_id)
        self._cancel[reminder_id] = self._schedule(at, fn)

    def _disarm(self, reminder_id):
        cancel = self._cancel.pop(reminder_id, None)
        if cancel:
            cancel()

    def _due(self, reminder_id):
        item = self.items.get(reminder_id)
        if item and item['status'] == 'pending':
            self._start_ringing(item, announce=True)
            self._arm(item)
            self._changed()

    def _unanswered(self, reminder_id):
        item = self.items.get(reminder_id)
        if item and item['status'] == 'ringing':
            item['status'] = 'missed'
            self._arm(item)
            self._changed()

    def _tidy(self):
        now = self._now()
        for item in list(self.items.values()):
            if item['status'] == 'missed' and now - (item['rang'] or item['due']) > MISSED_SECONDS:
                self.remove(item['id'])


STOP = {'a', 'an', 'the', 'to', 'my', 'me', 'about', 'for', 'of', 'and', 'reminder', 'reminders', 'i', 'that', 'it'}


def _words(text):
    return {w for w in re.findall(r"[a-z0-9']+", (text or '').lower()) if w not in STOP}
