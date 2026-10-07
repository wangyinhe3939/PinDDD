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
