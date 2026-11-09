#!/usr/bin/env python3
"""Installs the Fable voice (Kokoro) on this server.

Run with:  sudo python3 ./install-fable.py
Remove:    sudo python3 ./install-fable.py --undo

Adds two things: Kokoro, on the voice services' private network with no internet access, and a small
connector that listens on this computer only. Home Assistant isn't restarted and the Echo keeps its
current voice until you choose Fable in Home Assistant's settings, so this can't break voice by itself.
"""
import argparse
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

parser = argparse.ArgumentParser(description='Install the Fable voice')
parser.add_argument('--undo', action='store_true', help='remove Kokoro and the connector')
parser.add_argument('--bridge-dir', default='/opt/echo-voice-bridge', help=argparse.SUPPRESS)
parser.add_argument('--unit-dir', default='/etc/systemd/system', help=argparse.SUPPRESS)
parser.add_argument('--port', type=int, default=10210, help=argparse.SUPPRESS)
parser.add_argument('--kokoro-url', default=None, help=argparse.SUPPRESS)
parser.add_argument('--no-read-check', action='store_true', help=argparse.SUPPRESS)
args = parser.parse_args()

HERE = Path(__file__).resolve().parent
IMAGE = 'ghcr.io/remsky/kokoro-fastapi-cpu:latest'
KOKORO = 'home-voice-kokoro'
PIPER = 'home-voice-piper'
NETWORK = 'home-voice-private'
SERVICE = 'echo-voice-bridge'
LABEL = 'home.private-voice=1'
BRIDGE_DIR = Path(args.bridge_dir)
UNIT = Path(args.unit_dir) / f'{SERVICE}.service'
SAMPLE = "Hi there, I'm your new voice. It's 11°C outside, and the heating's at 19-20 degrees."


def run(*cmd, timeout=180):
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f'{cmd[0]} {cmd[1]} failed: ' + (result.stdout + result.stderr)[-500:])
    return result.stdout.strip()


def docker(*cmd, timeout=180):
    return run('docker', *cmd, timeout=timeout)


def exists(name):
    return subprocess.run(['docker', 'inspect', name], capture_output=True).returncode == 0


def undo_all():
    subprocess.run(['systemctl', 'disable', '--now', SERVICE], capture_output=True)
    UNIT.unlink(missing_ok=True)
    subprocess.run(['systemctl', 'daemon-reload'], capture_output=True)
    shutil.rmtree(BRIDGE_DIR, ignore_errors=True)
    subprocess.run(['docker', 'rm', '-f', KOKORO], capture_output=True)


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
    """A complete round trip through the connector, as Home Assistant would do it."""
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
        sock.settimeout(120)
        stream = sock.makefile('rb')
        wire(sock, 'describe', {})
        kind, info, _ = receive(stream)
        if kind != 'info' or not info.get('tts'):
            raise RuntimeError('the connector did not describe itself properly')
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
    return first or 0, total / ((rate or 24000) * 2), time.monotonic() - began, rate


