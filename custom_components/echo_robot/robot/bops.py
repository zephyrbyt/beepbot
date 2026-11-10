"""Bops: the face characters the robot screens show (the card's BOP_PRESETS are the ready-made ones).

The list is kept here, in Home Assistant's own storage, so every screen sees the same Bops. Each screen picks its own
Bop. The screen that is a voice satellite's own screen says which Bop it shows, so when that satellite is spoken to,
the chat assistant gets one line about the Bop's personality (llm.py adds it to the assistant's instructions).
Only the Bop's name and personality go into that line; everything else is how it looks.

Plain Python, so it can be tested without Home Assistant.
"""
from __future__ import annotations

import re

MAX_MADE = 40            # Bops made on the screens (the six ready-made ones can be changed too, on top of these)
MAX_DEVICES = 50         # screens that can each have their own Bop's personality
NAME_MAX = 16
EYES = ('round', 'tall', 'dots', 'happy', 'sleepy', 'closed', 'star')
MOUTHS = ('smile', 'grin', 'small', 'o', 'flat', 'cat')
EXTRAS = ('brows', 'blush', 'freckles', 'glasses')
PRESET_IDS = ('beep', 'bop', 'grumbles', 'sirbleep', 'dozy', 'sparky')
# How each personality talks. Kept short: it sits on top of the assistant's own instructions, which still decide
# everything else (short replies, no lists, what to do with music and so on).
MOODS = {
    'cheerful': 'cheerful and warm: upbeat, friendly and glad to help',
    'bubbly': 'bubbly and excitable: full of enthusiasm, quick to say "ooh" and easily delighted',
    'grumpy': 'a bit grumpy: dry, sighs at things and grumbles mildly, but always helps properly and is never rude',
    'posh': 'posh and terribly polite, like an old-fashioned English butler, fond of words like "splendid" and "very good"',
    'sleepy': 'sleepy: slow and dozy, yawns now and then and would rather be napping, but still answers properly',
    'cheeky': 'cheeky and playful: teases a little and likes a light joke, but always gets the job done',
}
_ID = re.compile(r'^[a-z0-9_-]{1,40}$')
_COLOUR = re.compile(r'^#[0-9a-fA-F]{6}$')
_VOICE = re.compile(r'^[\w.-]{1,40}$')
_DEVICE = re.compile(r'^[\w.:-]{1,64}$')
_NAME_KEEP = re.compile(r"[^\w '’.!?&-]", re.UNICODE)


def clean_name(text) -> str:
    """A name as people would type it: letters, numbers, spaces and a little punctuation, no longer than 16."""
    name = _NAME_KEEP.sub('', str(text or ''))
    return re.sub(r'\s+', ' ', name).strip()[:NAME_MAX].strip()


def clean_bop(raw) -> dict | None:
    """A Bop as sent by a screen, checked. Anything odd is put right; no id or no name means it isn't a Bop."""
    if not isinstance(raw, dict) or not isinstance(raw.get('id'), str) or not _ID.match(raw['id']):
        return None
    name = clean_name(raw.get('name'))
    if not name:
        return None
    extras = raw.get('extras') if isinstance(raw.get('extras'), list) else []
    return {
        'id': raw['id'],
        'name': name,
        'bg': raw['bg'].lower() if isinstance(raw.get('bg'), str) and _COLOUR.match(raw['bg']) else '#3b3fb8',
        'eye': raw.get('eye') if raw.get('eye') in EYES else 'round',
        'mouth': raw.get('mouth') if raw.get('mouth') in MOUTHS else 'smile',
        'extras': [x for x in EXTRAS if x in extras],
        'mood': raw.get('mood') if raw.get('mood') in MOODS else 'cheerful',
        'voice': raw['voice'] if isinstance(raw.get('voice'), str) and _VOICE.match(raw['voice']) else 'bm_fable',
    }


def personality(name: str, mood: str) -> str:
    """The line the assistant gets, so it talks like this Bop."""
    return (f'On this screen you are {clean_name(name) or "the robot"}, one of the robot\'s characters, and you are '
            f'{MOODS.get(mood, MOODS["cheerful"])}. Speak in that personality instead of any tone described above, but keep '
            'following every other instruction: keep replies just as short and do exactly what is asked.')


class BopShelf:
    """The Bops everyone sees, and which Bop each satellite device shows (for its personality)."""

    def __init__(self, changed=lambda: None):
        self.bops: list[dict] = []
        self.chosen: dict[str, dict] = {}
        self._changed = changed

    def load(self, data):
        data = data if isinstance(data, dict) else {}
        self.bops = []
        for raw in data.get('bops') or []:
            bop = clean_bop(raw)
            if bop and not any(b['id'] == bop['id'] for b in self.bops):
                self.bops.append(bop)
        self.chosen = {}
        for device, info in (data.get('chosen') or {}).items():
            use = self._clean_use(device, info)
            if use:
                self.chosen[device] = use

    def dump(self) -> dict:
        return {'bops': [dict(b) for b in self.bops], 'chosen': {d: dict(u) for d, u in self.chosen.items()}}

    snapshot = dump

    def save(self, raw) -> dict:
        bop = clean_bop(raw)
        if not bop:
            raise ValueError('A Bop needs an id and a name')
        for i, old in enumerate(self.bops):
            if old['id'] == bop['id']:
                self.bops[i] = bop
                break
        else:
            made = sum(1 for b in self.bops if b['id'] not in PRESET_IDS)
            if bop['id'] not in PRESET_IDS and made >= MAX_MADE:
                raise ValueError(f'That is the most Bops there can be ({MAX_MADE})')
            self.bops.append(bop)
        self._changed()
        return bop

    def delete(self, bop_id: str) -> bool:
        before = len(self.bops)
        self.bops = [b for b in self.bops if b['id'] != bop_id]
        if len(self.bops) != before:
            self._changed()
            return True
        return False

    @staticmethod
    def _clean_use(device, info):
        if not isinstance(device, str) or not _DEVICE.match(device) or not isinstance(info, dict):
            return None
        if not isinstance(info.get('id'), str) or not _ID.match(info['id']):
            return None
        name = clean_name(info.get('name'))
        if not name:
            return None
        return {'id': info['id'], 'name': name, 'mood': info.get('mood') if info.get('mood') in MOODS else 'cheerful',
                'voice': info['voice'] if isinstance(info.get('voice'), str) and _VOICE.match(info['voice']) else 'bm_fable'}

    def use(self, device_id: str, info) -> dict:
        use = self._clean_use(device_id, info)
        if not use:
            raise ValueError('That is not a device and a Bop')
        if self.chosen.get(device_id) == use:
            return use
        if device_id not in self.chosen and len(self.chosen) >= MAX_DEVICES:
            self.chosen.pop(next(iter(self.chosen)))  # the longest-standing one makes room
        self.chosen[device_id] = use
        self._changed()
        return use

    def prompt_for(self, device_id) -> str | None:
        use = self.chosen.get(device_id) if isinstance(device_id, str) else None
        return personality(use['name'], use['mood']) if use else None
