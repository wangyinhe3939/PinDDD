#!/usr/bin/env python3
"""Build the Mac release and create outputs/拼DDD.dmg without opening Finder."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--dmg-only', action='store_true', help='Package an already-built Release app')
args = parser.parse_args()
scratch = root / '.build_tmp'
outputs = root / 'outputs'
assert not scratch.is_symlink() and not outputs.is_symlink()
outputs.mkdir(exist_ok=True)
final = outputs / '拼DDD.dmg'
if final.exists() or (outputs / 'PinDDD.app').exists():
    parser.error('Existing delivery found in outputs; move it to Trash before replacing it.')
dmgbuild = shutil.which('dmgbuild')
if not dmgbuild:
    parser.error('dmgbuild is required; install Packaging/requirements.txt in your packaging environment.')
def run(name, command):
    result = subprocess.run([sys.executable, str(root / 'scripts/run.py'), '--log', name, '--', *map(str, command)], cwd=root, stdin=subprocess.DEVNULL)
    if result.returncode:
        print((scratch / name).read_text(errors='replace')[-6000:])
        raise SystemExit(result.returncode)
if not args.dmg_only:
    run('package-build.log', ['xcodebuild','-project','PinDDD.xcodeproj','-scheme','PinDDD-Mac','-configuration','Release','-destination','generic/platform=macOS','-derivedDataPath',scratch/'DerivedData','ARCHS=arm64 x86_64','build'])
app = scratch / 'DerivedData/Build/Products/Release/PinDDD.app'
if not app.is_dir():
    parser.error('No Release app; build first.')
run('package-signature.log', ['codesign','--verify','--deep','--strict',app])
source = scratch / 'dmg-source'
source.mkdir(exist_ok=True)
run('package-stage.log', ['ditto',app,source/'PinDDD.app'])
run('package-dmg.log', [dmgbuild,'-s',root/'Packaging/dmg-settings.py','-D','app='+str(app),'-D','background='+str(root/'Packaging/background.png'),'--detach-retries','1','拼DDD',scratch/'拼DDD.dmg'])
run('package-verify.log', ['hdiutil','verify',scratch/'拼DDD.dmg'])
os.replace(source/'PinDDD.app',outputs/'PinDDD.app')
os.replace(scratch/'拼DDD.dmg',final)
print(final)
print(outputs/'PinDDD.app')
