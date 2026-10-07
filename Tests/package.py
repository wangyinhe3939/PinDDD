"""Check a read-only mounted DMG against its source App (requires packaging dependencies)."""
import hashlib
from pathlib import Path
import subprocess
import sys
from ds_store import DSStore
from mac_alias import Alias

root = Path(__file__).resolve().parent.parent
mount, app = map(Path, sys.argv[1:])
assert mount.is_dir() and app.is_dir()
assert (mount / 'Applications').is_symlink()
assert (mount / 'Applications').readlink() == Path('/Applications')
assert (mount / '.background.png').read_bytes() == (root / 'Packaging/background.png').read_bytes()
with DSStore.open(str(mount / '.DS_Store'), 'r') as store:
    assert store['PinDDD.app']['Iloc'] == (185, 232)
    assert store['Applications']['Iloc'] == (579, 232)
    window = store['.']['bwsp']
    assert window['WindowBounds'].endswith('{768, 590}}'), window
    assert not any(window[k] for k in ['ShowToolbar', 'ShowStatusBar', 'ShowTabView', 'ShowSidebar', 'ShowPathbar'])
    view = store['.']['icvp']
    assert view['iconSize'] == 128 and view['backgroundType'] == 2
    alias = Alias.from_bytes(view['backgroundImageAlias'])
    assert alias.target.filename == '.background.png'
def digest(directory):
    return {str(p.relative_to(directory)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in directory.rglob('*') if p.is_file()}
source = digest(app)
assert digest(mount / 'PinDDD.app') == source, 'packaged App differs'
subprocess.run(['codesign', '--verify', '--deep', '--strict', str(mount / 'PinDDD.app')], check=True)
print(f'PASS: Finder layout, background alias, Applications link, {len(source)} App files and signature')
