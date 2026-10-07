import Foundation
import WebKit
import UniformTypeIdentifiers

final class LocalContent: NSObject, WKURLSchemeHandler {
    let root: URL
    var imports: [String: Data] = [:]
    init(root: URL) { self.root = root.resolvingSymlinksInPath() }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        do {
            guard let url = task.request.url, url.scheme == "pinddd", url.host == "app",
                  task.request.httpMethod == "GET" else { throw URLError(.unsupportedURL) }
            let data: Data
            let mime: String
            if url.path.hasPrefix("/imports/") {
                guard let bytes = imports[url.lastPathComponent] else { throw URLError(.fileDoesNotExist) }
                data = bytes; mime = "application/octet-stream"
            } else {
                let file = root.appendingPathComponent(url.path).resolvingSymlinksInPath()
                guard file.path.hasPrefix(root.path + "/") else { throw URLError(.noPermissionsToReadFile) }
                data = try Data(contentsOf: file)
                let types = ["js": "text/javascript", "html": "text/html", "css": "text/css", "json": "application/json", "wasm": "application/wasm"]
                mime = types[file.pathExtension] ?? UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
            }
            let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": mime, "Content-Length": String(data.count), "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache"])!
            task.didReceive(response); task.didReceive(data); task.didFinish()
        } catch { task.didFailWithError(error) }
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
