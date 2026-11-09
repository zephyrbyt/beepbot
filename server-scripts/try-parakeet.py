#!/usr/bin/env python3
"""Adds the Parakeet speech recogniser next to Whisper, so the two can be compared.

Try it:    sudo python3 ./try-parakeet.py
Remove it: sudo python3 ./try-parakeet.py --remove

Whisper, Home Assistant and the Echo are not touched: nothing uses Parakeet until you choose it in
Home Assistant. This script downloads the program and a model of about 660 MB, and checks the model's
fingerprints. Parakeet itself never has internet: it runs on the private voice network with no special
permissions and no logs, so what you say isn't stored.
"""
import argparse
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import time
import urllib.error
import urllib.request

parser = argparse.ArgumentParser(description='Try the Parakeet speech recogniser')
parser.add_argument('--remove', action='store_true', help='remove Parakeet again')
parser.add_argument('--data', default='/opt/home-voice/parakeet', help=argparse.SUPPRESS)
parser.add_argument('--config', default='/path/to/homeassistant', help=argparse.SUPPRESS)
parser.add_argument('--report', default='/tmp/parakeet-test-report.json', help=argparse.SUPPRESS)
parser.add_argument('--source', default='https://huggingface.co/istupakov/parakeet-tdt-0.6b-v2-onnx/resolve/0bbb45a3365852604aef28b538a8f066f4ccaa85', help=argparse.SUPPRESS)
args = parser.parse_args()

# Version 0.5.0, the release whose code was read. The exact file is fixed, so it can't change underneath us.
IMAGE = 'ghcr.io/tboby/wyoming-onnx-asr@sha256:9b2ccdd52c7aa83e36a2d674de749c4c01bd6bb1e23ea45dd85befb9fc013340'
MODEL = 'nemo-parakeet-tdt-0.6b-v2'
NAME = 'home-voice-parakeet'
BOOT = NAME + '-download'
WHISPER = 'home-voice-whisper'
PIPER = 'home-voice-piper'
PORT = 10300
PIPER_PORT = 10200
LABEL = 'home.private-voice=1'
NOBODY = 65534
NEEDS_DISK_GB = 3
# Exactly what's downloaded, from one fixed version of the model: name, size and fingerprint.
MODEL_FILES = [
    ('config.json', 97, '666903c76b9798caf2c210afd4f6cd60b08a8dbf9800ec8d7a3bc0d2148ac466'),
    ('vocab.txt', 9384, 'ec182b70dd42113aff6c5372c75cac58c952443eb22322f57bbd7f53977d497d'),
    ('decoder_joint-model.int8.onnx', 8998286, 'a449f49acd68979d418651dd2dcb737cc0f1bf0225e009e29ee326354edbf7d3'),
    ('encoder-model.int8.onnx', 652184014, '3e0581fda6ab843888b51e56d7ee78b6d5bc3237ec113af1f732d1d5286aa155'),
]
STALL_SECONDS = 60
TESTS = ['What is the weather going to be like tomorrow?', 'Turn on the bedroom light.', "What's the heating at?", 'Play Golden Brown by The Stranglers.']
SERVER_ARGS = ['--uri', f'tcp://0.0.0.0:{PORT}', '--model-en', MODEL, '-q', 'int8']
LOCKED_DOWN = ['--label', LABEL, '--cap-drop=ALL', '--security-opt=no-new-privileges:true', '--user', f'{NOBODY}:{NOBODY}',
               '--read-only', '--tmpfs', f'/tmp:rw,size=128m,mode=1777', '--memory=3g', '--cpus=3',
               '-e', 'HOME=/tmp', '-e', 'HF_HUB_OFFLINE=1', '-e', 'HF_HUB_DISABLE_TELEMETRY=1', '-e', 'DO_NOT_TRACK=1',
               '-e', 'ONNX_ASR_MODEL_DIR=/data']
state = {'status': 'preflight'}


def save():
    path = Path(args.report)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(state, indent=2))
    temporary.chmod(0o644)
    temporary.replace(path)