def service_can_read(path):
    """The connector runs as a restricted user, so every folder above it must be open to others."""
    for folder in [path, *path.parents]:
        try:
            if folder.exists() and not folder.stat().st_mode & 0o001:
                return folder
        except PermissionError:
            return folder.parent
    return None


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run with: sudo python3 ./install-fable.py')
    if args.undo:
        print('In Home Assistant, set your assistant back to Piper first, or the Echo will go quiet.')
        print('(Settings > Voice assistants > your assistant > Text-to-speech)')
        if input('Type REMOVE to remove Fable: ').strip() != 'REMOVE':
            print('Stopped. Nothing was changed.')
            return
        undo_all()
        print(f'Removed. To delete the download too: sudo docker rmi {IMAGE}')
        return

    # ---- look only ----
    if subprocess.run(['docker', 'image', 'inspect', IMAGE], capture_output=True).returncode:
        raise SystemExit('The Kokoro image is not on this server. Run kokoro-test.py first. Nothing changed.')
    image = docker('image', 'inspect', '--format', '{{.Id}}', IMAGE)
    network = json.loads(docker('network', 'inspect', NETWORK))[0]
    if network.get('Internal') is not True:
        raise SystemExit('The voice network is not private as expected. Nothing changed.')
    subnet = ipaddress.ip_network(network['IPAM']['Config'][0]['Subnet'])
    used = {str(c['IPv4Address']).split('/')[0] for n, c in (network.get('Containers') or {}).items() if c.get('Name') != KOKORO}
    used.add(str(network['IPAM']['Config'][0].get('Gateway') or subnet.network_address + 1))
    address = next((str(h) for h in subnet.hosts() if str(h) not in used), None)
    if not address:
        raise SystemExit('No free address on the voice network. Nothing changed.')
    piper_address = json.loads(docker('inspect', PIPER))[0]['NetworkSettings']['Networks'][NETWORK]['IPAddress']
    try:
        with socket.create_connection(('127.0.0.1', args.port), timeout=1):
            if not UNIT.exists():
                raise SystemExit(f'Something else is using port {args.port}. Nothing changed.')
    except OSError:
        pass
    blocked = None if args.no_read_check else service_can_read(BRIDGE_DIR)
    if blocked:
        raise SystemExit(f'The connector could not read its own files, because {blocked} is private. Nothing changed.')
    print(f'Will add Kokoro at {address} on the private voice network, using up to 4 GB of memory.')
    print(f'Will add a connector on 127.0.0.1:{args.port}, plus {UNIT}.')
    print('Home Assistant is not restarted, and the Echo keeps its current voice until you switch it.')
    if input('Type INSTALL to go ahead: ').strip() != 'INSTALL':
        print('Stopped. Nothing was changed.')
        return

    # ---- install, undoing everything if any step fails ----
    try:
        subprocess.run(['docker', 'rm', '-f', KOKORO], capture_output=True)
        docker('create', '--name', KOKORO, '--label', LABEL, '--restart=unless-stopped', '--network', NETWORK, '--ip', address,
               '--cap-drop=ALL', '--security-opt=no-new-privileges:true', '--memory=4g', '--cpus=3',
               '--log-opt', 'max-size=10m', '--log-opt', 'max-file=2',
               '-e', 'HF_HUB_OFFLINE=1', '-e', 'HF_HUB_DISABLE_TELEMETRY=1', '-e', 'DO_NOT_TRACK=1', image)
        docker('start', KOKORO)
        kokoro_url = args.kokoro_url or f'http://{address}:8880'
        print('Starting Kokoro...', flush=True)
        deadline = time.monotonic() + 300
        while True:
            if docker('inspect', '--format', '{{.State.Running}}', KOKORO) != 'true':
                raise RuntimeError('Kokoro stopped: ' + docker('logs', '--tail', '6', KOKORO)[-300:])
            try:
                with urllib.request.urlopen(f'{kokoro_url}/v1/audio/voices', timeout=5) as response:
                    if response.status == 200:
                        break
            except (urllib.error.URLError, OSError):
                pass
            if time.monotonic() > deadline:
                raise RuntimeError('Kokoro did not get ready within 5 minutes')
            time.sleep(3)
        BRIDGE_DIR.mkdir(parents=True, exist_ok=True)
        BRIDGE_DIR.chmod(0o755)
        script = BRIDGE_DIR / 'echo_voice_bridge.py'
        shutil.copy2(HERE.parent / 'voice/echo_voice_bridge.py', script)
        script.chmod(0o644)
        UNIT.write_text(f"""[Unit]
Description=Connects Home Assistant to the Kokoro voice
After=docker.service network-online.target

[Service]
ExecStart=/usr/bin/python3 {script} --port {args.port} --kokoro {kokoro_url} --piper-host {piper_address}
Restart=always
RestartSec=3
DynamicUser=yes
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
CapabilityBoundingSet=
MemoryMax=128M

[Install]
WantedBy=multi-user.target
""")
        UNIT.chmod(0o644)
        run('systemctl', 'daemon-reload')
        run('systemctl', 'enable', '--now', SERVICE)
        print('Testing the voice...', flush=True)
        speak_test()  # the first request also loads the model
        first, length, total, rate = speak_test()
        if rate != 24000:
            raise RuntimeError('the test used the backup voice, so Kokoro is not reachable from the connector')
        if not 2 < length < 30:
            raise RuntimeError(f'the test produced {length:.1f}s of sound, which looks wrong')
    except Exception as error:  # noqa: BLE001 - leave nothing half installed
        print(f'Something went wrong, removing what was added: {error}', flush=True)
        logs = subprocess.run(['journalctl', '-u', SERVICE, '-n', '12', '--no-pager', '-o', 'cat'], capture_output=True, text=True)
        if logs.stdout.strip():
            print('What the connector reported:\n' + logs.stdout[-1200:], flush=True)
        undo_all()
        raise SystemExit('STOPPED. Everything has been removed, and your Echo has not changed.')
    print(f'\nDone. Speech starts after {first:.1f}s; {length:.1f}s of speech took {total:.1f}s to make.')
    print('\nThe Echo still has its old voice. To switch to Fable, in Home Assistant:')
    print(f'  1. Settings > Devices & services > Add integration > Wyoming Protocol: host 127.0.0.1, port {args.port}')
    print('  2. Settings > Voice assistants > your assistant > Text-to-speech: choose the new entry, voice Fable')
    print('To go back, set Text-to-speech to Piper again. To remove it: sudo python3 ./install-fable.py --undo')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, subprocess.SubprocessError, ValueError, KeyError, IndexError) as error:
        raise SystemExit(f'STOPPED: {error}\nYour Echo has not been changed.')
