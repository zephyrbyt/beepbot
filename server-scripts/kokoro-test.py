#!/usr/bin/env python3
"""Try Kokoro, a more natural voice engine, on this server. It changes nothing on your Echo.

Run with: sudo python3 ./kokoro-test.py

It downloads the Kokoro image, then runs it on a private network with no internet access, so we
also find out whether it can work fully offline. It makes samples, measures how long they take on
this processor, then removes the test container and network. Your current voice and Home Assistant
aren't touched. The downloaded image stays until you remove it (the command is printed at the end).
"""
import argparse
import ipaddress
import json
import os
from pathlib import Path
import shlex
import subprocess
import time
import urllib.error
import urllib.request
import wave

parser = argparse.ArgumentParser()
parser.add_argument('--samples', default='/tmp/voice-samples', help=argparse.SUPPRESS)
parser.add_argument('--cpus', default='3', help='processor cores it may use')
parser.add_argument('--address', default=None, help=argparse.SUPPRESS)
args = parser.parse_args()

IMAGE = 'ghcr.io/remsky/kokoro-fastapi-cpu:latest'
NAME = 'home-voice-kokoro-test'
NETWORK = 'home-voice-kokoro-test'
PORT = 8880
WANTED = ('bf_', 'bm_')              # British voices
ALSO = ('af_heart', 'af_bella')      # two American voices often picked for warmth, to compare
MAX_BRITISH = 6
SAMPLE = ("Hi there, it's 11 degrees Celsius and a little cloudy outside, so you might want a light coat. "
          "There you go, the bedroom light is on, nice and bright.")
SHORT = 'There you go, the light is on.'
FOLDER = Path(args.samples)


def docker(*cmd, timeout=180):
    result = subprocess.run(['docker', *cmd], capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f'docker {cmd[0]} failed: ' + (result.stdout + result.stderr)[-500:])
    return result.stdout.strip()


def free_subnet():
    """A small private range nothing else on this server is using: not Docker, the VPN or the home network."""
    taken = []
    for identifier in docker('network', 'ls', '-q').split():
        for entry in json.loads(docker('network', 'inspect', identifier))[0].get('IPAM', {}).get('Config') or []:
            if entry.get('Subnet') and ':' not in entry['Subnet']:
                taken.append(ipaddress.ip_network(entry['Subnet'], strict=False))
    routes = subprocess.run(['ip', '-j', '-4', 'route', 'show'], capture_output=True, text=True, timeout=20)
    for route in json.loads(routes.stdout or '[]'):
        if route.get('dst', 'default') != 'default':
            taken.append(ipaddress.ip_network(route['dst'], strict=False))
    for number in list(range(240, 248)) + list(range(232, 240)):
        candidate = ipaddress.ip_network(f'172.30.{number}.0/29')
        if not any(candidate.overlaps(other) for other in taken):
            return str(candidate)
    raise RuntimeError('no free private network range found; nothing was changed')


def cleanup():
    subprocess.run(['docker', 'rm', '-f', NAME], capture_output=True)
    subprocess.run(['docker', 'network', 'rm', NETWORK], capture_output=True)


def own(path):
    uid, gid = os.environ.get('SUDO_UID'), os.environ.get('SUDO_GID')
    if uid and gid:
        os.chown(path, int(uid), int(gid))


