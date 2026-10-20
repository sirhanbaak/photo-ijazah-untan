#!/usr/bin/env python3
"""
Simple HTTP server untuk PixelCrop Studio yang menyajikan berkas dari direktori public/
dengan MIME-type yang benar untuk WebAssembly (.wasm).
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
        # Header untuk mendukung shared memory / wasm dan caching lokal
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cache-Control", "no-cache, must-revalidate")
        super().end_headers()

    def guess_type(self, path):
        if path.endswith(".wasm"):
            return "application/wasm"
        if path.endswith(".js"):
            return "application/javascript"
        return super().guess_type(path)

def run():
    port = PORT
    for p in range(PORT, PORT + 20):
        try:
            with socketserver.TCPServer(("", p), WasmHandler) as httpd:
                print(f"============================================================")
                print(f"  PixelCrop Studio Server berjalan di: http://localhost:{p}")
                print(f"  Melayani direktori: {DIRECTORY}")
                print(f"  Tekan Ctrl+C untuk menghentikan server.")
                print(f"============================================================")
                sys.stdout.flush()
                httpd.serve_forever()
                break
        except OSError as e:
            if "address already in use" in str(e).lower() or e.errno == 98 or e.errno == 10048:
                continue
            raise

if __name__ == "__main__":
    run()
