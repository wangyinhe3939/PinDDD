import SwiftUI
import WebKit
import UniformTypeIdentifiers
#if os(macOS)
import AppKit
#else
import UIKit
#endif

@MainActor
final class WebController: NSObject, ObservableObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply {
    @Published var showImport = false
    @Published var showExport = false
    @Published var exportFile: ExportFile?
    @Published var exportName = "layout.json"
    @Published var error: String?
    @Published var openingProject = false
    @Published var showRecent = false
    @Published var needsRecovery = false
    @Published var busy = false
    @Published var documentName = "未命名项目"
    @Published var recentProjects: [URL] = []
    @Published var importStatus: String?
    var documentURL: URL?
    var web: WKWebView?
    let store: ProjectStore
    let keepsRecentProjects: Bool
    var importing: Task<Void, Never>?
    private var exportCompletion: ((Result<URL, Error>) -> Void)?
    #if os(macOS)
    var closeGuard: WindowCloseGuard?
    #endif

    init(store: ProjectStore = ProjectStore(), keepsRecentProjects: Bool = true) {
        self.store = store; self.keepsRecentProjects = keepsRecentProjects
        super.init()
        if keepsRecentProjects { refreshRecents() }
    }
    var content: LocalContent?

    func makeWebView(root: URL? = nil, dataStore: WKWebsiteDataStore? = nil) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.preferences.isElementFullscreenEnabled = true
        let root = root ?? Bundle.main.resourceURL!
        configuration.websiteDataStore = dataStore ?? .default()
        let content = LocalContent(root: root)
        self.content = content
        configuration.setURLSchemeHandler(content, forURLScheme: "pinddd")
        configuration.userContentController.add(self, name: "pinDDD")
        configuration.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "pinDDDStore")
        #if os(macOS)
        let view = EditorWKWebView(frame: .zero, configuration: configuration)
        view.controller = self
        #else
        let view = WKWebView(frame: .zero, configuration: configuration)
        #endif
        view.navigationDelegate = self; view.uiDelegate = self; web = view
        view.underPageBackgroundColor = .init(red: 24/255, green: 26/255, blue: 29/255, alpha: 1)
        #if os(iOS)
        view.isOpaque = false; view.scrollView.isScrollEnabled = false; view.scrollView.bounces = false
        #endif
        view.load(URLRequest(url: URL(string: "pinddd://app/editor/index.html")!))
        return view
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.scheme == "pinddd",
              message.frameInfo.request.url?.host == "app", let body = message.body as? [String: Any] else { return }
        if body["type"] as? String == "import" { openingProject = false; showImport = true }
        if body["type"] as? String == "openProject" { chooseProject() }
        if body["type"] as? String == "saveProject" { Task { await saveProject() } }
        if body["type"] as? String == "saveProjectAs" { Task { await saveProject(asNew: true) } }
        if body["type"] as? String == "newProject" { documentURL = nil; documentName = "未命名项目" }
        if body["type"] as? String == "recentProjects" { showRecent = true }
        if body["type"] as? String == "export" {
            guard let encoded = body["base64"] as? String, let data = Data(base64Encoded: encoded),
                  let name = body["filename"] as? String else { error = "导出数据无效。"; return }
            exportName = URL(fileURLWithPath: name).lastPathComponent
            exportFile = ExportFile(data: data); showExport = true
        }
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.scheme == "pinddd",
              message.frameInfo.request.url?.host == "app", let body = message.body as? [String: Any] else { replyHandler(nil, "无效的保存来源"); return }
        Task {
            do {
                switch body["operation"] as? String {
                case "read": replyHandler(try await store.read(previous: body["previous"] as? Bool ?? false), nil)
                case "write":
                    guard let text = body["text"] as? String else { throw CocoaError(.fileWriteInapplicableStringEncoding) }
                    try await store.write(text); replyHandler(true, nil)
                default: replyHandler(nil, "未知保存操作")
                }
            } catch { replyHandler(nil, error.localizedDescription) }
        }
    }

    func javascript(_ code: String, arguments: [String: Any] = [:]) async throws -> Any? {
        guard let web, !needsRecovery else { throw CocoaError(.coderInvalidValue) }
        return try await withCheckedThrowingContinuation { continuation in
            var finished = false
            web.callAsyncJavaScript(code, arguments: arguments, in: nil, in: .page) { result in
                guard !finished else { return }; finished = true
                continuation.resume(with: result.map { Optional($0) })
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 10) {
                guard !finished else { return }; finished = true
                continuation.resume(throwing: NSError(domain: "PinDDD", code: 1, userInfo: [NSLocalizedDescriptionKey: "编辑器响应超时，请等待当前操作完成后重试。暂未关闭窗口。 "]))
            }
        }
    }
    func chooseProject() { guard !busy, importing == nil else { return }; openingProject = true; showImport = true }
    func receiveFiles(_ urls: [URL]) {
        if openingProject { if let url = urls.first { Task { await openProject(url) } } }
        else { importFiles(urls) }
    }
    func openProject(_ url: URL) async {
        guard !busy, importing == nil else { error = "请先完成当前文件操作。"; return }
        busy = true; defer { busy = false }
        do {
            let data = try await store.readFile(url)
            guard let text = String(data: data, encoding: .utf8) else { throw CocoaError(.fileReadInapplicableStringEncoding) }
            documentURL = nil
            _ = try await javascript("while (!editor.session) await new Promise(r=>setTimeout(r,25)); await editor.session.load(JSON.parse(text));", arguments: ["text": text])
            documentURL = url; documentName = url.lastPathComponent; remember(url)
        } catch { self.error = "打开项目失败：" + error.localizedDescription }
    }
    func saveProject(asNew: Bool = false) async {
        guard !busy, importing == nil else { error = "请先完成当前文件操作。"; return }
        busy = true; defer { busy = false }
        do {
            guard let text = try await javascript("return await editor.session.snapshot();") as? String else { throw CocoaError(.fileWriteUnknown) }
            let data = Data(text.utf8)
            var destination = asNew ? nil : documentURL
            #if os(macOS)
            if destination == nil {
                let panel = NSSavePanel(); panel.allowedContentTypes = [.pinDDDProject]; panel.nameFieldStringValue = documentURL?.lastPathComponent ?? "我的场景.pinddd"
                guard let window = web?.window else { throw CocoaError(.fileWriteUnknown) }
                let response = await withCheckedContinuation { continuation in panel.beginSheetModal(for: window) { continuation.resume(returning: $0) } }
                guard response == .OK else { return }; destination = panel.url
            }
            guard let destination else { return }
            try await store.writeFile(data, to: destination)
            #else
            if let url = destination { try await store.writeFile(data, to: url) }
            else {
                exportName = "我的场景.pinddd"; exportFile = ExportFile(data: data)
                destination = try await withCheckedThrowingContinuation { continuation in
                    exportCompletion = { continuation.resume(with: $0) }; showExport = true
                }
            }
            guard let destination else { return }
            #endif
            documentURL = destination; documentName = destination.lastPathComponent; remember(destination)
            _ = try await javascript("editor.session.markFileSaved();")
        } catch { if (error as NSError).code != NSUserCancelledError { self.error = "保存项目失败：" + error.localizedDescription } }
    }
    func finishExport(_ result: Result<URL, Error>) {
        if let completion = exportCompletion { exportCompletion = nil; completion(result) }
        else if case .failure(let issue) = result, (issue as NSError).code != NSUserCancelledError { error = issue.localizedDescription }
    }
    private func remember(_ url: URL) {
        guard keepsRecentProjects else { return }
        #if os(macOS)
        let options: URL.BookmarkCreationOptions = .withSecurityScope
        NSDocumentController.shared.noteNewRecentDocumentURL(url)
        #else
        let options: URL.BookmarkCreationOptions = []
        #endif
        guard let data = try? url.bookmarkData(options: options, includingResourceValuesForKeys: nil, relativeTo: nil) else { return }
        var entries = UserDefaults.standard.array(forKey: "recentProjects") as? [Data] ?? []
        entries.removeAll { resolveBookmark($0) == url }; entries.insert(data, at: 0)
        UserDefaults.standard.set(Array(entries.prefix(8)), forKey: "recentProjects"); refreshRecents()
    }
    private func resolveBookmark(_ data: Data) -> URL? {
        var stale = false
        #if os(macOS)
        let options: URL.BookmarkResolutionOptions = [.withSecurityScope, .withoutUI]
        #else
        let options: URL.BookmarkResolutionOptions = [.withoutUI]
        #endif
        return try? URL(resolvingBookmarkData: data, options: options, relativeTo: nil, bookmarkDataIsStale: &stale)
    }
    private func refreshRecents() { recentProjects = (UserDefaults.standard.array(forKey: "recentProjects") as? [Data] ?? []).compactMap(resolveBookmark) }

    func importFiles(_ urls: [URL]) {
        guard let web, let content, importing == nil, !busy else { return }
        importing = Task {
            defer { importing = nil; importStatus = nil }
            for (index, url) in urls.enumerated() {
                if Task.isCancelled { break }
                let id = UUID().uuidString
                defer { content.imports.removeValue(forKey: id) }
                do {
                    importStatus = "读取 \(index + 1)/\(urls.count)：\(url.lastPathComponent)"
                    let data = try await store.readFile(url)
                    if Task.isCancelled { break }
                    content.imports[id] = data
                    importStatus = nil // The web progress bar owns parsing and cancellation from here.
                    let imported = try await web.callAsyncJavaScript("""
                        const response = await fetch('pinddd://app/imports/' + id);
                        if (!response.ok) throw new Error('读取模型失败');
                        return await editor.loader.loadFiles([new File([await response.blob()], name)]);
                        """, arguments: ["id": id, "name": url.lastPathComponent], in: nil, contentWorld: .page)
                    if imported as? Bool == false { break }
                } catch { if !Task.isCancelled { self.error = "导入 \(url.lastPathComponent) 失败：\(error.localizedDescription)" }; break }
            }
        }
    }
    func cancelImport() {
        importing?.cancel()
        web?.evaluateJavaScript("editor.loader.cancelImport?.()")
        importStatus = "正在取消…"
    }
    func prepareToClose() async -> Bool {
        guard !busy, importing == nil else { error = "请先完成或取消当前文件操作。"; return false }
        if needsRecovery || web == nil { return true }
        do { _ = try await javascript("return await editor.session.prepareToClose();"); return true }
        catch { self.error = "尚未安全保存，已保留窗口：" + error.localizedDescription; return false }
    }
    func recover() {
        guard importing == nil else { cancelImport(); return }
        needsRecovery = false; error = nil
        web?.reload()
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        importing?.cancel(); importing = nil; importStatus = nil; busy = false
        needsRecovery = true
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError issue: Error) { error = issue.localizedDescription }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError issue: Error) { error = issue.localizedDescription }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if url.scheme == "pinddd", url.host == "app" { decisionHandler(.allow); return }
        if ["https", "http"].contains(url.scheme ?? ""), action.navigationType == .linkActivated {
            #if os(macOS)
            NSWorkspace.shared.open(url)
            #else
            UIApplication.shared.open(url)
            #endif
        }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, ["https", "http"].contains(url.scheme ?? "") {
            #if os(macOS)
            NSWorkspace.shared.open(url)
            #else
            UIApplication.shared.open(url)
            #endif
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        presentDialog(message, confirm: false) { _ in completionHandler() }
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        presentDialog(message, confirm: true, completion: completionHandler)
    }
    private func presentDialog(_ message: String, confirm: Bool, completion: @escaping (Bool) -> Void) {
        #if os(macOS)
        guard let window = web?.window else { completion(false); return }
        let alert = NSAlert(); alert.messageText = "拼DDD"; alert.informativeText = message
        alert.addButton(withTitle: "确定"); if confirm { alert.addButton(withTitle: "取消") }
        alert.beginSheetModal(for: window) { completion($0 == .alertFirstButtonReturn) }
        #else
        guard var presenter = web?.window?.rootViewController else { completion(false); return }
        while let presented = presenter.presentedViewController { presenter = presented }
        let alert = UIAlertController(title: "拼DDD", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "确定", style: .default) { _ in completion(true) })
        if confirm { alert.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in completion(false) }) }
        presenter.present(alert, animated: true)
        #endif
    }
    #if os(macOS)
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        guard let window = webView.window else { completionHandler(nil); return }
        let panel = NSOpenPanel(); panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.beginSheetModal(for: window) { completionHandler($0 == .OK ? panel.urls : nil) }
    }
    #endif
}