def docker(*cmd, timeout=180):
    result = subprocess.run(['docker', *cmd], capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f'docker {cmd[0]} failed: ' + (result.stdout + result.stderr)[-600:])
    return result.stdout.strip()


def exists(name):
    return subprocess.run(['docker', 'inspect', name], capture_output=True).returncode == 0


def remove_container(name):
    subprocess.run(['docker', 'rm', '-f', name], capture_output=True)


# ---- the speech protocol: one line of JSON, then optional JSON data, then optional audio ----
def send(sock, kind, data=None, payload=b''):
    body = json.dumps(data or {}).encode()
    head = {'type': kind, 'version': '1.5.0', 'data_length': len(body)}
    if payload:
        head['payload_length'] = len(payload)
    sock.sendall(json.dumps(head).encode() + b'\n' + body + payload)


def receive(stream):
    line = stream.readline()
    if not line:
        raise RuntimeError('speech service closed the connection')
    head = json.loads(line)
    data = head.get('data') or {}
    if head.get('data_length'):
        data = {**data, **json.loads(stream.read(head['data_length']))}
    payload = stream.read(head['payload_length']) if head.get('payload_length') else b''
    return head['type'], data, payload


def speak(address, text):
    with socket.create_connection((address, PIPER_PORT), timeout=30) as sock:
        sock.settimeout(60)
        stream = sock.makefile('rb')
        send(sock, 'synthesize', {'text': text})
        audio, rate, width, channels = bytearray(), 22050, 2, 1
        while True:
            kind, data, payload = receive(stream)
            if kind == 'audio-start':
                rate, width, channels = data.get('rate', rate), data.get('width', width), data.get('channels', channels)
            elif kind == 'audio-chunk':
                audio.extend(payload)
            elif kind == 'audio-stop':
                return bytes(audio), rate, width, channels


def transcribe(address, clip):
    audio, rate, width, channels = clip
    with socket.create_connection((address, PORT), timeout=30) as sock:
        sock.settimeout(120)
        stream = sock.makefile('rb')
        form = {'rate': rate, 'width': width, 'channels': channels}
        send(sock, 'transcribe', {'language': 'en'})
        send(sock, 'audio-start', form)
        for start in range(0, len(audio), 4096):
            send(sock, 'audio-chunk', form, audio[start:start + 4096])
        began = time.monotonic()
        send(sock, 'audio-stop')
        while True:
            kind, data, _ = receive(stream)
            if kind == 'transcript':
                text = data.get('text', '').strip()
                if text.startswith('ERROR:'):
                    raise RuntimeError(f'it could not transcribe: {text[:160]}')
                return text, time.monotonic() - began


def fingerprint(path):
    digest = hashlib.sha256()
    with path.open('rb') as file:
        while chunk := file.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def fetch(name, size, expected, folder):
    """Downloads one file, carrying on from where it stopped, and only keeps it if the fingerprint matches."""
    final = folder / name
    if final.exists() and final.stat().st_size == size and fingerprint(final) == expected:
        return
    part = folder / (name + '.part')
    for _ in range(4):
        have = part.stat().st_size if part.exists() else 0
        if have >= size:
            break
        request = urllib.request.Request(f'{args.source}/{name}', headers={'User-Agent': 'echo-voice-setup', 'Range': f'bytes={have}-'})
        try:
            with urllib.request.urlopen(request, timeout=STALL_SECONDS) as response:
                if have and response.status != 206:
                    have = 0  # the server won't carry on from part way, so start this file again
                with part.open('ab' if have else 'wb') as file:
                    shown = -1
                    while chunk := response.read(1024 * 1024):
                        file.write(chunk)
                        have += len(chunk)
                        percent = have * 100 // size // 10 * 10
                        if size > 50_000_000 and percent != shown:
                            shown = percent
                            print(f'  {name}: {percent}%', flush=True)
        except (urllib.error.URLError, OSError) as error:
            print(f'  Download interrupted ({error}), trying again...', flush=True)
            time.sleep(3)
    if not part.exists() or part.stat().st_size < size:
        raise RuntimeError(f'could not download {name}. Run this again to carry on from where it stopped')
    if fingerprint(part) != expected:
        part.unlink()
        raise RuntimeError(f'{name} does not match its expected fingerprint, so it was thrown away')
    part.chmod(0o644)
    part.replace(final)


