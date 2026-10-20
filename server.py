#!/usr/bin/env python3
"""
Multi-threaded HTTP server untuk PixelCrop Studio.
Menyajikan berkas dari direktori public/ dengan MIME-type yang benar untuk WebAssembly (.wasm)
dan tanpa COEP yang memblokir Google Fonts atau Tailwind CDN.
"""

import http.server
import os
import socketserver
import sys

PORT = 8080
DIRECTORY = os.path.join(os.path.dirname(__file__), "public")

class WasmHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Header CORS standar & no-cache untuk pengembangan
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def guess_type(self, path):
        if path.endswith(".wasm"):
            return "application/wasm"
        if path.endswith(".js"):
            return "application/javascript"
        if path.endswith(".css"):
            return "text/css"
        if path.endswith(".json"):
            return "application/json"
        return super().guess_type(path)

class ThreadingWasmServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True

def run():
    for p in range(PORT, PORT + 20):
        try:
            with ThreadingWasmServer(("", p), WasmHandler) as httpd:
                print(f"============================================================")
                print(f"  PixelCrop Studio Server berjalan di: http://localhost:{p}")
                print(f"  Melayani direktori: {DIRECTORY}")
                print(f"  Multi-threaded, MIME WASM aktif, No COEP blocking.")
                print(f"============================================================")
                sys.stdout.flush()
                httpd.serve_forever()
                break
        except OSError as e:
            if "address already in use" in str(e).lower() or e.errno in (98, 10048):
                continue
            raise

if __name__ == "__main__":
    run()
