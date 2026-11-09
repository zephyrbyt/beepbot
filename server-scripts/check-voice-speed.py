#!/usr/bin/env python3
"""Where does the wait go after asking the Echo something? Read-only.

Run with: sudo python3 ./check-voice-speed.py

Reads when the Echo changed between listening, thinking and speaking, from Home Assistant's
history. It only reads times, never what was said. Changes nothing and restarts nothing.
"""
import argparse
import json
import os
from pathlib import Path
import sqlite3
import statistics
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--config', default='/path/to/homeassistant', help=argparse.SUPPRESS)
parser.add_argument('--hours', type=float, default=6, help='how far back to look (default 6 hours)')
args = parser.parse_args()
CONFIG = Path(args.config)
SATELLITE = 'assist_satellite.echo_show_example_assist_satellite'

if os.geteuid() != 0:
    raise SystemExit('Run with: sudo python3 ./check-voice-speed.py')

database = CONFIG / 'home-assistant_v2.db'
if not database.exists():
    raise SystemExit('Could not find the Home Assistant history file.')
connection = sqlite3.connect(f'file:{database}?mode=ro', uri=True, timeout=5)
try:
    rows = connection.execute(
        "SELECT s.state, s.last_updated_ts FROM states s JOIN states_meta m ON s.metadata_id=m.metadata_id "
        "WHERE m.entity_id=? AND s.last_updated_ts > (strftime('%s','now') - ?) ORDER BY s.last_updated_ts",
        (SATELLITE, int(args.hours * 3600))).fetchall()
finally:
    connection.close()

# One request: listening, then processing, then responding, then back to idle.
runs, current = [], None
for index, (state, when) in enumerate(rows):
    following = rows[index + 1][1] if index + 1 < len(rows) else None
    if state == 'listening':
        current = {'listening': (following - when) if following else None, 'at': when}
    elif state == 'processing' and current:
        current['processing'] = (following - when) if following else None
    elif state == 'responding' and current:
        current['responding'] = (following - when) if following else None
        runs.append(current)
        current = None

print(f'Requests with a spoken answer in the last {args.hours:g} hours: {len(runs)}')
print('\n  time      listening   thinking   speaking')
for run in runs[-15:]:
    clock = subprocess.run(['date', '-d', f'@{int(run["at"])}', '+%H:%M:%S'], capture_output=True, text=True).stdout.strip()
    shown = [f'{run.get(key):8.1f}s' if run.get(key) is not None else '        ?' for key in ('listening', 'processing', 'responding')]
    print(f'  {clock}  {shown[0]}  {shown[1]}  {shown[2]}')
thinking = [run['processing'] for run in runs if run.get('processing') is not None]
if thinking:
    print(f'\nThinking: usually {statistics.median(thinking):.1f}s, shortest {min(thinking):.1f}s, longest {max(thinking):.1f}s')
    print('That covers speech recognition and Grok, and may include preparing the voice.')


def storage(name):
    path = CONFIG / '.storage' / name
    return json.loads(path.read_text()).get('data', {}) if path.exists() else {}


def answer(value, yes, no):
    return yes if value else 'could not tell' if value is None else no


def contains(words, folder):
    """Which of these words appear in a folder's code, inside the Home Assistant container. None if it couldn't look."""
    found = {}
    for word in words:
        result = subprocess.run(['docker', 'exec', 'homeassistant', 'grep', '-rl', '--include=*.py', word, folder],
                                capture_output=True, text=True)
        # Any error message means it couldn't look, because Docker's own errors share grep's "not found" code.
        found[word] = None if result.stderr.strip() else result.returncode == 0
    return found


registry = storage('core.entity_registry').get('entities', [])
platform = next((entity.get('platform') for entity in registry if entity['entity_id'] == 'conversation.grok_home'), None)
print(f'\nGrok connection in Home Assistant: {platform or "not found"}')
if platform:
    custom = (CONFIG / 'custom_components' / platform).exists()
    folder = f'/config/custom_components/{platform}' if custom else f'/usr/src/homeassistant/homeassistant/components/{platform}'
    found = contains(['async_add_delta_content_stream'], folder)
    print('  Sends Grok\'s words as they arrive: ' + answer(found['async_add_delta_content_stream'], 'yes', 'no sign of it, it may wait for the whole reply'))
for pipeline in storage('assist_pipeline.pipelines').get('items', []):
    print(f'  Assistant "{pipeline.get("name")}": recognise-locally-first {pipeline.get("prefer_local_intents")}')

mic = CONFIG / 'custom_components' / 'hassmic'
if mic.exists():
    plays_early = contains(['tts_start_streaming'], '/config/custom_components/hassmic')['tts_start_streaming']
    print('Echo app (hassmic) starts speaking as the first words are ready: ' + answer(plays_early, 'yes', 'no sign of it, it may wait for the whole reply to be prepared'))
    manifest = mic / 'manifest.json'
    if manifest.exists():
        print('  hassmic version: ' + str(json.loads(manifest.read_text()).get('version')))
else:
    print('hassmic add-on folder not found')

stats = subprocess.run(['docker', 'stats', '--no-stream', '--format', '{{.Name}}  CPU {{.CPUPerc}}  memory {{.MemUsage}}',
                        'homeassistant', 'home-voice-whisper', 'home-voice-kokoro'], capture_output=True, text=True)
print('\nRight now:')
print(stats.stdout.strip() or '  not available')
print('\nNothing was changed.')