def wait_ready(name, seconds):
    deadline = time.monotonic() + seconds
    probe = ("import socket,json\ns=socket.create_connection(('127.0.0.1',%d),timeout=3)\n"
             "s.sendall(b'{\"type\":\"describe\"}\\n')\nf=s.makefile('rb')\nh=json.loads(f.readline())\n"
             "n=h.get('data_length',0)\nd=json.loads(f.read(n)) if n else h.get('data',{})\nassert h['type']=='info' and d.get('asr')\n" % PORT)
    while time.monotonic() < deadline:
        if docker('inspect', '--format', '{{.State.Running}}', name) != 'true':
            logs = subprocess.run(['docker', 'logs', '--tail', '6', name], capture_output=True, text=True)
            raise RuntimeError(f'{name} stopped: ' + (logs.stdout + logs.stderr)[-500:])
        attempt = subprocess.run(['docker', 'exec', name, 'python3', '-c', probe], capture_output=True, text=True, timeout=15)
        if attempt.returncode == 0:
            return
        time.sleep(5)
    logs = subprocess.run(['docker', 'logs', '--tail', '12', name], capture_output=True, text=True)
    raise RuntimeError(f'it did not get ready within {seconds // 60} minutes.\nWhat it reported:\n' + (logs.stdout + logs.stderr)[-900:] +
                       '\nLast check:\n' + attempt.stderr[-300:])


def in_use_by_home_assistant(address):
    """Whether Home Assistant has been pointed at it. Reads only the host of each voice connection."""
    path = Path(args.config) / '.storage' / 'core.config_entries'
    if not path.exists() or not address:
        return False
    entries = json.loads(path.read_text()).get('data', {}).get('entries', [])
    return any(entry.get('domain') == 'wyoming' and (entry.get('data') or {}).get('host') == address for entry in entries)


