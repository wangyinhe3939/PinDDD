"""A transient ps timeout must not abandon the monitored child process."""
from pathlib import Path
import runpy
import subprocess
import sys
from unittest.mock import patch

root = Path(__file__).resolve().parent.parent
real_run = subprocess.run
queries = 0

def busy_ps(command, **kwargs):
    global queries
    if command[0] == '/bin/ps':
        queries += 1
        if queries == 1:
            raise subprocess.TimeoutExpired(command, 1)
    return real_run(command, **kwargs)

with patch.object(sys, 'argv', ['run.py', '--', sys.executable, '-c', 'import time; time.sleep(0.4)']), patch.object(subprocess, 'run', busy_ps):
    try:
        runpy.run_path(str(root / 'scripts/run.py'), run_name='__main__')
    except SystemExit as result:
        assert result.code == 0, result.code
assert queries > 1, 'monitoring must continue after the timeout'
print('PASS: ps timeout is caught; child remains monitored and exits normally')
