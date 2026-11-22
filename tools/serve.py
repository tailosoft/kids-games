#!/usr/bin/env python3
"""Dev server for Say It!

    python3 tools/serve.py [port]      # default 8080, or $PORT

Two jobs beyond serving files:

  * Nothing is cacheable. Plain `http.server` answers with 304s, which is one
    more place a stale file can hide while you are trying to see a change.
  * A busy port is not a failure. Dev machines run plenty of things on 8080, so
    rather than dying with "Address already in use" it walks up to the next
    free port and tells you which one it took.
"""
import os
import socket
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

TRIES = 40


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_header(self, keyword, value):
        if keyword == "Last-Modified":
            return                      # no validators, no 304s
        super().send_header(keyword, value)

    def log_message(self, fmt, *args):
        if "404" in (fmt % args):       # keep misses, drop the routine noise
            super().log_message(fmt, *args)


def lan_address():
    """Best guess at the address a phone on the same wifi would use."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("192.168.1.1", 1))   # no packets are sent
        return probe.getsockname()[0]
    except OSError:
        return None
    finally:
        probe.close()


def serve(first_port):
    handler = partial(NoCacheHandler, directory=".")
    taken = []
    for port in range(first_port, first_port + TRIES):
        try:
            return ThreadingHTTPServer(("0.0.0.0", port), handler), port, taken
        except OSError as problem:
            if problem.errno != 98:      # not "address in use": a real failure
                raise
            taken.append(port)
    raise SystemExit(
        "No free port between %d and %d." % (first_port, first_port + TRIES - 1)
    )


wanted = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", 8080))
server, port, busy = serve(wanted)

if busy:
    print("Port %s busy (something else on this machine is using %s)."
          % (", ".join(str(p) for p in busy), "them" if len(busy) > 1 else "it"))
print("Say It!  http://localhost:%d" % port)
lan = lan_address()
if lan:
    print("         http://%s:%d  (same wifi — tap mode only, voice needs HTTPS)" % (lan, port))
print("         no-store: every reload is fresh. Ctrl+C to stop.")

try:
    server.serve_forever()
except KeyboardInterrupt:
    print("\nstopped")
