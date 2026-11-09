#!/usr/bin/env python3
"""Updates only the Fable connector, leaving the voice and Home Assistant alone.

Update:   sudo python3 ./update-voice-connector.py
Go back:  sudo python3 ./update-voice-connector.py --undo

Keeps the old version, restarts the connector and tests that it speaks. If the test fails, the old
version goes back automatically. The Echo can't speak for a few seconds during the restart.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import time

parser = argparse.ArgumentParser(description='Update the Fable connector')
parser.add_argument('--undo', action='store_true', help='go back to the previous version')
parser.add_argument('--bridge-dir', default='/opt/echo-voice-bridge', help=argparse.SUPPRESS)
parser.add_argument('--port', type=int, default=10210, help=argparse.SUPPRESS)
args = parser.parse_args()

HERE = Path(__file__).resolve().parent
SERVICE = 'echo-voice-bridge'
SOURCE = HERE.parent / 'voice' / 'echo_voice_bridge.py'
LIVE = Path(args.bridge_dir) / 'echo_voice_bridge.py'
KEPT = LIVE.with_name('echo_voice_bridge.previous.py')
SAMPLE = "It's eleven degrees and cloudy right now, and it should stay dry for the rest of the evening."


def restart():
    subprocess.run(['systemctl', 'restart', SERVICE], capture_output=True, text=True, check=True, timeout=60)


def place(source):
    """Swaps the file in one step, so the connector never sees half of it."""
    temporary = LIVE.with_name(LIVE.name + '.new')
    shutil.copy2(source, temporary)
    temporary.chmod(0o644)
    temporary.replace(LIVE)


def wire(sock, kind, data):
    body = json.dumps(data).encode()
    sock.sendall(json.dumps({'type': kind, 'version': '1.5.0', 'data_length': len(body)}).encode() + b'\n' + body)


def receive(stream):
    line = stream.readline()
    if not line:
        raise RuntimeError('the connector closed the connection')
    head = json.loads(line)
    data = head.get('data') or {}
    if head.get('data_length'):
        data = {**data, **json.loads(stream.read(head['data_length']))}
    return head['type'], data, stream.read(head['payload_length']) if head.get('payload_length') else b''


def speak_test():
    """A round trip through the connector, as Home Assistant would do it. Returns seconds to first sound and of speech."""
    deadline = time.monotonic() + 30
    while True:
        try:
            sock = socket.create_connection(('127.0.0.1', args.port), timeout=5)
            break
        except OSError:
            if time.monotonic() > deadline:
                raise RuntimeError('the connector did not start')
            time.sleep(1)
    with sock:
        sock.settimeout(90)
        stream = sock.makefile('rb')
        began = time.monotonic()
        wire(sock, 'synthesize', {'text': SAMPLE, 'voice': {'name': 'bm_fable'}})
        first, total, rate = None, 0, None
        while True:
            kind, data, payload = receive(stream)
            if kind == 'error':
                raise RuntimeError(data.get('text', 'the connector reported an error'))
            if kind == 'audio-chunk':
                first = first or time.monotonic() - began
                total += len(payload)
                rate = data.get('rate')
            elif kind == 'audio-stop':
                break
    if rate != 24000:
        raise RuntimeError('the test used the backup voice, so Fable did not answer')
    length = total / (rate * 2)
    if not 2 < length < 30:
        raise RuntimeError(f'the test produced {length:.1f}s of sound, which looks wrong')
    return first, length


def show_problem():
    logs = subprocess.run(['journalctl', '-u', SERVICE, '-n', '8', '--no-pager', '-o', 'cat'], capture_output=True, text=True)
    if logs.stdout.strip():
        print('What the connector reported:\n' + logs.stdout[-800:], flush=True)


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run with: sudo python3 ./update-voice-connector.py')
    if not LIVE.exists():
        raise SystemExit(f'The connector is not installed at {LIVE}. Nothing changed.')

    if args.undo:
        if not KEPT.exists():
            raise SystemExit('There is no previous version to go back to. Nothing changed.')
        if input('Type UNDO to go back to the previous version: ').strip() != 'UNDO':
            print('Stopped. Nothing was changed.')
            return
        place(KEPT)
        restart()
        first, _ = speak_test()
        print(f'Back on the previous version. The test sentence starts speaking after {first:.1f}s.')
        return

    if not SOURCE.exists():
        raise SystemExit(f'Could not find the new version at {SOURCE}. Nothing changed.')
    if SOURCE.read_bytes() == LIVE.read_bytes():
        print('The connector is already up to date. Nothing changed.')
        return
    print('Will update the connector and restart it. The Echo cannot speak for a few seconds during this.')
    print('Home Assistant is not restarted, and no settings change.')
    if input('Type UPDATE to go ahead: ').strip() != 'UPDATE':
        print('Stopped. Nothing was changed.')
        return

    print('Timing the current version...', flush=True)
    try:
        before, _ = speak_test()
    except (OSError, RuntimeError, ValueError) as error:
        raise SystemExit(f'The connector is not working properly right now ({error}). Nothing changed.')
    temporary = KEPT.with_name(KEPT.name + '.new')
    shutil.copy2(LIVE, temporary)
    temporary.replace(KEPT)
    try:
        place(SOURCE)
        restart()
        print('Testing the new version...', flush=True)
        first, length = speak_test()
    except (OSError, RuntimeError, ValueError, subprocess.SubprocessError) as error:
        print(f'The new version did not pass: {error}', flush=True)
        show_problem()
        place(KEPT)
        restart()
        speak_test()
        raise SystemExit('STOPPED. The old version is back and working. Your Echo has not changed.')
    print(f'\nDone. The test sentence now starts speaking after {first:.1f}s, compared with {before:.1f}s before ({length:.1f}s of speech).')
    print('To go back: sudo python3 ./update-voice-connector.py --undo')


if __name__ == '__main__':
    main()
