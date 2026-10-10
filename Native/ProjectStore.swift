import Foundation

// Serial, atomic disk writes keep the last complete snapshot through a process crash.
actor ProjectStore {
    let directory: URL
    private var recoveredPrevious = false
    init(directory: URL? = nil) {
        self.directory = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent(Bundle.main.bundleIdentifier ?? "studio.doubleone.PinDDD.Editor", isDirectory: true)
            .appendingPathComponent("Recovery", isDirectory: true)
    }
    func read(previous: Bool = false) throws -> String? {
        let url = directory.appendingPathComponent(previous ? "previous.pinddd" : "current.pinddd")
        if previous { recoveredPrevious = true }
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        return try String(contentsOf: url, encoding: .utf8)
    }
    func write(_ text: String) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let current = directory.appendingPathComponent("current.pinddd")
        if !recoveredPrevious, FileManager.default.fileExists(atPath: current.path) {
            let old = try Data(contentsOf: current, options: .mappedIfSafe)
            try old.write(to: directory.appendingPathComponent("previous.pinddd"), options: .atomic)
        }
        try Data(text.utf8).write(to: current, options: .atomic)
        recoveredPrevious = false
    }
    func readFile(_ url: URL) throws -> Data {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        var coordinationError: NSError?
        var result: Result<Data, Error>?
        NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinationError) { file in
            result = Result { try Data(contentsOf: file, options: .mappedIfSafe) }
        }
        if let coordinationError { throw coordinationError }
        return try (result ?? .failure(CocoaError(.fileReadUnknown))).get()
    }
    // Encode off the main thread, including referenced sibling buffers/textures.
    func readExternalModel(_ url: URL) throws -> (base64: String, resources: [String: String]) {
        let data = try readFile(url)
        var jsonData = data
        if url.pathExtension.lowercased() == "glb" {
            guard data.count >= 20, Array(data.prefix(4)) == [0x67, 0x6c, 0x54, 0x46] else {
                throw CocoaError(.fileReadCorruptFile)
            }
            let length = (0..<4).reduce(0) { $0 | (Int(data[12 + $1]) << (8 * $1)) }
            guard length <= data.count - 20 else { throw CocoaError(.fileReadCorruptFile) }
            jsonData = data.subdata(in: 20..<(20 + length))
        }
        let json = try JSONSerialization.jsonObject(with: jsonData) as? [String: Any]
        let directory = url.deletingLastPathComponent().resolvingSymlinksInPath().standardizedFileURL
        var resources: [String: String] = [:]
        for key in ["buffers", "images"] {
            for entry in json?[key] as? [[String: Any]] ?? [] {
                guard let uri = entry["uri"] as? String, !uri.lowercased().hasPrefix("data:"), resources[uri] == nil else { continue }
                guard let relativePath = uri.removingPercentEncoding,
                      !relativePath.hasPrefix("/"), !relativePath.contains("\\"),
                      !uri.contains("?"), !uri.contains("#"), URLComponents(string: uri)?.scheme == nil else {
                    throw NSError(domain: "PinDDD", code: 2, userInfo: [NSLocalizedDescriptionKey: "模型依赖必须是本地相对路径：" + uri])
                }
                let file = directory.appendingPathComponent(relativePath).resolvingSymlinksInPath().standardizedFileURL
                guard file.path.hasPrefix(directory.path + "/") else {
                    throw NSError(domain: "PinDDD", code: 2, userInfo: [NSLocalizedDescriptionKey: "请将模型依赖放在模型所在文件夹或其子文件夹：" + uri])
                }
                resources[uri] = try readFile(file).base64EncodedString()
            }
        }
        return (data.base64EncodedString(), resources)
    }
    func writeFile(_ data: Data, to url: URL) throws {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        var coordinationError: NSError?
        var failure: Error?
        NSFileCoordinator().coordinate(writingItemAt: url, options: .forReplacing, error: &coordinationError) { file in
            do { try data.write(to: file, options: .atomic) } catch { failure = error }
        }
        if let failure { throw failure }
        if let coordinationError { throw coordinationError }
    }
}
