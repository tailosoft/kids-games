#!/usr/bin/env python3
"""Dev server that never lets the browser cache anything.

    python3 tools/serve.py [port]

Plain `http.server` answers with 304s, which is one more place a stale file can
hide while you are trying to see a change.
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


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


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
server = ThreadingHTTPServer(("0.0.0.0", port), partial(NoCacheHandler, directory="."))
print("Say It! dev server  http://localhost:%d  (no-store: every reload is fresh)" % port)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
