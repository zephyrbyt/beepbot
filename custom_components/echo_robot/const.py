"""Names shared by the Beepbot integration's files."""
DOMAIN = 'echo_robot'
# Not hass.data[DOMAIN]: the timers and reminders part keeps its own hub there, as it always has.
STATE = 'echo_robot_package'

LYRICS_SOURCES = ['all', 'open']
# "open" means only LRCLIB, the community lyrics library that asks to be used this way. "all" adds Better Lyrics,
# Apple Music lyrics through Paxsenix, and NetEase, which aren't official services and could stop at any time.
OPEN_SOURCES = ['lrclib']

DEFAULTS = {
    'announce': [],
    'wake_lights': [],
    'wake_minutes': 15,
    'lyrics': True,
    'lyrics_sources': 'all',
    'phrases': True,
}
