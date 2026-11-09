#!/usr/bin/env python3
"""Swap the voice recogniser to a more accurate model, so it mishears you less.

Run with:  sudo python3 ./upgrade-whisper.py
Look only: sudo python3 ./upgrade-whisper.py --check
Undo:      sudo python3 ./upgrade-whisper.py --undo

It downloads the new model, starts it in place of the old one and measures both on this
server. If the new one fails, gets the test sentence wrong or is too slow, the old one is
put straight back. The old container is kept so you can undo at any time.

Only the speech recogniser changes. Home Assistant doesn't restart, and the recogniser still has no
internet once it's running: the download happens in a separate temporary container, and
none of your speech is sent anywhere by this script.
"""
import argparse
import json
from pathlib import Path
import os
import socket
import subprocess
import time

parser = argparse.ArgumentParser(description='Upgrade the speech recogniser')
parser.add_argument('--check', action='store_true', help='report what would happen, change nothing')
parser.add_argument('--undo', action='store_true', help='go back to the previous recogniser')
parser.add_argument('--model', default='small-int8', help='model to use (default small-int8)')
parser.add_argument('--beam-size', default='5', help='higher is more careful but slower')
parser.add_argument('--cpu-threads', default='3', help='processor threads to use')
parser.add_argument('--max-seconds', type=float, default=8.0, help='refuse the new model if the test takes longer')
parser.add_argument('--data', default='/opt/home-voice/whisper', help=argparse.SUPPRESS)
parser.add_argument('--report', default='/tmp/whisper-upgrade-report.json', help=argparse.SUPPRESS)
args = parser.parse_args()

NAME = 'home-voice-whisper'
OLD = NAME + '-previous'
BOOT = NAME + '-download'
PIPER = 'home-voice-piper'
PORT = 10300
PIPER_PORT = 10200
LABEL = 'home.private-voice=1'
# Short list of words it should expect. It nudges the model without limiting what it can hear.
HINT = "Play, pause, next song, Spotify, Sonos, heating, thermostat, temperature, lights, bedroom, office, landing, spare room, weather, forecast."
TESTS = ['What is the weather going to be like tomorrow?', 'Turn on the bedroom light.', "What's the heating at?", 'Play Golden Brown by The Stranglers.']
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
    """Have Piper read a sentence aloud, so both models are tested on identical audio."""
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
        step = 4096
        for start in range(0, len(audio), step):
            send(sock, 'audio-chunk', form, audio[start:start + step])
        began = time.monotonic()
        send(sock, 'audio-stop')
        while True:
            kind, data, _ = receive(stream)
            if kind == 'transcript':
                return data.get('text', '').strip(), time.monotonic() - began


def words(text):
    return {w.strip('.,?!\'"').lower() for w in text.split() if w.strip('.,?!\'"')}


def measure(address, clips):
    results = []
    for text, clip in clips:
        heard, seconds = transcribe(address, clip)
        results.append({'said': text, 'heard': heard, 'seconds': round(seconds, 2),
                        'matched': round(len(words(text) & words(heard)) / len(words(text)), 2)})
    return results


def wait_ready(name, address, seconds=600):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if docker('inspect', '--format', '{{.State.Running}}', name) != 'true':
            raise RuntimeError(f'{name} stopped: ' + docker('logs', '--tail', '6', name)[-500:])
        probe = ("import socket,json\ns=socket.create_connection(('127.0.0.1',%d),timeout=3)\n"
                 "s.sendall(b'{\"type\":\"describe\"}\\n')\nf=s.makefile('rb')\nh=json.loads(f.readline())\n"
                 "n=h.get('data_length',0)\nd=json.loads(f.read(n)) if n else h.get('data',{})\nassert h['type']=='info' and d.get('asr')\n" % PORT)
        if subprocess.run(['docker', 'exec', name, 'python3', '-c', probe], capture_output=True, timeout=15).returncode == 0:
            return
        time.sleep(5)
    raise RuntimeError(f'{name} did not get ready in time')


