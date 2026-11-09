"""Understands when a reminder is for, from ordinary speech like "to take the bins out at half six".

No Home Assistant parts in here, so it can be tested on its own. Everything works on whole words, so a
number that belongs to the reminder itself ("buy two pizzas") is left alone unless it sits in a time phrase.
"""
from __future__ import annotations

from datetime import datetime, timedelta
import re

UNITS = {'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8,
         'nine': 9, 'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
         'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19}
TENS = {'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60, 'ninety': 90}
SECONDS = {'second': 1, 'seconds': 1, 'sec': 1, 'secs': 1, 'minute': 60, 'minutes': 60, 'min': 60, 'mins': 60,
           'hour': 3600, 'hours': 3600, 'hr': 3600, 'hrs': 3600, 'day': 86400, 'days': 86400,
           'week': 604800, 'weeks': 604800}
WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
# What a part of the day means when no time is given, and which half of the clock it points to.
PARTS = {'morning': (9, 'am'), 'afternoon': (14, 'pm'), 'evening': (18, 'pm'), 'night': (20, 'pm'), 'tonight': (20, 'pm')}
MAX_AHEAD = timedelta(days=366)
LEADING = ('to', 'about', 'that', 'of', 'for')
FILLERS = 'um|uh|erm|er|so|okay|ok|please'     # slips of speech recognition at the start of a reminder


class NoTime(ValueError):
    """The words didn't say when."""


def _tokens(text: str) -> list[str]:
    text = re.sub(r'(?i)\b([ap])\.\s?m\.?', r'\1m', text)        # "p.m." -> "pm"
    text = re.sub(r'(?i)(\d)\s*([ap]m)\b', r'\1 \2', text)          # "6pm" -> "6 pm"
    text = re.sub(r'(?i)\b(\d{1,2})\.(\d{2})\b', r'\1:\2', text)    # "6.30" -> "6:30"
    text = re.sub(r'[“”"]', '', text)
    return [t for t in re.split(r'\s+', text.strip()) if t]


def _bare(token: str) -> str:
    return re.sub(r"^[^\w:']+|[^\w:']+$", '', token.lower()).replace('’', "'")


class _Reader:
    def __init__(self, tokens: list[str]):
        self.raw = tokens
        self.w = [_bare(t) for t in tokens]

    def at(self, i: int) -> str:
        return self.w[i] if 0 <= i < len(self.w) else ''

    def number(self, i: int, allow_a: bool = False) -> tuple[float, int] | None:
        """A number starting at word i: digits, "twenty five", or "a"/"an" meaning one."""
        word = self.at(i)
        if re.fullmatch(r'\d+(\.\d+)?', word):
            return float(word), i + 1
        if word in TENS:
            nxt = self.at(i + 1)
            if nxt in UNITS and 0 < UNITS[nxt] < 10:
                return TENS[word] + UNITS[nxt], i + 2
            return TENS[word], i + 1
        m = re.fullmatch(r'(twenty|thirty|forty|fifty)-(one|two|three|four|five|six|seven|eight|nine)', word)
        if m:
            return TENS[m[1]] + UNITS[m[2]], i + 1
        if word in UNITS:
            return UNITS[word], i + 1
        if allow_a and word in ('a', 'an'):
            return 1, i + 1
        return None

    def group(self, j: int) -> tuple[float, int] | None:
        """One amount of time: "10 minutes", "an hour and a half", "half an hour", "a quarter of an hour"."""
        at = self.at
        if at(j) == 'half' and at(j + 1) in ('an', 'a') and at(j + 2) in ('hour', 'hr'):
            return 1800, j + 3
        k = j + 1 if at(j) == 'a' else j
        if at(k) == 'quarter':
            if at(k + 1) == 'of' and at(k + 2) in ('an', 'a') and at(k + 3) == 'hour':
                return 900, k + 4
            if at(k + 1) == 'hour':
                return 900, k + 2
            return None
        if at(j) == 'a' and at(j + 1) == 'couple' and at(j + 2) == 'of' and at(j + 3) in SECONDS:
            return 2 * SECONDS[at(j + 3)], j + 4
        if at(j) == 'a' and at(j + 1) == 'few' and at(j + 2) in SECONDS:
            return 3 * SECONDS[at(j + 2)], j + 3
        num = self.number(j, allow_a=True)
        if not num:
            return None
        value, k = num
        half = 0.0
        if at(k) == 'and' and at(k + 1) == 'a' and at(k + 2) == 'half':      # "2 and a half hours"
            half, k = 0.5, k + 3
        if at(k) not in SECONDS:
            return None
        unit, k = SECONDS[at(k)], k + 1
        if at(k) == 'and' and at(k + 1) == 'a' and at(k + 2) == 'half':      # "an hour and a half"
            half, k = 0.5, k + 3
        return (value + half) * unit, k

    def duration(self, i: int) -> tuple[float, int] | None:
        """ "in 10 minutes", "in an hour and a half", "in 2 hours and 15 minutes"."""
        if self.at(i) != 'in' or not (got := self.group(i + 1)):
            return None
        total, j = got
        while True:
            more = self.group(j + 1) if self.at(j) == 'and' else self.group(j)
            if not more:
                return total, j
            total, j = total + more[0], more[1]

    def meridiem(self, i: int) -> tuple[str, str | None, int]:
        """ "am", "pm", "in the morning", "tonight"... Returns (half of the clock, part of the day, next word)."""
        word = self.at(i)
        if word in ('am', 'pm'):
            return word, None, i + 1
        if word == 'in' and self.at(i + 1) == 'the' and self.at(i + 2) in ('morning', 'afternoon', 'evening'):
            part = self.at(i + 2)
            return PARTS[part][1], part, i + 3
        if word == 'at' and self.at(i + 1) == 'night':
            return 'pm', 'night', i + 2
        if word == 'tonight':
            return 'pm', 'tonight', i + 1
        if word == 'this' and self.at(i + 1) in ('morning', 'afternoon', 'evening'):
            part = self.at(i + 1)
            return PARTS[part][1], part, i + 2
        return '', None, i

    def _relative_clock(self, i: int) -> tuple[int, int, int] | None:
        """ "half past six", "quarter to 7", "10 past 9", "twenty minutes to 5", and British "half six"."""
        word = self.at(i)
        if word == 'half':
            offset, j = 30, i + 1
        elif word == 'quarter':
            offset, j = 15, i + 1
        else:
            offset, j = self.number(i)
            offset = int(offset)
            if self.at(j) == 'minutes':
                j += 1
        direction = self.at(j)
        if direction not in ('past', 'to'):
            num = self.number(i + 1) if word == 'half' else None
            return (int(num[0]), 30, num[1]) if num and 1 <= num[0] <= 12 else None
        num = self.number(j + 1)
        if not num or num[0] != int(num[0]) or not (0 <= num[0] <= 23) or offset >= 60:
            return None
        base = int(num[0])
        if direction == 'past':
            return base, offset, num[1]
        return (12 if base == 1 else 23 if base == 0 else base - 1), 60 - offset, num[1]

    def clock(self, i: int) -> tuple[dict, int] | None:
        """A time of day starting at word i (without the "at")."""
        word = self.at(i)
        if word in ('noon', 'midday'):
            return {'h': 12, 'm': 0, 'half': 'pm'}, i + 1
        if word == 'midnight':
            return {'h': 0, 'm': 0, 'half': 'am', 'midnight': True}, i + 1
        hour = minute = None
        j = i
        if word in ('half', 'quarter') or (self.number(i) and self.at(self.number(i)[1]) in ('past', 'to', 'minutes')):
            got = self._relative_clock(i)
            if got:
                hour, minute, j = got
            elif word in ('half', 'quarter'):
                return None
        if hour is None:
            m = re.fullmatch(r'(\d{1,2}):(\d{2})', word)
            if m:
                hour, minute, j = int(m[1]), int(m[2]), i + 1
            else:
                num = self.number(i)
                if not num or num[0] != int(num[0]) or not (0 <= num[0] <= 24):
                    return None
                hour, j = int(num[0]), num[1]
                minute = 0
                # "6 30", "six thirty", "six oh five"
                if self.at(j) == 'oh' and self.number(j + 1) and self.number(j + 1)[0] < 10:
                    minute, j = int(self.number(j + 1)[0]), self.number(j + 1)[1]
                else:
                    # Only two-digit minutes count, so "at six two" or "at 6 2 eggs" isn't read as a time.
                    nxt = self.number(j)
                    two_digit = re.fullmatch(r'\d{2}', self.at(j)) or self.at(j) in TENS or UNITS.get(self.at(j), 0) >= 10
                    if nxt and two_digit and 10 <= nxt[0] < 60 and nxt[0] == int(nxt[0]) and self.at(nxt[1]) not in SECONDS:
                        minute, j = int(nxt[0]), nxt[1]
        if hour is None or minute is None or hour > 24 or minute > 59:
            return None
        if self.at(j) in ("o'clock", 'oclock'):
            j += 1
        elif self.at(j) == 'o' and self.at(j + 1) == 'clock':
            j += 2
        half, part, j = self.meridiem(j)
        if hour > 12 and half:
            half = ''
        return {'h': hour, 'm': minute, 'half': half, 'part': part}, j

    def day(self, i: int) -> tuple[dict, int] | None:
        word = self.at(i)
        if word == 'today':
            return {'offset': 0}, i + 1
        if word == 'tonight':
            return {'offset': 0, 'part': 'tonight'}, i + 1
        if word == 'the' and self.at(i + 1) == 'day' and self.at(i + 2) == 'after' and self.at(i + 3) == 'tomorrow':
            return {'offset': 2}, i + 4
        if word == 'tomorrow':
            out, j = {'offset': 1}, i + 1
            if self.at(j) in ('morning', 'afternoon', 'evening', 'night'):
                out['part'], j = self.at(j), j + 1
            return out, j
        if word == 'this' and self.at(i + 1) in ('morning', 'afternoon', 'evening'):
            return {'offset': 0, 'part': self.at(i + 1)}, i + 2
        j = i
        if word in ('on', 'next', 'this'):
            j = i + 1
        if self.at(j) in WEEKDAYS:
            out, k = {'weekday': WEEKDAYS.index(self.at(j)), 'next': word == 'next'}, j + 1
            if self.at(k) in ('morning', 'afternoon', 'evening', 'night'):
                out['part'], k = self.at(k), k + 1
            return out, k
        return None


def _resolve(now: datetime, day: dict | None, clock: dict | None, alarm: bool = False) -> datetime:
    part = (clock or {}).get('part') or (day or {}).get('part')
    # An alarm clock: "wake me at 7" or "tomorrow at 6" is the morning unless they said otherwise.
    if alarm and clock and not clock['half'] and not part and not clock.get('midnight') and 1 <= clock['h'] <= 11:
        clock = dict(clock, half='am')
    base = now.replace(second=0, microsecond=0)
    explicit_day = day is not None
    if day and 'weekday' in day:
        ahead = (day['weekday'] - now.weekday()) % 7 or 7     # "on Friday", said on a Friday, means next week
        date = (base + timedelta(days=ahead)).date()
    elif day:
        date = (base + timedelta(days=day['offset'])).date()
    else:
        date = base.date()
    if clock is None:
        if not part:
            if day and (day.get('offset', 1) > 0 or 'weekday' in day):
                hour = 9
            else:
                raise NoTime('no time given')
        else:
            hour = PARTS[part][0]
        when = base.replace(year=date.year, month=date.month, day=date.day, hour=hour, minute=0)
        if when <= now:
            raise NoTime('that time has passed')
        return when
    hour, minute, half = clock['h'], clock['m'], clock['half'] or (PARTS[part][1] if part else '')
    if clock.get('midnight'):
        if not explicit_day:
            date = (base + timedelta(days=1)).date()
        hour = 0
    candidates = []
    if hour == 24:
        hour = 0
    if half == 'am':
        candidates = [hour % 12]
    elif half == 'pm':
        candidates = [hour % 12 + 12]
    elif hour == 0 or hour > 12:
        candidates = [hour]
    elif explicit_day:
        # "tomorrow at 6" is more likely the evening; "tomorrow at 9" the morning.
        candidates = [hour % 12 + 12 if 1 <= hour <= 6 else hour % 12 if hour < 12 else 12]
    else:
        candidates = [hour % 12, hour % 12 + 12]
    for days in (0, 1):
        if days and not half and 1 <= hour <= 12 and not explicit_day:
            # Both of today's have passed: "at 2", said in the afternoon, means 2 pm tomorrow, not 2 am.
            candidates = [hour % 12 + 12 if hour <= 6 else hour % 12 if hour < 12 else 12]
        for h in candidates:
            when = datetime.combine(date + timedelta(days=days), datetime.min.time(), tzinfo=now.tzinfo).replace(hour=h, minute=minute)
            if when > now:      # "today at 9", said at 10, means tomorrow
                return when
    raise NoTime('that time has passed')


def parse_alarm(text: str, now: datetime) -> tuple[datetime, bool]:
    """When to wake someone, from "at 7", "for 6:30", "tomorrow at 6", "in 8 hours". Returns (when, relative)."""
    _, when, relative = parse_reminder(text, now, alarm=True)
    return when, relative


def parse_reminder(text: str, now: datetime, alarm: bool = False) -> tuple[str, datetime, bool]:
    """Returns (what to remind about, when, whether the time was said as "in ..."). Raises NoTime."""
    r = _Reader(_tokens(text))
    used = [False] * len(r.w)
    duration = day = clock = None

    def take(a, b):
        for k in range(a, b):
            used[k] = True

    i = 0
    while i < len(r.w):
        if used[i]:
            i += 1
            continue
        if duration is None and day is None and clock is None and (got := r.duration(i)):
            duration = got[0]
            take(i, got[1]); i = got[1]; continue
        if clock is None and r.at(i) in ('at', 'by', 'for') and (got := r.clock(i + 1)):
            # "for 6" only counts with am/pm, so "set the table for 6" stays as it was said. An alarm "for 6" is a time.
            if r.at(i) != 'for' or got[0]['half'] or alarm:
                clock = got[0]
                take(i, got[1]); i = got[1]; continue
        # A bare number only counts with am/pm, except for an alarm, where "6:30" or "seven" on its own is the time.
        if clock is None and r.at(i) not in ('a', 'an') and (got := r.clock(i)) and (got[0]['half'] or r.at(i) in ('noon', 'midday', 'midnight') or alarm):
            clock = got[0]
            take(i, got[1]); i = got[1]; continue
        if day is None and (got := r.day(i)):
            day = got[0]
            take(i, got[1]); i = got[1]; continue
        i += 1

    if duration is not None:
        if duration < 5:
            raise NoTime('too soon')
        when = now + timedelta(seconds=round(duration))
        relative = True
    elif day is None and clock is None:
        raise NoTime('no time given')
    else:
        when = _resolve(now, day, clock, alarm)
        relative = False
    if when - now > MAX_AHEAD:
        raise NoTime('too far ahead')

    words = [t for t, u in zip(r.raw, used) if not u]
    task = ' '.join(words).strip(' ,.;:!?')
    task = re.sub(r'\s+([,.;:!?])', r'\1', task)
    stripping = True
    while stripping and task:
        stripping = False
        for lead in ('that i need to', 'that i have to', 'i need to', 'i have to', *LEADING):
            if task.lower() == lead:
                task = ''
            elif task.lower().startswith(lead + ' '):
                task, stripping = task[len(lead) + 1:], True
            else:
                continue
            break
    task = re.sub(r'(?i)\s+(and|to|about)$', '', task).strip(' ,.;:!?')
    # Politeness and slips at the edges aren't part of the reminder: "um, to call mum, please" -> "call mum".
    task = re.sub(r'(?i)[\s,]*\b(please|thanks|thank you|cheers)$', '', task).strip(' ,.;:!?')
    task = re.sub(rf'(?i)^(({FILLERS})\b[\s,]*)+', '', task).strip(' ,.;:!?')
    for lead in ('that i need to', 'that i have to', 'i need to', 'i have to', *LEADING):
        if task.lower().startswith(lead + ' '):
            task = task[len(lead) + 1:]
            break
    return task, when, relative


def you_form(text: str) -> str:
    """ "call my mum" -> "call your mum", for saying it back."""
    swaps = {'my': 'your', 'me': 'you', 'i': 'you', "i'm": "you're", 'myself': 'yourself', 'mine': 'yours',
             "i've": "you've", "i'll": "you'll", 'am': 'are'}

    def swap(m):
        word = m.group(0)
        out = swaps.get(word.lower().replace('’', "'"))
        if not out:
            return word
        return out[0].upper() + out[1:] if word[0].isupper() and word.lower() != 'i' else out
    swapped = re.sub(r"\b(I'm|I’m|I've|I’ve|I'll|I’ll|my|me|I|myself|mine)\b", swap, text, flags=re.I)
    return re.sub(r'\byou am\b', 'you are', swapped)


def clock_words(when: datetime) -> str:
    if when.hour == 12 and when.minute == 0:
        return 'noon'
    if when.hour == 0 and when.minute == 0:
        return 'midnight'
    h = when.hour % 12 or 12
    return f"{h}{':%02d' % when.minute if when.minute else ''} {'am' if when.hour < 12 else 'pm'}"


def amount(seconds: float) -> str:
    seconds = int(round(seconds))
    if seconds < 90:
        return f"{seconds} second{'s' if seconds != 1 else ''}"
    minutes = int(round(seconds / 60))
    if minutes < 60:
        return f"{minutes} minute{'s' if minutes != 1 else ''}"
    hours, minutes = divmod(minutes, 60)
    if hours >= 48 and not minutes:
        return f'{hours // 24} days'
    out = f"{hours} hour{'s' if hours != 1 else ''}"
    return out + (f" and {minutes} minute{'s' if minutes != 1 else ''}" if minutes else '')


def speak_when(when: datetime, now: datetime, relative: bool = False) -> str:
    """ "in 10 minutes", "at 6:30 pm", "tomorrow at 9 am", "on Friday at noon"."""
    ahead = (when - now).total_seconds()
    if relative and ahead < 86400 or ahead < 60:
        return 'in ' + amount(ahead)
    days = (when.date() - now.date()).days
    at = f'at {clock_words(when)}'
    if days == 0:
        return at
    if days == 1:
        return at if when.hour == 0 and when.minute == 0 else f'tomorrow {at}'
    if days < 7:
        return f'on {when.strftime("%A")} {at}'
    return f'on {when.strftime("%A")} {when.day} {when.strftime("%B")} {at}'
