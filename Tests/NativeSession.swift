import AppKit
import WebKit

@main struct NativeSession {
    @MainActor static func main() {
        let app = NSApplication.shared; app.setActivationPolicy(.prohibited)
        guard CommandLine.arguments.count == 4 else { exit(2) }
        let root = URL(fileURLWithPath: CommandLine.arguments[1]), directory = URL(fileURLWithPath: CommandLine.arguments[2]), phase = CommandLine.arguments[3]
        let store = ProjectStore(directory: directory), model = WebController(store: ProjectStore(directory: directory), keepsRecentProjects: false)
        let web = model.makeWebView(root: root, dataStore: .nonPersistent()); web.frame = NSRect(x: 0, y: 0, width: 1194, height: 834)
        Task {
            do {
                for _ in 0..<160 {
                    if !web.isLoading, (try? await web.evaluateJavaScript("!!window.editor?.session && !editor.session.loading && !window.oldPageMarker")) as? Bool == true { break }
                    try await Task.sleep(nanoseconds: 25_000_000)
                }
                func check(_ ok: Bool, _ text: String) throws { if !ok { throw NSError(domain: "NativeSession", code: 1, userInfo: [NSLocalizedDescriptionKey: text]) } }
                if phase == "write" {
                    _ = try await model.javascript("editor.clear();const box=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());box.name='跨进程恢复';box.position.set(2,1,3);editor.addObject(box);")
                    let closed = await model.prepareToClose(); try check(closed, "close must await successful native save")
                    let text = try await store.read(); try check(text?.contains("跨进程恢复") == true, "recovery file written")
                    let file = directory.appendingPathComponent("交付验收.pinddd")
                    try await store.writeFile(Data(text!.utf8), to: file)
                    await model.openProject(file); try check(model.documentURL == file, "native project open")
                    _ = try await model.javascript("editor.scene.children[0].position.x=7;editor.signals.objectChanged.dispatch(editor.scene.children[0]);")
                    await model.saveProject(); try check(model.error == nil, "native save to current project")
                    let saved = try await store.readFile(file); try check(String(data: saved, encoding: .utf8)?.contains("跨进程恢复") == true, "project file saved")
                    try check(await model.prepareToClose(), "final close flush")
                } else {
                    let x = try await model.javascript("return editor.scene.children[0]?.position.x;") as? Double
                    try check(x == 7, "fresh process restores native snapshot without browser storage")
                    _ = try await model.javascript("window.oldPageMarker=true;")
                    model.webViewWebContentProcessDidTerminate(web); try check(model.needsRecovery, "crash offers recovery")
                    model.recover()
                    for _ in 0..<160 {
                        if !web.isLoading, (try? await web.evaluateJavaScript("!!window.editor?.session && !editor.session.loading && !window.oldPageMarker")) as? Bool == true { break }
                        try await Task.sleep(nanoseconds: 25_000_000)
                    }
                    let restored = try await model.javascript("return editor.scene.children[0]?.position.x;") as? Double
                    try check(restored == 7, "recovery button reloads committed scene")
                    _ = try await model.javascript("editor.storage.set=async()=>{throw new Error('注入写入失败')};editor.scene.children[0].position.y=4;editor.signals.objectChanged.dispatch(editor.scene.children[0]);")
                    try check(await model.prepareToClose() == false, "failure must keep native close blocked")
                    let intact = try await store.read(); try check(intact?.contains("跨进程恢复") == true, "last complete recovery retained")
                }
                print("PASS: native \(phase), atomic recovery, project file IO, shutdown guard and recovery UI flow"); fflush(stdout); exit(0)
            } catch { print("FAIL:", error.localizedDescription); fflush(stdout); exit(1) }
        }
        app.run()
    }
}
