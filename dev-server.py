"""
TutorAI local dev server — like `python3 -m http.server`, but tells the
browser not to cache, so code changes show up on a normal reload.

    python3 dev-server.py          # http://localhost:5500
    python3 dev-server.py 8080     # another port

Missing pages get pages/404.html with a 404 status (a <base> tag keeps its
relative links working at any URL).

Development only. Serves the folder this file is in.
"""
import functools
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_error(self, code, message=None, explain=None):
        page = os.path.join(self.directory, "pages", "404.html")
        if code != 404 or self.command not in ("GET", "HEAD") or not os.path.isfile(page):
            return super().send_error(code, message, explain)
        with open(page, "rb") as f:
            body = f.read().replace(b"<head>", b'<head>\n  <base href="/pages/">', 1)
        self.send_response(404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command == "GET":
            self.wfile.write(body)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5500
    root = os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(NoCacheHandler, directory=root)
    with http.server.ThreadingHTTPServer(("", port), handler) as httpd:
        print(f"TutorAI dev server (no cache): http://localhost:{port}  — Ctrl+C to stop")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
