#!/usr/bin/env python3
"""Serve the editor locally using Python's standard library; no installation."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port', type=int, default=7951)
args = parser.parse_args()
root = Path(__file__).resolve().parent
class EditorHandler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def end_headers(self):
        # Revalidate local files so a normal refresh picks up editor changes.
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


# Native ES modules request many files at once; keep connections and queue the burst.
ThreadingHTTPServer.request_queue_size = 128
handler = partial(EditorHandler, directory=str(root))
with ThreadingHTTPServer(('127.0.0.1', args.port), handler) as server:
    print(f'拼DDD · 创作者编辑器：http://127.0.0.1:{server.server_port}/editor/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
