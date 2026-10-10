import AppKit
import WebKit

@MainActor final class NativeSmoke: NSObject, WKScriptMessageHandler {
    var web: WKWebView!
    var exported = false
    func start(_ root: URL) {
        let config = WKWebViewConfiguration()
        let content = LocalContent(root: root)
        content.imports["fixture"] = Data("o Native\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n".utf8)
        config.setURLSchemeHandler(content, forURLScheme: "pinddd")
        config.websiteDataStore = .nonPersistent()
        config.userContentController.add(self, name: "smoke")
        config.userContentController.add(self, name: "pinDDD")
        config.userContentController.addUserScript(WKUserScript(source: """
            window.__phase='document';
            window.addEventListener('error', e => webkit.messageHandlers.smoke.postMessage('FAIL: '+e.message));
            window.addEventListener('unhandledrejection', e => webkit.messageHandlers.smoke.postMessage('FAIL: '+e.reason));
            document.addEventListener('DOMContentLoaded', async () => {
                try {
                    window.__phase='editor';
                    while (!window.editor?.session || editor.session.loading) await new Promise(r=>setTimeout(r,25));
                    const assert=(v,m)=>{if(!v)throw Error(m)};
                    assert(location.protocol==='pinddd:','local scheme');
                    assert(document.querySelector('#quick-import'),'import button');
                    assert(editor.viewportColor.getHexString()==='181a1d','packaged dark background');
                    const axis=document.querySelector('[data-axis="+X"]');
                    assert(getComputedStyle(axis).backgroundColor==='rgb(239, 100, 97)','packaged red axis');
                    assert(axis.textContent==='X' && axis.offsetWidth===18,'classic compact gyro');
                    assert(document.querySelectorAll('#viewHelper > svg line').length===3,'SVG gyro axes');
                    const sceneCamera=editor.camera.clone();sceneCamera.position.set(4,2,0);editor.addObject(sceneCamera);
                    editor.sceneHelpers.updateMatrixWorld(true);
                    const markerBox=new THREE.Box3().setFromObject(editor.helpers[sceneCamera.id]);
                    assert(markerBox.getSize(new THREE.Vector3()).length()<10,'compact native camera marker');
                    editor.focus(sceneCamera);editor.controls.update(.5);
                    assert(editor.camera.position.distanceTo(editor.controls.center)>2,'usable camera framing');
                    editor.removeObject(sceneCamera);

                    const row=document.querySelector('#outliner .option');
                    const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:1000,clientY:120});
                    row.dispatchEvent(event);assert(event.defaultPrevented,'native context menu suppressed');
                    document.querySelector('#scene-context-menu [data-action=delete]').click();
                    assert(editor.scene.userData.editorCameraHidden,'native camera row deletion');editor.undo();
                    assert(!editor.scene.userData.editorCameraHidden,'native camera row undo');
                    window.__phase='fetch import';
                    const bytes=await fetch('pinddd://app/imports/fixture').then(r=>r.arrayBuffer());
                    window.__phase='parse OBJ';
                    assert(await editor.loader.loadFiles([new File([bytes],'native.obj')]),'native OBJ import completed');
                    const model=editor.scene.children[0];editor.select(model);
                    const originalScale=model.scale.clone();
                    const ratio=document.querySelector('[aria-label="缩放比例（相对当前，%）"]');
                    ratio.value='50';ratio.closest('.Row').querySelector('button').click();
                    assert(model.scale.distanceTo(originalScale.multiplyScalar(.5))<1e-9,'native percentage scale');
                    const step=document.querySelector('[aria-label="每次转动角度（度）"]');
                    step.value='7.3';step.dispatchEvent(new Event('change'));
                    Array.from(step.closest('.Row').querySelectorAll('button')).find(b=>b.textContent==='左转').click();
                    assert(Math.abs(model.rotation.y-7.3*Math.PI/180)<1e-9,'native arbitrary yaw');
                    editor.undo();editor.undo();assert(model.scale.x===1,'native transform undo');

                    const movement=document.querySelector('[aria-label="画布移动方式"]');
                    assert(movement.value==='screen','free movement is active without opening the inspector');
                    movement.value='screen';movement.dispatchEvent(new Event('change'));
                    const placement=editor.placement;placement.pointer.set(0,0);placement.grab(model,false,true);
                    const center=new THREE.Box3().setFromObject(model,true).getCenter(new THREE.Vector3());
                    const projected=center.clone().project(editor.viewportCamera);
                    const depth=center.clone().applyMatrix4(editor.viewportCamera.matrixWorldInverse).z;
                    placement.pointer.set(.1,.2);placement.move();
                    const after=new THREE.Box3().setFromObject(model,true).getCenter(new THREE.Vector3());
                    assert(Math.abs(after.clone().project(editor.viewportCamera).y-projected.y-.2)<1e-8,'native screen up');
                    assert(Math.abs(after.applyMatrix4(editor.viewportCamera.matrixWorldInverse).z-depth)<1e-8,'native fixed depth');
                    placement.cancel();placement.setMovementMode('surface');
                    editor.camera.position.set(10,12,10);editor.camera.lookAt(0,0,0);editor.camera.updateMatrixWorld(true);
                    const table=new THREE.Mesh(new THREE.BoxGeometry(20,1,20),new THREE.MeshStandardMaterial());table.position.y=.5;editor.addObject(table);
                    const box=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshStandardMaterial());box.position.y=5;editor.addObject(box);
                    placement.contextAction('ground',box);
                    assert(Math.abs(new THREE.Box3().setFromObject(box,true).min.y-1)<1e-8,'native table support');
                    placement.pointer.set(0,0);placement.grab(box);placement.move();
                    assert(placement.valid&&Math.abs(new THREE.Box3().setFromObject(box,true).min.y-1)<1e-8,'native surface snapping');
                    placement.cancel();editor.removeObject(box);editor.removeObject(table);
                    const station=document.querySelector('#asset-station');
                    assert(station.querySelectorAll('.station-card a').length===4,'asset station presets');
                    station.querySelector('[aria-label="站点名称"]').value='原生回归';
                    station.querySelector('[aria-label="站点链接"]').value='https://example.invalid/models';
                    station.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
                    assert(JSON.parse(localStorage.getItem('pinddd.asset-station')).length===5,'asset bookmark persistence');
                    station.querySelector('.station-card:last-child button').click();
                    assert(station.querySelectorAll('.station-card a').length===4,'asset bookmark removal');


                    window.__phase='render';
                    let frames=0;editor.signals.sceneRendered.add(()=>frames++);
                    // WebKit suspends RAF in an offscreen view; explicitly exercise its real render path.
                    editor.signals.windowResize.dispatch();assert(frames>0,'native render');
                    assert(!document.querySelector('#viewport canvas').getContext('webgl2').isContextLost(),'WebGL context');
                    assert(!performance.getEntriesByType('resource').some(r=>/^https?:/.test(r.name)),'offline resources');
                    window.__phase='export';
                    await editor.utils.save(new Blob(['{"native":true}']),'layout.json');
                    webkit.messageHandlers.smoke.postMessage('PASS: actual offscreen WKWebView, offline ES modules/WebGL, native import bytes, screen-plane free movement, explicit rendering and JSON export bridge');
                } catch(e) { webkit.messageHandlers.smoke.postMessage('FAIL: '+e.message); }
            });
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web = WKWebView(frame: NSRect(x: 0, y: 0, width: 1194, height: 834), configuration: config)
        web.load(URLRequest(url: URL(string: "pinddd://app/editor/index.html")!))
        DispatchQueue.main.asyncAfter(deadline: .now()+10) {
            self.web.evaluateJavaScript("({phase:window.__phase,ready:document.readyState,objects:window.editor?.scene.children.length})") { value, error in
                print("FAIL: native stage timeout", value ?? "no JavaScript response", error?.localizedDescription ?? ""); fflush(stdout); exit(1)
            }
        }
    }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "pinDDD", let body = message.body as? [String: Any],
           body["filename"] as? String == "layout.json", let encoded = body["base64"] as? String,
           let data = Data(base64Encoded: encoded), String(data: data, encoding: .utf8) == "{\"native\":true}" { exported = true; return }
        if let text = message.body as? String {
            print(text); fflush(stdout); exit(text.hasPrefix("PASS:") && exported ? 0 : 1)
        }
    }
}
@main struct Main {
    @MainActor static func main() {
        guard CommandLine.arguments.count==2 else { exit(2) }
        let app=NSApplication.shared;app.setActivationPolicy(.prohibited)
        let smoke=NativeSmoke();smoke.start(URL(fileURLWithPath:CommandLine.arguments[1]))
        app.run()
    }
}
