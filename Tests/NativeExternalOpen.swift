import AppKit
import WebKit

// Run with scripts/run.py; fixtures and recovery storage stay inside .build_tmp.
@main struct NativeExternalOpen {
    @MainActor static func main() {
        let app = NSApplication.shared; app.setActivationPolicy(.prohibited)
        guard CommandLine.arguments.count == 3 else { exit(2) }
        let root = URL(fileURLWithPath: CommandLine.arguments[1])
        let directory = URL(fileURLWithPath: CommandLine.arguments[2])
        let store = ProjectStore(directory: directory.appendingPathComponent("Recovery"))
        let model = WebController(store: store, keepsRecentProjects: false)
        let delegate = AppDelegate()
        func check(_ ok: Bool, _ text: String) throws {
            if !ok { throw NSError(domain: "ExternalOpen", code: 1, userInfo: [NSLocalizedDescriptionKey: text]) }
        }
        func appendWord(_ word: UInt32, to data: inout Data) {
            var value = word.littleEndian; withUnsafeBytes(of: &value) { data.append(contentsOf: $0) }
        }
        Task {
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                var binary = Data()
                for value: Float in [-1, 0, -1, 1, 0, -1, 0, 2, 1] { appendWord(value.bitPattern, to: &binary) }
                var json: [String: Any] = ["asset": ["version": "2.0"], "scene": 0, "scenes": [["nodes": [0]]],
                    "nodes": [["mesh": 0, "translation": [50, 20, -30]]], "meshes": [["primitives": [["attributes": ["POSITION": 0]]]]],
                    "buffers": [["byteLength": binary.count]], "bufferViews": [["buffer": 0, "byteLength": binary.count]],
                    "accessors": [["bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3", "min": [-1, 0, -1], "max": [1, 2, 1]]]]
                var text = try JSONSerialization.data(withJSONObject: json)
                while text.count % 4 != 0 { text.append(32) }
                var glb = Data()
                for value in [UInt32(0x46546c67), 2, UInt32(28 + text.count + binary.count), UInt32(text.count), 0x4e4f534a] { appendWord(value, to: &glb) }
                glb.append(text); appendWord(UInt32(binary.count), to: &glb); appendWord(0x004e4942, to: &glb); glb.append(binary)
                let first = directory.appendingPathComponent("冷启动 '中文'\n模型.GLB")
                let second = directory.appendingPathComponent("热运行.glb")
                try glb.write(to: first); try glb.write(to: second)
                // Both AppKit entry points arrive before the controller or page exists.
                delegate.application(app, openFiles: [first.path])
                delegate.application(app, open: [second])
                delegate.model = model
                let web = model.makeWebView(root: root, dataStore: .nonPersistent())
                web.frame = NSRect(x: 0, y: 0, width: 1280, height: 820)
                for _ in 0..<240 {
                    if !web.isLoading, (try? await web.evaluateJavaScript("window.editor?.scene.children.length === 2 && !editor.loader.busy")) as? Bool == true { break }
                    try await Task.sleep(nanoseconds: 25_000_000)
                }
                try check(model.error == nil, model.error ?? "cold native import")
                let cold = try await model.javascript("return editor.scene.children.map(o=>o.name);") as? [String]
                try check(cold == [first.lastPathComponent, second.lastPathComponent], "cold batches must preserve order and filenames")
                let focused = try await model.javascript("""
                    editor.controls.update(0.5); editor.camera.updateMatrixWorld(true);
                    const object=editor.selected, box=new THREE.Box3().setFromObject(object);
                    const center=box.getCenter(new THREE.Vector3());
                    if(center.distanceTo(editor.controls.center)>1e-6) return false;
                    for(const x of [box.min.x,box.max.x]) for(const y of [box.min.y,box.max.y]) for(const z of [box.min.z,box.max.z]) {
                        const p=new THREE.Vector3(x,y,z).project(editor.camera);
                        if(Math.abs(p.x)>1 || Math.abs(p.y)>1 || Math.abs(p.z)>1) return false;
                    }
                    return !document.querySelector('.Dialog');
                    """) as? Bool
                try check(focused == true, "automatic full-bounds focus without an import dialog")
                _ = try await model.javascript("window.importAlerts=[]; window.alert=message=>importAlerts.push(message);")
                // External resources use local bytes, including percent-encoded Unicode paths.
                let buffer = directory.appendingPathComponent("几何 数据.bin")
                try binary.write(to: buffer)
                json["buffers"] = [["byteLength": binary.count, "uri": "几何%20数据.bin"]]
                let gltf = directory.appendingPathComponent("本地依赖.gltf")
                try JSONSerialization.data(withJSONObject: json).write(to: gltf)
                model.busy = true
                var busyResult: Bool?
                model.openExternalFiles([gltf, second]) { busyResult = $0 }
                try await Task.sleep(nanoseconds: 50_000_000)
                try check(busyResult == nil, "busy native operation queues file-open requests")
                model.busy = false
                for _ in 0..<160 { if busyResult != nil { break }; try await Task.sleep(nanoseconds: 25_000_000) }
                let importAlerts = try await model.javascript("return importAlerts;")
                try check(busyResult == true, model.error ?? String(describing: importAlerts))
                try check(try await model.javascript("return editor.scene.children.length;") as? Int == 4, "hot imports append to the current scene")
                // Bad input must not discard the next request or existing models.
                let bad = directory.appendingPathComponent("损坏.glb")
                try Data("broken".utf8).write(to: bad)
                let failure = await withCheckedContinuation { continuation in
                    model.openExternalFiles([bad, second]) { continuation.resume(returning: $0) }
                }
                try check(!failure && model.error != nil, "corrupt batch reports failure")
                try check(try await model.javascript("return editor.scene.children.length;") as? Int == 5, "next model still imports after a failed file")
                model.error = nil
                let obj = directory.appendingPathComponent("原有导入.obj")
                try Data("o Native\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n".utf8).write(to: obj)
                let ordinary = model.importFiles([obj])!
                var queuedResult: Bool?
                model.openExternalFiles([second]) { queuedResult = $0 }
                try check(await ordinary.value, "existing custom-scheme import remains working")
                for _ in 0..<160 { if queuedResult != nil { break }; try await Task.sleep(nanoseconds: 25_000_000) }
                try check(queuedResult == true, "file-open survives an active ordinary import")
                try check(try await model.javascript("return editor.scene.children.length;") as? Int == 7, "all imported models retained")
                try check(await model.prepareToClose(), "native autosave flush succeeds")
                let saved = try await store.read()
                try check(saved?.contains("本地依赖.gltf") == true, "imported scene persisted via original recovery store")
                let project = directory.appendingPathComponent("场景.pinddd")
                try Data(saved!.utf8).write(to: project)
                let projectOK = await withCheckedContinuation { continuation in model.openExternalFiles([project]) { continuation.resume(returning: $0) } }
                try check(projectOK && model.documentURL == project, "existing project routing still works")
                // No remote fetches or escaping the model folder from a glTF URI.
                for uri in ["https://example.invalid/model.bin", "../outside.bin", "file:///etc/hosts"] {
                    json["buffers"] = [["byteLength": 36, "uri": uri]]
                    try JSONSerialization.data(withJSONObject: json).write(to: gltf)
                    var rejected = false
                    do { _ = try await store.readExternalModel(gltf) } catch { rejected = true }
                    try check(rejected, "unavailable or out-of-folder resource must be rejected")
                }
                print("PASS: native cold/hot AppKit entry points, ordered batches, GLTF sibling resources, Base64 Unicode filenames, full-bounds focus, busy/import queues, corrupt-file recovery, existing import/project/autosave paths")
                fflush(stdout); exit(0)
            } catch { print("FAIL:", error.localizedDescription); fflush(stdout); exit(1) }
        }
        app.run()
    }
}
