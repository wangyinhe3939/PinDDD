import SwiftUI
import UniformTypeIdentifiers

extension UTType {
    static let pinDDDProject = UTType(exportedAs: "studio.doubleone.pinddd.project", conformingTo: .json)
}
struct ExportFile: FileDocument {
    static var readableContentTypes: [UTType] { [.data, .pinDDDProject] }
    var data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}

#if os(macOS)
@MainActor final class AppDelegate: NSObject, NSApplicationDelegate {
    var pendingURLs: [URL] = []
    var model: WebController? { didSet { if let url = pendingURLs.last { pendingURLs = []; Task { await model?.openProject(url) } } } }
    func application(_ application: NSApplication, open urls: [URL]) {
        guard let model else { pendingURLs = urls; return }
        if let url = urls.last { Task { await model.openProject(url) } }
    }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard let model else { return .terminateNow }
        Task { sender.reply(toApplicationShouldTerminate: await model.prepareToClose()) }
        return .terminateLater
    }
}
#endif

#if !PINDDD_TEST
@main struct PinDDDApp: App {
    @StateObject private var model = WebController()
    #if os(macOS)
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    #endif
    var body: some Scene {
        #if os(macOS)
        Window("拼DDD", id: "editor") {
            EditorView(model: model).onAppear { delegate.model = model }
        }
        .defaultSize(width: 1280, height: 820)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("打开项目…") { model.chooseProject() }.keyboardShortcut("o").disabled(model.busy)
                Menu("最近打开的项目") {
                    if model.recentProjects.isEmpty { Text("暂无最近项目") }
                    ForEach(model.recentProjects, id: \.self) { url in
                        Button(url.lastPathComponent) { Task { await model.openProject(url) } }
                    }
                }
                Button("导入模型…") { model.openingProject = false; model.showImport = true }.keyboardShortcut("i", modifiers: [.command, .shift])
            }
            CommandGroup(replacing: .saveItem) {
                Button("保存项目") { Task { await model.saveProject() } }.keyboardShortcut("s").disabled(model.busy || model.needsRecovery)
                Button("项目另存为…") { Task { await model.saveProject(asNew: true) } }.keyboardShortcut("s", modifiers: [.command, .shift]).disabled(model.busy || model.needsRecovery)
            }
        }
        #else
        WindowGroup { EditorView(model: model).onOpenURL { url in Task { await model.openProject(url) } } }
        #endif
    }
}

#endif

struct EditorView: View {
    @ObservedObject var model: WebController
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        EditorWebView(model: model)
            .preferredColorScheme(.dark)
            .navigationTitle(model.documentName)
            .fileImporter(isPresented: $model.showImport, allowedContentTypes: model.openingProject ? [.pinDDDProject, .json] : [.item], allowsMultipleSelection: !model.openingProject) { result in
                switch result {
                case .success(let urls): model.receiveFiles(urls)
                case .failure(let error): if (error as NSError).code != NSUserCancelledError { model.error = error.localizedDescription }
                }
            }
            .fileExporter(isPresented: $model.showExport, document: model.exportFile,
                          contentTypes: [UTType(filenameExtension: (model.exportName as NSString).pathExtension) ?? .data],
                          defaultFilename: model.exportName, onCompletion: { model.finishExport($0) },
                          onCancellation: { model.finishExport(.failure(CocoaError(.userCancelled))) })
            .confirmationDialog("最近打开的项目", isPresented: $model.showRecent, titleVisibility: .visible) {
                ForEach(model.recentProjects, id: \.self) { url in Button(url.lastPathComponent) { Task { await model.openProject(url) } } }
                Button("取消", role: .cancel) {}
            }
            .overlay(alignment: .bottomLeading) {
                if let text = model.importStatus {
                    HStack(spacing: 10) { ProgressView().controlSize(.small); Text(text).lineLimit(1); Button("取消") { model.cancelImport() } }
                        .font(.caption).padding(12).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8)).padding(16)
                }
            }
            .overlay {
                if model.needsRecovery {
                    VStack(spacing: 14) {
                        Text("视口已停止响应").font(.headline)
                        Text("可以从最近一次完整保存恢复场景。").font(.subheadline)
                        Button("恢复编辑器") { model.recover() }.buttonStyle(.borderedProminent)
                    }.padding(24).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
                }
            }
            .alert("拼DDD", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) {
                Button("好") { model.error = nil }
            } message: { Text(model.error ?? "") }
            .onChange(of: scenePhase) { _, phase in
                if phase == .background, !model.busy, model.importing == nil { Task { _ = await model.prepareToClose() } }
            }
    }
}