def undo():
    if not exists(OLD):
        raise SystemExit('There is no previous recogniser to go back to. Nothing changed.')
    if input('Type UNDO to go back to the previous recogniser: ').strip() != 'UNDO':
        raise SystemExit('Stopped. Nothing changed.')
    if exists(NAME):
        docker('rm', '-f', NAME)
    docker('rename', OLD, NAME)
    docker('update', '--restart=unless-stopped', NAME)
    docker('start', NAME)
    print('Previous recogniser is back. Nothing else needed.')


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run with: sudo python3 ./upgrade-whisper.py')
    if args.undo:
        undo()
        return

    # ---- look only ----
    info = json.loads(docker('inspect', NAME))[0]
    image = info['Image']
    command = info['Config'].get('Cmd') or []
    networks = info['NetworkSettings']['Networks']
    if len(networks) != 1:
        raise SystemExit('The recogniser is not set up as expected. Nothing changed.')
    network, net = next(iter(networks.items()))
    address = net.get('IPAddress') or (net.get('IPAMConfig') or {}).get('IPv4Address')
    piper = json.loads(docker('inspect', PIPER))[0]['NetworkSettings']['Networks'][network]['IPAddress']
    if not address or docker('network', 'inspect', '--format', '{{.Internal}}', network) != 'true':
        raise SystemExit('The recogniser is not on its private network as expected. Nothing changed.')
    if any(v for v in (info['NetworkSettings'].get('Ports') or {}).values()):
        raise SystemExit('The recogniser has a published port, which is not expected. Nothing changed.')
    current = command[command.index('--model') + 1] if '--model' in command else 'unknown'
    print(f'Recogniser now: {current} at {address}')
    print(f'Will use:       {args.model} (beam size {args.beam_size}, {args.cpu_threads} threads, expects: {HINT})')
    new_args = ['--model', args.model, '--language', 'en', '--beam-size', args.beam_size,
                '--cpu-threads', args.cpu_threads, '--initial-prompt', HINT]
    # Fail early if this version of the recogniser doesn't know an option.
    known = subprocess.run(['docker', 'run', '--rm', '--network', 'none', image, '--help'], capture_output=True, text=True, timeout=120)
    if '--initial-prompt' not in known.stdout + known.stderr:
        new_args = new_args[:-2]
    if command == new_args:
        raise SystemExit('Already using these settings. Nothing changed.')
    download = current != args.model
    if exists(BOOT):
        docker('rm', '-f', BOOT)
    clips = [(text, speak(piper, text)) for text in TESTS]
    before = measure(address, clips)
    state['before'] = {'model': current, 'tests': before}
    save()
    print('\nMeasured now, on this server:')
    for r in before:
        print(f'  {r["seconds"]:5.2f}s  "{r["heard"]}"')
    if args.check:
        print('\nCheck only: nothing was changed.')
        return

    if download:
        print('\nThis downloads the model from Hugging Face (a few hundred MB), swaps the recogniser and tests it.')
    else:
        print('\nThis keeps the same model, so nothing is downloaded. It restarts the recogniser with new settings and tests it.')
    print('Voice stops working for a minute or so during the swap. Home Assistant does not restart.')
    if input('Type UPGRADE to go ahead, or anything else to stop: ').strip() != 'UPGRADE':
        print('Stopped. Nothing was changed.')
        return

    wanted = {'HF_HUB_DISABLE_TELEMETRY', 'DO_NOT_TRACK', 'HF_HOME', 'XDG_CACHE_HOME'}
    envs = [x for e in info['Config'].get('Env') or [] if e.split('=')[0] in wanted for x in ('-e', e)]

    # ---- the download: a temporary container that is allowed online ----
    if download:
        state['status'] = 'downloading model'
        save()
        print('Downloading the model (this can take a few minutes)...', flush=True)
        docker('create', '--name', BOOT, '--label', LABEL, '--cap-drop=ALL', '--security-opt=no-new-privileges:true',
               '--memory=3g', '--cpus=3', *envs, '-v', f'{args.data}:/data', image, *new_args)
        try:
            docker('start', BOOT)
            wait_ready(BOOT, None)
        except Exception as error:
            subprocess.run(['docker', 'rm', '-f', BOOT], capture_output=True)
            raise RuntimeError(f'Could not download the model: {error}')
        docker('stop', '-t', '20', BOOT)
        docker('rm', BOOT)

    # ---- the swap ----
    state['status'] = 'swapping'
    save()
    if exists(OLD):
        docker('rm', '-f', OLD)
    docker('stop', '-t', '10', NAME)
    docker('rename', NAME, OLD)
    try:
        docker('create', '--name', NAME, '--label', LABEL, '--restart=unless-stopped', '--network', network, '--ip', address,
               '--cap-drop=ALL', '--security-opt=no-new-privileges:true', '--memory=3g', '--cpus=3',
               '--log-opt', 'max-size=10m', '--log-opt', 'max-file=2', *envs, '-v', f'{args.data}:/data', image, *new_args)
        docker('start', NAME)
        wait_ready(NAME, address)
        print('Testing it...', flush=True)
        # The first request also loads the model, so it's slower than normal use: warm up, then measure.
        transcribe(address, clips[0][1])
        after = measure(address, clips)
        state['after'] = {'model': args.model, 'tests': after}
        print('\nNew model, on this server:')
        for r in after:
            print(f'  {r["seconds"]:5.2f}s  "{r["heard"]}"')
        if min(r['matched'] for r in after) < 0.7:
            raise RuntimeError('it got the test sentences wrong')
        slowest = max(r['seconds'] for r in after)
        if slowest > args.max_seconds:
            raise RuntimeError(f'it took {slowest:.1f}s, over the {args.max_seconds:.0f}s limit')
        routes = "from pathlib import Path\nr=Path('/proc/net/route').read_text().splitlines()[1:]\nassert not any(x.split()[1]=='00000000' and int(x.split()[3],16)&1 for x in r)"
        docker('exec', NAME, 'python3', '-c', routes)
    except Exception as error:
        print(f'\nNot keeping it: {error}\nPutting the old one back...', flush=True)
        subprocess.run(['docker', 'rm', '-f', NAME], capture_output=True)
        docker('rename', OLD, NAME)
        docker('update', '--restart=unless-stopped', NAME)
        docker('start', NAME)
        state.update(status='failed, previous recogniser restored', error=str(error))
        save()
        raise SystemExit('The old recogniser is back and working as before.')
    docker('update', '--restart=no', OLD)
    state['status'] = 'ready'
    save()
    old_time = max(r['seconds'] for r in before)
    print(f'\nDone. Worst test: {old_time:.1f}s before, {slowest:.1f}s now. No restart needed; just talk to it.')
    print('To undo: sudo python3 ./upgrade-whisper.py --undo')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, subprocess.SubprocessError, ValueError, KeyError) as error:
        state.update(status='stopped', error=str(error))
        save()
        raise SystemExit(f'STOPPED: {error}')
