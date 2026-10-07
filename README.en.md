# PinDDD · Creator Editor

[简体中文](README.md) | **English**

**By the Double One DD 万元户**

A 3D scene assembly tool based on the official [Three.js Editor r186](https://github.com/mrdoob/three.js/tree/r186/editor). Import models, move them freely or stack them on surfaces, then save your project or export Blender coordinates. Built with plain JavaScript and bundled Three.js; the Mac and iPad containers use SwiftUI + WKWebView. The core editing workflow works offline.

**The current app interface is in Simplified Chinese.** This project documentation is available in Chinese and English.

[Download for Mac](https://github.com/wangyinhe3939/PinDDD/releases) · [MIT license](LICENSE)

![PinDDD · Build scenes. Piece by piece. / 拼DDD · 把灵感，拼成场景。](assets/promotion.png)

## Install and use

- **Mac:** macOS 14 or later, Apple Silicon / Intel. Download PinDDD.dmg from Releases, open it, and drag PinDDD into Applications.
- **Signing:** This preview uses an ad-hoc signature. It does not yet have Developer ID signing or Apple notarization. macOS may block the first launch; verify the download source and follow [Apple's instructions](https://support.apple.com/en-us/102445), or build from source.
- **iPad / iPhone:** iOS / iPadOS 17 or later. The native Xcode project is included. Choose your own development team and a unique Bundle Identifier before running. Development-signed apps containing personal device information are not distributed publicly. Real-device installation and performance validation remain pending.

The canvas defaults to **Free Move**: click a whole model to pick it up, then move it up, down, left or right in screen space at a fixed camera depth. Models can float above the ground. Click again to place; Esc cancels. Switch to **Surface Snapping** to place models on the ground, tables or other models. The default horizontal grid step is 0.1 m.

| Action | Mac | iPad |
| --- | --- | --- |
| Pick up / place | Left click | Tap |
| Orbit camera | Right-button drag | One-finger drag on empty canvas |
| Pan / camera zoom | Space + left-button drag / wheel when not holding a model | Two-finger drag / pinch |
| Rotate model | Wheel while holding; Shift for fine control; R uses the chosen angle | Rotation button at bottom left |
| Uniform scale | [ / ] or percentage input in the inspector | Scale buttons or percentage input |
| Object menu | Right click | Hold for 0.5 seconds |

- Drag the six-direction navigation gizmo to orbit. Navigation buttons pan, zoom and frame the scene; presets provide bird's-eye, top, front and side views.
- Models are manipulated as root groups, preserving their hierarchy. Undo, clone, delete, mirror, lock, ground placement and material editing are supported. Option / Alt + click clones a model and picks up the copy.
- Import GLB / GLTF / OBJ and other supported formats. Draco, KTX2 and Meshopt resources are bundled locally. Large imports show read progress; synchronous parsing must finish before cancellation can take effect.
- On Mac, ⌘S saves a complete .pinddd project, ⌘⇧S saves a copy, and ⌘O opens a project. Recent projects are available. Failed saves can be retried, and writes are checked before closing. After a rendering-process failure, recovery can restore the last complete snapshot; the latest unsaved changes may be lost.
- Blender layout JSON uses meters, Z-up, world coordinates and XYZ Euler angles in radians. Positions map to (x, -z, y). It includes name / position / rotation / scale / parent / id / matrix. For transforms with shear, use the column-major world matrix. Keep model assets separately; layout JSON does not replace a complete project.
- Asset Station stores personal website bookmarks. External sites require an internet connection. The canvas renders continuously without an idle-frame pause; performance depends on the device and scene complexity.

## Run the web editor locally

Requires Python 3.9+ and a modern browser with WebGL 2. No npm install or frontend build is needed:

```sh
mkdir -p ~/Developer
cd ~/Developer
git clone https://github.com/wangyinhe3939/PinDDD.git
cd PinDDD
python3 serve.py
```

Open http://127.0.0.1:7951/editor/ . Press Ctrl+C to stop; add --port 7952 to change the port. Use HTTP: browsers restrict module loading from file:// URLs. Browser autosaves use IndexedDB; the native app stores recovery files in Application Support.

## Build the native apps

Open PinDDD.xcodeproj and select PinDDD-Mac / My Mac or PinDDD-iOS / your connected device. For iOS, select your own team and unique Bundle Identifier under Signing & Capabilities. Both targets share the Native sources and existing Web directories, without a second copy of the frontend.

The Mac disk image uses [dmgbuild](https://github.com/dmgbuild/dmgbuild) to write its Finder layout without opening Finder. The packaging environment requires Python 3.10+ and full Xcode. These Python dependencies are used only for packaging and are not included in the app:

```sh
python3 -m venv .build_tmp/packaging-env
.build_tmp/packaging-env/bin/python -m pip install -r Packaging/requirements.txt
PATH="$PWD/.build_tmp/packaging-env/bin:$PATH" python3 scripts/package.py
```

Release builds include arm64 and x86_64. Outputs are outputs/PinDDD.app and outputs/拼DDD.dmg. The script stops if delivery files already exist; verify a new candidate before moving the previous delivery to Trash. Use --dmg-only to package an existing Release from .build_tmp/DerivedData.

For iPad, run python3 scripts/build-ipad.py. Add --configuration Debug for a debug build or --device UDID to select a device. Certificate validity, device limits and installation permissions depend on your own Apple developer account.

Scripts require the project to be under ~/Developer. Build and test caches stay in .build_tmp. Each controlled step has a 15-second deadline. A cold build may time out; inspect the retained log before manually continuing. There is no unbounded automatic retry.

## Checks

Headless browser checks require an existing Node.js, Playwright and Google Chrome installation, for development only:

```sh
NODE_PATH=<existing-node-modules-directory> python3 scripts/run.py -- node Tests/editor.cjs
NODE_PATH=<existing-node-modules-directory> python3 scripts/run.py -- node Tests/editor.cjs --resources
NODE_PATH=<existing-node-modules-directory> python3 scripts/run.py -- node Tests/free-move.cjs
```

After mounting a disk image read-only, run `Tests/package.py <mount-point> <source-app-path>` with the packaging environment's Python to check the Finder layout, background reference, links, file hashes and signature.

Tests also cover object interactions, touch, cameras, navigation, transforms, saving, imports and native WKWebView behavior. Automated checks do not guarantee real-device iPad behavior, iCloud file-picker behavior or performance in large, complex scenes.

## Credits and license

Original PinDDD modifications are released under the MIT license, with the three.js authors' copyright retained. The upstream version is r186 (commit 9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8). Only extensions used by the current editor are included, rather than every upstream example.

Third-party components retain their respective licenses. See [Third-party notices](vendor/THIRD_PARTY_NOTICES.txt), the LICENSE files under vendor, and the licenses in the Lucide icon and font directories. This repository does not include personal projects, development certificates or build caches.
