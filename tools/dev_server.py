"""
Local dev server for Pac-Man AR.

    python tools/dev_server.py          -> http://localhost:8000

Serves the PacManAR folder like `python -m http.server`, plus one extra:
PUT /assets/targets/<name>.mind saves a compiled target (used by tools/compile.html).
Only listens on localhost.
"""
import os
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALLOWED = re.compile(r"^/assets/targets/[A-Za-z0-9_\-]+\.mind$")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")   # always load the newest files while developing
        super().end_headers()

    def do_PUT(self):
        if not ALLOWED.match(self.path):
            self.send_error(403, "Only /assets/targets/*.mind can be written")
            return
        length = int(self.headers.get("Content-Length", 0))
        data = self.rfile.read(length)
        out = os.path.join(ROOT, self.path.lstrip("/").replace("/", os.sep))
        with open(out, "wb") as f:
            f.write(data)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(f"saved {len(data)} bytes".encode())


if __name__ == "__main__":
    print("Serving", ROOT, "at http://localhost:8000")
    ThreadingHTTPServer(("127.0.0.1", 8000), Handler).serve_forever()