def fetch(url, body=None, timeout=300):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'} if data else {})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run with: sudo python3 ./kokoro-test.py')
    if input('This downloads the Kokoro image, which may be a few GB. Type TEST to go ahead: ').strip() != 'TEST':
        print('Stopped. Nothing was changed.')
        return
    cleanup()
    print('Downloading Kokoro (this can take a while)...', flush=True)
    docker('pull', IMAGE, timeout=3600)
    size = docker('image', 'inspect', '--format', '{{.Size}}', IMAGE)
    FOLDER.mkdir(parents=True, exist_ok=True)
    own(FOLDER)
    state = {'image_gb': round(int(size) / 1e9, 1), 'offline': False, 'voices': {}, 'errors': {}}
    try:
        # --internal means no route to the internet. No ports are published.
        docker('network', 'create', '--internal', '--subnet', free_subnet(), NETWORK)
        docker('create', '--name', NAME, '--network', NETWORK, '--cap-drop=ALL', '--security-opt=no-new-privileges:true',
               '--memory=4g', f'--cpus={args.cpus}', '-e', 'HF_HUB_OFFLINE=1', '-e', 'HF_HUB_DISABLE_TELEMETRY=1', '-e', 'DO_NOT_TRACK=1', IMAGE)
        docker('start', NAME)
        address = args.address or json.loads(docker('inspect', NAME))[0]['NetworkSettings']['Networks'][NETWORK]['IPAddress']
        base = f'http://{address}:{PORT}'
        print('Starting it with no internet access...', flush=True)
        began, voices = time.monotonic(), None
        while time.monotonic() - began < 300:
            if docker('inspect', '--format', '{{.State.Running}}', NAME) != 'true':
                raise RuntimeError('it stopped: ' + docker('logs', '--tail', '6', NAME)[-400:])
            try:
                voices = json.loads(fetch(f'{base}/v1/audio/voices', timeout=5)).get('voices')
                if voices:
                    break
            except (urllib.error.URLError, OSError, ValueError):
                pass
            time.sleep(3)
        if not voices:
            raise RuntimeError('it did not get ready within 5 minutes without internet')
        state['offline'] = True
        state['ready_seconds'] = round(time.monotonic() - began)
        state['all_voices'] = voices
        print(f'It works offline. Ready in {state["ready_seconds"]}s, with {len(voices)} voices.', flush=True)
        # Each voice may be a plain name or a record with a quality grade. Best-graded British voices first,
        # skipping the old "v0" copies, then two warm American voices to compare.
        records = [{'id': v} if isinstance(v, str) else v for v in voices]
        grade = {'A': 0, 'B': 1, 'C': 2, 'D': 3, 'F': 4}
        rank = lambda r: grade.get(str(r.get('overall_grade') or 'C')[:1].upper(), 2) + (0.5 if str(r.get('overall_grade') or '').endswith('-') else 0) - (0.5 if str(r.get('overall_grade') or '').endswith('+') else 0)
        british = sorted((r for r in records if str(r.get('id') or r.get('name') or '').startswith(WANTED) and '_v0' not in str(r.get('id'))), key=rank)
        names = [str(r.get('id') or r.get('name')) for r in records]
        chosen = [str(r.get('id') or r.get('name')) for r in british][:MAX_BRITISH] + [n for n in ALSO if n in names]
        if not chosen:
            raise RuntimeError('none of its voices were the ones we wanted')

        def say(voice, text):
            started = time.monotonic()
            audio = fetch(f'{base}/v1/audio/speech', {'model': 'kokoro', 'input': text, 'voice': voice, 'response_format': 'wav', 'stream': False})
            return audio, time.monotonic() - started

        say(chosen[0], SHORT)  # the first request also loads things, so don't count it
        short_times = [say(chosen[0], SHORT)[1] for _ in range(2)]
        state['short_reply_seconds'] = round(min(short_times), 1)
        for voice in chosen:
            try:
                audio, seconds = say(voice, SAMPLE)
                path = FOLDER / f'kokoro-{voice}.wav'
                path.write_bytes(audio)
                path.chmod(0o644)
                own(path)
                with wave.open(str(path)) as check:
                    length = check.getnframes() / check.getframerate()
                state['voices'][voice] = {'seconds': round(seconds, 1), 'length': round(length, 1)}
                print(f'  {voice}: took {seconds:.1f}s to make {length:.1f}s of speech', flush=True)
            except Exception as error:  # one voice failing shouldn't lose the others
                state['errors'][voice] = str(error)[:200]
                print(f'  {voice}: failed ({error})', flush=True)
        stats = docker('stats', '--no-stream', '--format', '{{.MemUsage}}', NAME)
        state['memory_in_use'] = stats.split('/')[0].strip()
    finally:
        cleanup()
        report = FOLDER / 'kokoro-test.json'
        report.write_text(json.dumps(state, indent=2))
        report.chmod(0o644)
        own(report)
        subprocess.run(['python3', str(Path(__file__).resolve().parent / 'voice-page.py'), str(FOLDER)], check=False)
    print(f'\nA short reply takes about {state.get("short_reply_seconds", "?")}s to make. Memory in use: {state.get("memory_in_use")}. Image size: {state["image_gb"]} GB.')
    print(f'Samples are added to {FOLDER}/listen.html. Your Echo has not been changed.')
    print(f'To remove the download later: sudo docker rmi {shlex.quote(IMAGE)}')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, subprocess.SubprocessError, ValueError, KeyError, AttributeError, TypeError) as error:
        cleanup()
        raise SystemExit(f'STOPPED: {error}\nThe test container was removed. Your Echo has not been changed.')
