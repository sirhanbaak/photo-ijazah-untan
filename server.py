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
from urllib.parse import urlsplit

PORT = 8080
DIRECTORY = os.path.join(os.path.dirname(__file__), "public")

class WasmHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Header CORS standar
        self.send_header("Access-Control-Allow-Origin", "*")
        if self.is_document_request():
            # Dokumen HTML tidak boleh di-cache agar perubahan langsung terlihat
            self.send_header("Cache-Control", "no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        else:
            # Aset statis (wasm, js, css, gambar) boleh di-cache singkat
            self.send_header("Cache-Control", "public, max-age=3600")
        super().end_headers()

    def is_document_request(self):
        path = urlsplit(self.path).path
        if path.endswith("/"):
            return True
        return path.endswith(".html") or "." not in os.path.basename(path)

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
    # Di Windows SO_REUSEADDR mengizinkan dua proses mengikat port yang sama;
    # lebih aman membiarkannya nonaktif dan memakai loop pencarian port.
    allow_reuse_address = os.name != "nt"
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
                return
        except OSError as e:
            if e.errno in (98, 10048) or "address already in use" in str(e).lower():
                print(f"  Port {p} sedang dipakai, mencoba port berikutnya...")
                continue
            raise

    print(
        f"Gagal menjalankan server: port {PORT}-{PORT + 19} semuanya tidak tersedia.",
        file=sys.stderr,
    )
    sys.exit(1)

if __name__ == "__main__":
    run()

