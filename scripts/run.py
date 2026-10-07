#!/usr/bin/env python3
"""Run one noninteractive check with a 15-second process-group deadline."""
import argparse
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--log', help='Log filename inside .build_tmp')
parser.add_argument('command', nargs=argparse.REMAINDER)
args = parser.parse_args()
command = args.command[1:] if args.command[:1] == ['--'] else args.command
if not command:
    parser.error('a command is required')
if not root.is_relative_to(Path.home() / 'Developer') or (root / '.build_tmp').is_symlink():
    parser.error('unsafe workspace or temporary directory')
for directory in [root, *root.parents]:
    names = subprocess.run(['/usr/bin/xattr', str(directory)], check=True,
                           capture_output=True, text=True).stdout.splitlines()
    if any('icloud' in name.lower() or 'fileprovider' in name.lower() or 'ubiquit' in name.lower() for name in names):
        parser.error('workspace has cloud synchronization attributes')
scratch = root / '.build_tmp'
scratch.mkdir(exist_ok=True)
env = os.environ.copy()
for key in ['TMPDIR', 'CLANG_MODULE_CACHE_PATH', 'SWIFT_MODULECACHE_PATH', 'XDG_CACHE_HOME']:
    path = scratch / key.lower()
    path.mkdir(exist_ok=True)
    env[key] = str(path) + '/'
log = None
if args.log:
    if Path(args.log).name != args.log:
        parser.error('log must be a filename')
    log = (scratch / args.log).open('w')
try:
    process = subprocess.Popen(command, cwd=root, env=env, stdin=subprocess.DEVNULL,
                               stdout=log, stderr=subprocess.STDOUT if log else None, start_new_session=True)
    # Playwright browsers can start a detached process group. Track this job's
    # descendants and scratch-scoped Chrome helpers as well as its original group.
    owned = {process.pid}
    deadline = time.monotonic() + 15
    while process.poll() is None and time.monotonic() < deadline:
        try:
            rows = subprocess.run(['/bin/ps', '-axo', 'pid=,ppid=,command='],
                                  capture_output=True, text=True,
                                  timeout=min(1, max(0.01, deadline - time.monotonic()))).stdout.splitlines()
        except subprocess.TimeoutExpired:
            continue  # Keep enforcing the job deadline when the system is busy.
        entries = [row.strip().split(None, 2) for row in rows]
        for _ in range(4):
            for entry in entries:
                if len(entry) == 3:
                    pid, parent = int(entry[0]), int(entry[1])
                    scoped_browser = entry[2].startswith('/Applications/Google Chrome.app/') and str(scratch) + '/' in entry[2]
                    if parent in owned or scoped_browser:
                        owned.add(pid)
        time.sleep(min(0.2, max(0, deadline - time.monotonic())))
    if process.poll() is None:
        os.killpg(process.pid, signal.SIGKILL)
        for pid in owned - {process.pid}:
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        process.wait()
        print('TIMEOUT: job and detached test browsers stopped at 15 seconds', file=sys.stderr)
        result = 124
    else:
        result = process.returncode

finally:
    if log:
        log.close()
sys.exit(result)
