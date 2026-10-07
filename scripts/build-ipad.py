#!/usr/bin/env python3
"""Build the automatically signed iPad/iPhone container with a bounded Xcode run."""
import argparse
from pathlib import Path
import subprocess
import sys
root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--device', help='Optional paired iPad UDID from xcrun devicectl list devices')
parser.add_argument('--configuration', choices=['Release', 'Debug'], default='Release', help='Release is the lightweight signed delivery build')
args = parser.parse_args()
destination = 'id=' + args.device if args.device else 'generic/platform=iOS'
raise SystemExit(subprocess.call([sys.executable, str(root/'scripts/run.py'), '--log', 'ipad-build.log', '--', 'xcodebuild', '-project', 'PinDDD.xcodeproj', '-scheme', 'PinDDD-iOS', '-configuration', args.configuration, '-destination', destination, '-derivedDataPath', str(root/'.build_tmp/DerivedData'), '-allowProvisioningUpdates', '-allowProvisioningDeviceRegistration', 'build'], cwd=root, stdin=subprocess.DEVNULL))
