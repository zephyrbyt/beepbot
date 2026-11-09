"""Watches this server's network connections, so the radio lyrics know how far behind live the Echo's stream began.

A radio station hands each new listener some catch-up audio, and the amount changes by itself (Heart: sometimes
about 5 seconds, sometimes about 15). The Echo is behind live by whatever Music Assistant got when it connected.
That can't be guessed, but it can be measured: Linux counts the bytes every connection has received (the same
numbers `ss -ti` shows). Once a connection has caught up with live, the audio it has received minus the time it has
been open is how far behind live it started.

So, about once a second, this notes when each connection first appeared and, for its first two minutes, how many
bytes it had received. Only the connection to the station is ever used, and only those two numbers: nothing is
read from inside any connection, and nothing is saved except that, for the station connection in use.

Plain Python (the Linux "sock_diag" netlink interface), so it's tested without Home Assistant.
"""
from __future__ import annotations

import socket
import statistics
import struct
import time

NETLINK_SOCK_DIAG = 4
SOCK_DIAG_BY_FAMILY = 20
NLM_F_REQUEST, NLM_F_DUMP = 0x1, 0x300
NLMSG_DONE, NLMSG_ERROR = 3, 2
INET_DIAG_INFO = 2
TCP_ESTABLISHED = 1
BYTES_RECEIVED_AT = 128   # where tcp_info keeps tcpi_bytes_received (a u64), on every kernel since 4.1
PEOPLE_UIDS = (1000, 60000)  # the accounts Linux gives people (services and containers run as others)

SAMPLE_SECONDS = 120      # bytes are noted for a connection's first two minutes
SAMPLE_EVERY = 2.0
SETTLE_SECONDS = 4        # the first few seconds only show the start of the catch-up arriving


def _request(family: int) -> bytes:
    sockid = b'\0' * 48  # any addresses and ports
    body = struct.pack('=BBBBI', family, socket.IPPROTO_TCP, 1 << (INET_DIAG_INFO - 1), 0, 1 << TCP_ESTABLISHED) + sockid
    return struct.pack('=IHHII', 16 + len(body), SOCK_DIAG_BY_FAMILY, NLM_F_REQUEST | NLM_F_DUMP, 1, 0) + body


def _address(family: int, raw: bytes) -> str:
    if family == socket.AF_INET:
        return socket.inet_ntop(socket.AF_INET, raw[:4])
    text = socket.inet_ntop(socket.AF_INET6, raw[:16])
    return text[7:] if text.startswith('::ffff:') and '.' in text else text  # an IPv4 address carried over IPv6


def parse(data: bytes, people_too: bool = False) -> tuple[list, bool]:
    """Connections in a netlink reply: [((local ip, local port, remote ip, remote port), bytes received)], done?
    Connections belonging to a person's own login (a web browser on this computer playing the same station, say)
    are left out unless people_too: Music Assistant's is a service's."""
    out, at, done = [], 0, False
    while at + 16 <= len(data):
        length, kind = struct.unpack_from('=IH', data, at)
        if length < 16:
            break
        if kind in (NLMSG_DONE, NLMSG_ERROR):
            done = True
            break
        if at + length > len(data):
            break  # cut off: the rest comes in the next read
        if kind == SOCK_DIAG_BY_FAMILY and length >= 16 + 72:
            msg = at + 16
            family = data[msg]
            sport, dport = struct.unpack_from('>HH', data, msg + 4)
            src, dst = data[msg + 8:msg + 24], data[msg + 24:msg + 40]
            uid = struct.unpack_from('=I', data, msg + 64)[0]
            if not people_too and PEOPLE_UIDS[0] <= uid < PEOPLE_UIDS[1]:
                at += (length + 3) & ~3
                continue
            received = None
            attr, end = msg + 72, at + length  # inet_diag_msg is 72 bytes
            while attr + 4 <= end:
                alen, atype = struct.unpack_from('=HH', data, attr)
                if alen < 4:
                    break
                if atype == INET_DIAG_INFO and alen - 4 >= BYTES_RECEIVED_AT + 8:
                    received = struct.unpack_from('=Q', data, attr + 4 + BYTES_RECEIVED_AT)[0]
                attr += (alen + 3) & ~3
            if received is not None:
                out.append(((_address(family, src), sport, _address(family, dst), dport), received))
        at += (length + 3) & ~3
    return out, done


def connections(people_too: bool = False) -> list:
    """Every established TCP connection on this machine (its network): [((lip, lport, rip, rport), bytes)]."""
    out = []
    for family in (socket.AF_INET, socket.AF_INET6):
        with socket.socket(socket.AF_NETLINK, socket.SOCK_RAW, NETLINK_SOCK_DIAG) as nl:
            nl.settimeout(2)
            nl.send(_request(family))
            while True:
                found, done = parse(nl.recv(1 << 17), people_too)
                out.extend(found)
                if done:
                    break
    return out


class Watch:
    """Remembers when connections appeared and their bytes over their first two minutes."""

    def __init__(self, list_connections=connections, clock=time.time) -> None:
        self._list = list_connections
        self._clock = clock
        self.seen: dict = {}      # key -> {'first': seconds, 'exact': bool, 'samples': [(seconds, bytes)]}
        self._started = False

    def poll(self) -> None:
        now = self._clock()
        current = self._list()
        alive = set()
        for key, received in current:
            alive.add(key)
            rec = self.seen.get(key)
            if rec is None:
                # Connections already open at the very first look started at some unknown time.
                rec = self.seen[key] = {'first': now, 'exact': self._started, 'samples': []}
            if now - rec['first'] <= SAMPLE_SECONDS and (not rec['samples'] or now - rec['samples'][-1][0] >= SAMPLE_EVERY):
                rec['samples'].append((now, received))
        for key in [k for k in self.seen if k not in alive]:
            del self.seen[key]
        self._started = True

    def remember(self, key, rec: dict) -> None:
        """A connection's record from before a restart (it's still open, so its start is still known)."""
        if key in self.seen or not self._started:
            self.seen[key] = {**rec, 'exact': True}

    def station_connection(self, ips, port: int, own_ports=()):
        """The newest connection to the station that isn't one of this server's own listens: (key, record)."""
        found = [(k, r) for k, r in self.seen.items() if k[2] in ips and k[3] == port and k[1] not in own_ports]
        if not found:
            return None, None
        return max(found, key=lambda kr: kr[1]['first'])


def behind_live(rec: dict, bytes_per_second: float, poll_seconds: float = 1.0):
    """How far behind live a connection started, from its bytes, or None if that can't be known. It can't run
    further ahead than the catch-up it was given, and once it has caught up with live it stays there: the level it
    reaches is the answer. It's first noticed up to a poll after it opened, so half a poll is allowed for."""
    if not rec or not rec.get('exact') or not bytes_per_second:
        return None
    opened = rec['first'] - poll_seconds / 2
    leads = [received / bytes_per_second - (at - opened) for at, received in rec.get('samples', []) if at - opened >= SETTLE_SECONDS]
    if not leads:
        return None
    # Once caught up it stays level, give or take the moment of each look: the middle of that level.
    top = max(leads)
    return round(statistics.median([x for x in leads if x >= top - 1.0]), 2)
