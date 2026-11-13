#!/usr/bin/env python3
"""Tiny static server for the Bunker web app.

Serves this folder on all network interfaces so phones / TVs on the same
Wi-Fi can open it, and exposes /lan.json with this machine's LAN address
so the host screen can show a QR code that works from other devices.

    python3 serve.py            # port 8080
    python3 serve.py 9000       # custom port
"""
import http.server
import json
import os
import socket
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
ROOT = os.path.dirname(os.path.abspath(__file__))


def lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))  # no packet is sent; picks the LAN interface
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path.split("?")[0] == "/lan.json":
            body = json.dumps({"url": f"http://{lan_ip()}:{PORT}/"}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    with http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler) as httpd:
        print(f"BUNKER online:\n  this Mac:  http://localhost:{PORT}/\n  phones/TV: http://{lan_ip()}:{PORT}/")
        httpd.serve_forever()