def remove():
    address = None
    if exists(NAME):
        networks = json.loads(docker('inspect', NAME))[0]['NetworkSettings']['Networks']
        address = next((net.get('IPAddress') or (net.get('IPAMConfig') or {}).get('IPv4Address') for net in networks.values()), None)
    if in_use_by_home_assistant(address):
        raise SystemExit('Home Assistant is still connected to Parakeet. Set your assistant back to Whisper and delete that '
                         'Wyoming entry under Settings > Devices & services, then run this again. Nothing changed.')
    if input('Type REMOVE to remove Parakeet and its download: ').strip() != 'REMOVE':
        print('Stopped. Nothing was changed.')
        return
    remove_container(NAME)
    remove_container(BOOT)
    shutil.rmtree(args.data, ignore_errors=True)
    subprocess.run(['docker', 'rmi', IMAGE], capture_output=True)
    Path(args.report).unlink(missing_ok=True)
    print('Parakeet is gone. Whisper was not touched.')


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run with: sudo python3 ./try-parakeet.py')
    if args.remove:
        remove()
        return

    # ---- look only ----
    if exists(NAME):
        raise SystemExit('Parakeet is already here. To start again, run this with --remove first. Nothing changed.')
    info = json.loads(docker('inspect', WHISPER))[0]
    networks = info['NetworkSettings']['Networks']
    if len(networks) != 1:
        raise SystemExit('The voice services are not set up as expected. Nothing changed.')
    network_name = next(iter(networks))
    network = json.loads(docker('network', 'inspect', network_name))[0]
    if network.get('Internal') is not True:
        raise SystemExit('The voice network is not private as expected. Nothing changed.')
    subnet = ipaddress.ip_network(network['IPAM']['Config'][0]['Subnet'])
    used = {str(c['IPv4Address']).split('/')[0] for c in (network.get('Containers') or {}).values()}
    used.add(str(network['IPAM']['Config'][0].get('Gateway') or subnet.network_address + 1))
    address = next((str(host) for host in subnet.hosts() if str(host) not in used), None)
    if not address:
        raise SystemExit('No free address on the voice network. Nothing changed.')
    piper = json.loads(docker('inspect', PIPER))[0]['NetworkSettings']['Networks'][network_name]['IPAddress']
    target = Path(args.data)
    room = shutil.disk_usage(target.parent if target.parent.exists() else '/').free / 1e9
    if room < NEEDS_DISK_GB:
        raise SystemExit(f'Only {room:.1f} GB of disk is free, and this needs about {NEEDS_DISK_GB} GB. Nothing changed.')
    print(f'Will add Parakeet at {address} on the private voice network, using up to 3 GB of memory.')
    print('This downloads the program, plus a model of about 660 MB from Hugging Face, showing progress as it goes.')
    print('Whisper, Home Assistant and the Echo are not touched, and the Echo works normally throughout.')
    if input('Type TRY to go ahead: ').strip() != 'TRY':
        print('Stopped. Nothing was changed.')
        return

    state.update(status='downloading', address=address)
    save()
    try:
        # ---- the downloads: done here, so Parakeet itself never needs internet ----
        print('Getting the program...', flush=True)
        docker('pull', IMAGE, timeout=1800)
        folder = target / MODEL
        folder.mkdir(parents=True, exist_ok=True)
        target.chmod(0o755)
        folder.chmod(0o755)
        print('Getting the model...', flush=True)
        for name, size, expected in MODEL_FILES:
            fetch(name, size, expected, folder)

        # ---- a first start with no network at all, and with logs in case it has a problem ----
        print('Checking it starts...', flush=True)
        state['status'] = 'starting'
        save()
        remove_container(BOOT)
        docker('create', '--name', BOOT, *LOCKED_DOWN, '--network', 'none', '-v', f'{target}:/data:ro', IMAGE, *SERVER_ARGS)
        docker('start', BOOT)
        wait_ready(BOOT, 180)
        docker('stop', '-t', '10', BOOT)
        docker('rm', BOOT)

        # ---- the real one: private network, no internet, no logs ----
        print('Starting Parakeet...', flush=True)
        docker('create', '--name', NAME, *LOCKED_DOWN, '--restart=unless-stopped', '--log-driver', 'none',
               '--network', network_name, '--ip', address, '-v', f'{target}:/data:ro', IMAGE, *SERVER_ARGS)
        docker('start', NAME)
        wait_ready(NAME, 180)
        routes = ("from pathlib import Path\nr=Path('/proc/net/route').read_text().splitlines()[1:]\n"
                  "assert not any(x.split()[1]=='00000000' for x in r)\n")
        docker('exec', NAME, 'python3', '-c', routes)

        print('Testing it...', flush=True)
        clips = [(text, speak(piper, text)) for text in TESTS]
        transcribe(address, clips[0][1])  # the first request is slower, as it wakes things up
        results = []
        print('\nParakeet, on this server:')
        for text, clip in clips:
            heard, seconds = transcribe(address, clip)
            results.append({'said': text, 'heard': heard, 'seconds': round(seconds, 2)})
            print(f'  {seconds:5.2f}s  "{heard}"')
    except (RuntimeError, OSError, subprocess.SubprocessError, ValueError, KeyError) as error:
        print(f'\nNot keeping it: {error}', flush=True)
        remove_container(NAME)
        remove_container(BOOT)
        state.update(status='failed, removed', error=str(error)[:400])
        save()
        raise SystemExit('STOPPED. Parakeet is not running, and any finished downloads are kept for next time. Whisper and the Echo were not touched.')

    memory = subprocess.run(['docker', 'stats', '--no-stream', '--format', '{{.MemUsage}}', NAME], capture_output=True, text=True).stdout.strip()
    state.update(status='ready', tests=results, memory=memory)
    save()
    print(f'\nMemory in use: {memory or "not available"}')
    print('Done. The Echo is still using Whisper. Tell Claude it has finished, to run the full comparison.')
    print('To remove it: sudo python3 ./try-parakeet.py --remove')


if __name__ == '__main__':
    main()
