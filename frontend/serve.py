#!/usr/bin/env python3
"""
Local static file server for IT Operations Hub, with caching disabled.

Why this exists instead of `python3 -m http.server`: this app is plain
ES modules with no bundler/build step, so every file (index.html, every
page/service/component .js, every .css) is its own URL the browser caches
independently. `http.server` sends no Cache-Control headers at all, which
lets browsers apply heuristic caching - Chrome in particular will then keep
serving an old cached copy of a file after it's edited on disk, sometimes
for a surprisingly long time, with no way to tell from a normal reload.
Every response here carries no-store, so the browser always refetches.

Usage: python3 serve.py [port]   (default 8080)
"""
import http.server
import socketserver
import sys
import os
import urllib.request
import urllib.error

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

# Backend the /api/* proxy forwards to. Kept as a same-origin proxy so the
# browser sees frontend and backend as ONE origin (http://localhost:PORT) -
# this avoids cross-site cookie restrictions entirely (no SameSite/Secure/
# partitioned-cookie issues), rather than trying to work around them.
BACKEND_BASE = 'http://192.168.1.10:8081'

os.chdir(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()

    def _proxy(self):
        target_url = BACKEND_BASE + self.path
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length else None

        req = urllib.request.Request(target_url, data=body, method=self.command)
        for header in ('Content-Type', 'Cookie'):
            if header in self.headers:
                req.add_header(header, self.headers[header])

        try:
            with urllib.request.urlopen(req) as resp:
                self.send_response(resp.status)
                for key, value in resp.getheaders():
                    if key.lower() not in ('transfer-encoding', 'connection'):
                        self.send_header(key, value)
                self.end_headers()
                self.wfile.write(resp.read())
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            for key, value in e.headers.items():
                if key.lower() not in ('transfer-encoding', 'connection'):
                    self.send_header(key, value)
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(f'{{"success": false, "error": "Proxy error: {e}"}}'.encode())

    def do_GET(self):
        if self.path.startswith('/api/'):
            self._proxy()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/'):
            self._proxy()
        else:
            self.send_error(404)

    def do_OPTIONS(self):
        if self.path.startswith('/api/'):
            self._proxy()
        else:
            self.send_error(404)

    def do_DELETE(self):
        if self.path.startswith('/api/'):
            self._proxy()
        else:
            self.send_error(404)


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


if __name__ == '__main__':
    with ReusableTCPServer(('127.0.0.1', PORT), NoCacheHandler) as httpd:
        print(f'Serving IT Operations Hub on http://127.0.0.1:{PORT} (caching disabled)')
        httpd.serve_forever()
