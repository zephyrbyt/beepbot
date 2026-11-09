#!/usr/bin/env python3
"""Installs Music Assistant on this server, so "play this song" can work and can play on the Echo.

Run with:  sudo python3 ./install-music-assistant.py
Remove:    sudo python3 ./install-music-assistant.py --undo
           (add --delete-data to also delete its settings)

It needs Docker's host network, because speakers have to find it and reach it. No firewall change is
needed: your firewall already allows home network and VPN devices and blocks the internet from reaching
it. Don't turn on Music Assistant's "Remote Access" setting, or it would no longer be home-only.
Home Assistant isn't restarted, and nothing else on the server is changed.
"""
import argparse
import os
from pathlib import Path
import shutil
import socket
import subprocess
import time
import urllib.error
import urllib.request

parser = argparse.ArgumentParser(description='Install Music Assistant')
parser.add_argument('--undo', action='store_true', help='remove Music Assistant')
parser.add_argument('--delete-data', action='store_true', help='with --undo: delete its settings too')
parser.add_argument('--data', default='/opt/music-assistant', help=argparse.SUPPRESS)
parser.add_argument('--url', default='http://127.0.0.1:8095', help=argparse.SUPPRESS)
parser.add_argument('--wait', type=int, default=180, help=argparse.SUPPRESS)
args = parser.parse_args()

IMAGE = 'ghcr.io/music-assistant/server:latest'
NAME = 'home-music-assistant'
PORTS = {8095: 'its web page', 8097: 'streaming to speakers', 8927: 'streaming to the Echo'}
DATA = Path(args.data)
# Docker's normal permissions, minus everything a music server has no use for.
TIGHT = ['--cap-drop=ALL', '--cap-add=CHOWN', '--cap-add=DAC_OVERRIDE', '--cap-add=FOWNER', '--cap-add=SETUID', '--cap-add=SETGID']


def docker(*cmd, timeout=180):
    result = subprocess.run(['docker', *cmd], capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f'docker {cmd[0]} failed: ' + (result.stdout + result.stderr)[-500:])
    return result.stdout.strip()


def remove_container():
    subprocess.run(['docker', 'rm', '-f', NAME], capture_output=True)


def answering():
    try:
        with urllib.request.urlopen(args.url + '/', timeout=5):
            return True
    except urllib.error.HTTPError as error:
        return error.code < 500  # it replied, even if the page wants a login
    except OSError:
        return False


def start(image, extra):
    remove_container()
    docker('create', '--name', NAME, '--restart=unless-stopped', '--network', 'host', '--security-opt=no-new-privileges:true',
           '--memory=2g', '--cpus=2', '--log-opt', 'max-size=10m', '--log-opt', 'max-file=2',
           *extra, '-v', f'{DATA}:/data', image)
    docker('start', NAME)
    deadline = time.monotonic() + args.wait
    while time.monotonic() < deadline:
        if docker('inspect', '--format', '{{.State.Running}}', NAME) != 'true':
            return False
        if answering():
            return True
        time.sleep(3)
    return False


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run with: sudo python3 ./install-music-assistant.py')
    if args.undo:
        if input('Type REMOVE to remove Music Assistant: ').strip() != 'REMOVE':
            print('Stopped. Nothing was changed.')
            return
        remove_container()
        if args.delete_data:
            shutil.rmtree(DATA, ignore_errors=True)
        print('Removed. ' + ('Its settings are deleted too.' if args.delete_data else f'Its settings are kept in {DATA}.'))
        print(f'To delete the download: sudo docker rmi {IMAGE}')
        print('Also remove it from Settings > Devices & services in Home Assistant.')
        return

    # ---- look only ----
    if subprocess.run(['docker', 'inspect', NAME], capture_output=True).returncode == 0:
        raise SystemExit('Music Assistant is already installed. Nothing changed.')
    for port, purpose in PORTS.items():
        with socket.socket() as probe:
            probe.settimeout(1)
            if probe.connect_ex(('127.0.0.1', port)) == 0:
                raise SystemExit(f'Something else is already using port {port}, needed for {purpose}. Nothing changed.')
    print('This downloads Music Assistant, then starts it on this server.')
    print('It reaches the internet for Spotify, and for artwork and music details. Its docs don\'t say what else it contacts.')
    if input('Type INSTALL to go ahead: ').strip() != 'INSTALL':
        print('Stopped. Nothing was changed.')
        return

    # ---- install, removing it again if it won't start ----
    print('Downloading...', flush=True)
    docker('pull', IMAGE, timeout=3600)
    image = docker('image', 'inspect', '--format', '{{.Id}}', IMAGE)
    new_data = not DATA.exists()
    DATA.mkdir(parents=True, exist_ok=True)
    DATA.chmod(0o700)
    print('Starting it (this can take a minute or two)...', flush=True)
    try:
        started = start(image, TIGHT)
        relaxed = False
        if not started:
            print('It would not start with the tightest permissions, so trying Docker\'s normal ones...', flush=True)
            started = start(image, [])
            relaxed = True
        if not started:
            detail = subprocess.run(['docker', 'logs', '--tail', '12', NAME], capture_output=True, text=True)
            print((detail.stdout + detail.stderr)[-900:])
            raise RuntimeError('Music Assistant did not start')
    except Exception as error:  # noqa: BLE001 - leave nothing half installed
        remove_container()
        if new_data:
            shutil.rmtree(DATA, ignore_errors=True)
        raise SystemExit(f'STOPPED: {error}\nIt has been removed. Nothing else was changed.')
    if relaxed:
        print('Note: it needed Docker\'s normal permissions rather than the tightest ones.')
    print('\nDone. Music Assistant is running. Do these next, in order:')
    print('  1. Open http://YOUR-SERVER-IP:8095 straight away and create its admin login. The first person to')
    print('     open it sets this, and the password can\'t be recovered, so save it in Vaultwarden.')
    print('  2. In its Settings, add Spotify as a music provider (needs Premium).')
    print('  3. Pair the Echo: in Home Assistant, enable the Echo\'s "Sendspin pairing token" entity, then give')
    print('     that token to Music Assistant when it asks. Keep the token private.')
    print('  4. In Home Assistant: Settings > Devices & services > Add integration > Music Assistant,')
    print('     address http://127.0.0.1:8095, and sign in with that admin login.')
    print('  Leave "Remote Access" off in its settings.')
    print('To remove it: sudo python3 ./install-music-assistant.py --undo')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, subprocess.SubprocessError, ValueError) as error:
        raise SystemExit(f'STOPPED: {error}\nNothing else on the server was changed.')