#if os(macOS)
struct EditorWebView: NSViewRepresentable {
    @ObservedObject var model: WebController
    func makeNSView(context: Context) -> WKWebView { model.makeWebView() }
    func updateNSView(_ view: WKWebView, context: Context) {}
    static func dismantleNSView(_ view: WKWebView, coordinator: ()) { (view as? EditorWKWebView)?.controller?.web = nil; view.configuration.userContentController.removeScriptMessageHandler(forName: "pinDDD"); view.configuration.userContentController.removeScriptMessageHandler(forName: "pinDDDStore"); view.stopLoading() }
}
#else
struct EditorWebView: UIViewRepresentable {
    @ObservedObject var model: WebController
    func makeUIView(context: Context) -> WKWebView { model.makeWebView() }
    func updateUIView(_ view: WKWebView, context: Context) {}
    static func dismantleUIView(_ view: WKWebView, coordinator: ()) { view.configuration.userContentController.removeScriptMessageHandler(forName: "pinDDD"); view.configuration.userContentController.removeScriptMessageHandler(forName: "pinDDDStore"); view.stopLoading() }
}
#endif

#if os(macOS)
final class EditorWKWebView: WKWebView {
    weak var controller: WebController?
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        guard let window, let controller, controller.closeGuard == nil else { return }
        let guardDelegate = WindowCloseGuard(model: controller, original: window.delegate)
        controller.closeGuard = guardDelegate; window.delegate = guardDelegate
    }
}
@MainActor final class WindowCloseGuard: NSObject, NSWindowDelegate {
    weak var model: WebController?
    weak var original: NSWindowDelegate?
    private var allowed = false
    private var checking = false
    init(model: WebController, original: NSWindowDelegate?) { self.model = model; self.original = original }
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        if allowed { return original?.windowShouldClose?(sender) ?? true }
        guard !checking else { return false }; checking = true
        Task {
            if await model?.prepareToClose() == true { allowed = true; sender.performClose(nil) }
            checking = false
        }
        return false
    }
    func windowWillClose(_ notification: Notification) { original?.windowWillClose?(notification); model?.closeGuard = nil }
}
#endif
