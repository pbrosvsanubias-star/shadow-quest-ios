import UIKit
import WebKit
import AVFoundation
import CoreFoundation

final class QuestViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate {
    private var webView: WKWebView!
    private let store = QuestStore()
    private let run = RunTracker()
    private let camera = CameraPoseController()
    private lazy var online = LeaderboardService(store: store)
    private let cameraView = UIView()
    private var squats: [String: Any] = QuestViewController.emptyCamera(pushup: false)
    private var pushups: [String: Any] = QuestViewController.emptyCamera(pushup: true)
    private var squatDraft = 0
    private var pushupDraft = 0
    private var previewBounds: [String: Any] = [:]
    private var squatBounds: [String: Any] = [:]
    private var pushupBounds: [String: Any] = [:]
    private var loaded = false
    private var operationError: String?
    private var music: AVAudioPlayer?
    private var menuMusicAllowed = false
    private var strengthTouchMode = false
    private var webRoot: URL!
    private var stateEmissionScheduled = false
    private var cameraSaving = Set<CameraPoseController.Exercise>()

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 8/255, green: 11/255, blue: 20/255, alpha: 1)
        // Recover a crash after saving history but before clearing the active run.
        if store.workouts.contains(where: { $0["id"] as? String == run.sessionID }) {
            do { try run.discard() } catch { operationError = error.localizedDescription }
        }
        guard let root = Bundle.main.url(forResource: "web", withExtension: nil),
              let script = try? String(contentsOf: root.appendingPathComponent("ios-bridge.js"), encoding: .utf8) else {
            showStartupError("Die Oberfläche fehlt im App-Paket.")
            return
        }
        webRoot = root
        let controller = WKUserContentController()
        controller.add(self, name: "hunter")
        let initial = jsonString(snapshot()) ?? "{}"
        controller.addUserScript(WKUserScript(source: "window.__shadowQuestInitialState = \(initial);\n" + script,
                                             injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let configuration = WKWebViewConfiguration()
        configuration.userContentController = controller
        configuration.allowsInlineMediaPlayback = true
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = view.backgroundColor
        webView.scrollView.backgroundColor = view.backgroundColor
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
        cameraView.backgroundColor = .black
        cameraView.isUserInteractionEnabled = false
        cameraView.clipsToBounds = true
        cameraView.layer.cornerRadius = 18
        cameraView.isHidden = true
        view.addSubview(cameraView)
        camera.attachPreview(to: cameraView)
        camera.onUpdate = { [weak self] state, draft in
            guard let self = self else { return }
            if state["exercise"] as? String == "pushups" {
                self.pushups = state; self.pushupDraft = draft
            } else {
                self.squats = state; self.squatDraft = draft
            }
            self.layoutCamera()
            self.updateIdleTimer()
            self.updateMusic()
            self.emitState()
        }
        run.onChange = { [weak self] in self?.updateIdleTimer(); self?.updateMusic(); self?.emitState() }
        store.onChange = { [weak self] in self?.emitState() }
        online.onChange = { [weak self] in self?.emitState() }
        NotificationCenter.default.addObserver(self, selector: #selector(willResign), name: UIApplication.willResignActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(didBecomeActive), name: UIApplication.didBecomeActiveNotification, object: nil)
        if let url = Bundle.main.url(forResource: "menu", withExtension: "mp3", subdirectory: "web") {
            music = try? AVAudioPlayer(contentsOf: url)
            music?.numberOfLoops = -1
            music?.volume = 0.3
        }
        webView.loadFileURL(root.appendingPathComponent("index.html"), allowingReadAccessTo: root)
    }

    override func viewDidLayoutSubviews() { super.viewDidLayoutSubviews(); layoutCamera() }

    private static func emptyCamera(pushup: Bool) -> [String: Any] {
        ["status": "idle", "phase": "setup", "tracking": false, "bodyDetected": false,
         "camera": "front", "cameraLabel": "Frontkamera", "previewAvailable": false, "previewActive": false,
         "guidance": pushup ? "Stelle das Handy seitlich auf. Schultern, Ellenbogen und Hände sollen sichtbar sein." : "Stelle das Handy seitlich auf. Hüfte, Knie und Füße sollen sichtbar sein."]
    }

    private func snapshot() -> [String: Any] {
        ["run": run.state, "workouts": store.workouts, "gifts": store.gifts,
         "squatDraft": squatDraft, "squats": squats, "pushupCameraDraft": pushupDraft, "pushupCamera": pushups,
         "profile": store.stateProfile(error: online.profileError, busy: online.profileBusy),
         "leaderboard": online.state,
         "error": (operationError ?? store.lastError ?? run.lastError).map { $0 as Any } ?? NSNull()]
    }

    private func jsonString(_ value: Any) -> String? {
        guard JSONSerialization.isValidJSONObject(value), let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func emitState() {
        guard loaded, !stateEmissionScheduled else { return }
        stateEmissionScheduled = true
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.stateEmissionScheduled = false
            guard let json = self.jsonString(self.snapshot()) else { return }
            self.webView.evaluateJavaScript("window.__shadowQuestReceiveState(\(json));", completionHandler: nil)
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              let url = message.frameInfo.request.url, url.isFileURL,
              url.standardizedFileURL.path.hasPrefix(webRoot.standardizedFileURL.path + "/"),
              let body = message.body as? [String: Any], let method = body["method"] as? String,
              let args = body["args"] as? [Any], args.count <= 2 else { return }
        let silent = method.hasPrefix("set") || method == "feedbackRepTouch" || method == "requestUpdate"
        if !silent { operationError = nil }
        if ["saveHunterProfile", "addProfileFriend", "removeProfileFriend"].contains(method) { online.clearProfileError() }
        do {
            switch method {
            case "requestUpdate": break
            case "startRun": run.start()
            case "pauseRun": run.pause()
            case "resumeRun":
                if store.workouts.contains(where: { $0["id"] as? String == run.sessionID }) {
                    // A history write already succeeded; retry only its pending cleanup.
                    try run.discard()
                } else { run.resume() }
            case "discardRun": try run.discard()
            case "finishRun":
                guard run.status != "idle" else { throw BridgeError("Starte zuerst einen Lauf.") }
                run.pause() // Freeze elapsed time and route before the idempotent history write.
                try store.saveRun(distanceMeters: run.distanceMeters, elapsedSeconds: run.elapsedSeconds, points: run.points, id: run.sessionID)
                try run.discard()
                online.syncTrainingIfEnabled()
            case "savePushups":
                try store.saveReps(type: "pushups", reps: try integer(args, 0))
                online.syncTrainingIfEnabled()
            case "saveCameraPushups":
                saveCameraDraft(.pushups)
            case "saveSquats":
                saveCameraDraft(.squats)
            case "claimGift":
                let result = store.claimGift(target: try integer(args, 0), requestID: try text(args, 1))
                if let json = jsonString(result) { webView.evaluateJavaScript("window.onNativeGiftResult?.(\(json));", completionHandler: nil) }
            case "startSquats": previewBounds = squatBounds; camera.start(.squats)
            case "startPushupCamera": previewBounds = pushupBounds; camera.start(.pushups)
            case "pauseSquats": if camera.activeExercise == .squats { camera.pause() }
            case "pausePushupCamera": if camera.activeExercise == .pushups { camera.pause() }
            case "switchSquatCamera": if camera.activeExercise == .squats { camera.switchCamera() }
            case "switchPushupCamera": if camera.activeExercise == .pushups { camera.switchCamera() }
            case "resetSquatCalibration": if camera.activeExercise == .squats { camera.recalibrate() }
            case "resetPushupCalibration": if camera.activeExercise == .pushups { camera.recalibrate() }
            case "correctSquat": camera.correctCount(for: .squats); squatDraft = max(0, squatDraft - 1)
            case "correctCameraPushup": camera.correctCount(for: .pushups); pushupDraft = max(0, pushupDraft - 1)
            case "discardSquats": camera.resetCount(for: .squats); squatDraft = 0
            case "discardCameraPushups": camera.resetCount(for: .pushups); pushupDraft = 0
            case "setSquatScreenActive":
                if !(try boolean(args, 0)), camera.activeExercise == .squats { camera.pause() }
            case "setPushupCameraScreenActive":
                if !(try boolean(args, 0)), camera.activeExercise == .pushups { camera.pause() }
            case "setSquatPreviewBounds": try setPreview(args, pushup: false)
            case "setPushupPreviewBounds": try setPreview(args, pushup: true)
            case "openCameraSettings", "openLocationSettings":
                if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            case "feedbackRepTouch": UIImpactFeedbackGenerator(style: .light).impactOccurred()
            case "setStrengthTouchMode":
                strengthTouchMode = try boolean(args, 0)
                updateIdleTimer()
            case "setMenuMusicAllowed": menuMusicAllowed = try boolean(args, 0); updateMusic()
            case "saveHunterProfile":
                try store.saveProfile(nickname: try text(args, 0), bio: try text(args, 1))
                online.syncProfileIfEnabled()
            case "activateLeaderboard": online.activate(nickname: try text(args, 0))
            case "refreshLeaderboard": online.refresh(period: try text(args, 0))
            case "disconnectLeaderboard": online.disconnect()
            case "refreshProfileFriends": online.refreshFriends()
            case "addProfileFriend":
                let uid = try text(args, 0)
                guard let entry = online.entries.first(where: { $0["uid"] as? String == uid }), uid != online.ownUID else { throw BridgeError("Wähle einen Hunter aus der Rangliste.") }
                try store.addFriend(entry)
            case "removeProfileFriend": try store.removeFriend(uid: try text(args, 0))
            default: return
            }
        } catch {
            operationError = error.localizedDescription
            if ["saveHunterProfile", "addProfileFriend", "removeProfileFriend", "refreshProfileFriends"].contains(method) {
                store.acknowledgeProfileOperation(error: error.localizedDescription)
            }
        }
        emitState()
    }

    private func integer(_ args: [Any], _ index: Int) throws -> Int {
        guard args.indices.contains(index), let value = args[index] as? NSNumber,
              CFGetTypeID(value) != CFBooleanGetTypeID(), value.doubleValue.isFinite,
              value.doubleValue == Double(value.intValue) else { throw BridgeError("Ungültige Anzahl.") }
        return value.intValue
    }

    private func saveCameraDraft(_ exercise: CameraPoseController.Exercise) {
        guard cameraSaving.insert(exercise).inserted else { return }
        camera.freezeDraft(for: exercise) { [weak self] count in
            guard let self = self else { return }
            defer { self.cameraSaving.remove(exercise); self.emitState() }
            do {
                try self.store.saveReps(type: exercise.rawValue, reps: count)
                self.camera.resetCount(for: exercise)
                if exercise == .squats { self.squatDraft = 0 } else { self.pushupDraft = 0 }
                self.online.syncTrainingIfEnabled()
            } catch { self.operationError = error.localizedDescription }
        }
    }
    private func text(_ args: [Any], _ index: Int) throws -> String {
        guard args.indices.contains(index), let value = args[index] as? String, value.utf8.count <= 4096 else { throw BridgeError("Ungültige Eingabe.") }
        return value
    }
    private func boolean(_ args: [Any], _ index: Int) throws -> Bool {
        guard args.indices.contains(index), let value = args[index] as? NSNumber, CFGetTypeID(value) == CFBooleanGetTypeID() else { throw BridgeError("Ungültige Einstellung.") }
        return value.boolValue
    }

    private func setPreview(_ args: [Any], pushup: Bool) throws {
        let data = Data(try text(args, 0).utf8)
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        if pushup { pushupBounds = value } else { squatBounds = value }
        if camera.activeExercise == (pushup ? .pushups : .squats) {
            previewBounds = value
            layoutCamera()
        }
    }

    private func layoutCamera() {
        guard webView != nil else { return }
        let state = camera.activeExercise == .pushups ? pushups : squats
        guard previewBounds["visible"] as? Bool == true, state["status"] as? String == "tracking",
              let x = previewBounds["x"] as? Double, let y = previewBounds["y"] as? Double,
              let width = previewBounds["width"] as? Double, let height = previewBounds["height"] as? Double,
              let viewportWidth = previewBounds["viewportWidth"] as? Double,
              x.isFinite, y.isFinite, width.isFinite, height.isFinite, viewportWidth.isFinite,
              (1...10000).contains(viewportWidth), width > 0, height > 0, width <= 10000, height <= 10000,
              abs(x) < 100000, abs(y) < 100000 else {
            cameraView.isHidden = true
            camera.setPreviewVisible(false)
            return
        }
        let scale = webView.bounds.width / CGFloat(viewportWidth)
        let viewportRect = CGRect(x: CGFloat(x) * scale, y: CGFloat(y) * scale, width: CGFloat(width) * scale, height: CGFloat(height) * scale)
        let frame = webView.convert(viewportRect, to: view)
        cameraView.frame = frame
        // JS publishes clipping limits to keep camera pixels out of the nav/modal area.
        let clipTop = (previewBounds["clipTop"] as? Double ?? 0) * Double(scale)
        let clipBottom = (previewBounds["clipBottom"] as? Double ?? Double(webView.bounds.height)) * Double(scale)
        guard clipTop.isFinite, clipBottom.isFinite else { cameraView.isHidden = true; camera.setPreviewVisible(false); return }
        let visible = frame.intersection(webView.convert(CGRect(x: 0, y: CGFloat(clipTop), width: webView.bounds.width, height: CGFloat(max(0, clipBottom - clipTop))), to: view))
        guard !visible.isNull, !visible.isEmpty else { cameraView.isHidden = true; camera.setPreviewVisible(false); return }
        let mask = CAShapeLayer()
        mask.path = UIBezierPath(rect: cameraView.convert(visible, from: view)).cgPath
        cameraView.layer.mask = mask
        camera.setPreviewFrame(cameraView.bounds)
        cameraView.isHidden = visible.isEmpty
        camera.setPreviewVisible(!visible.isEmpty)
    }

    private func updateIdleTimer() {
        let capturing = [squats, pushups].contains { ["starting", "tracking"].contains($0["status"] as? String ?? "") }
        UIApplication.shared.isIdleTimerDisabled = strengthTouchMode || run.status == "running" || capturing
    }
    private func updateMusic() {
        if menuMusicAllowed, run.status == "idle", UIApplication.shared.applicationState == .active,
           squats["status"] as? String != "tracking", pushups["status"] as? String != "tracking" {
            try? AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default, options: [.mixWithOthers])
            music?.play()
        } else { music?.pause() }
    }
    @objc private func willResign() { music?.pause() }
    @objc private func didBecomeActive() { emitState(); updateMusic(); updateIdleTimer() }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { loaded = true; emitState() }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { showStartupError("Shadow Quest konnte nicht geladen werden.") }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.isFileURL && url.standardizedFileURL.path.hasPrefix(webRoot.standardizedFileURL.path + "/") { decisionHandler(.allow) }
        else { decisionHandler(.cancel) }
    }
    private func showStartupError(_ message: String) {
        let label = UILabel(frame: view.bounds.insetBy(dx: 28, dy: 100))
        label.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        label.text = message; label.textColor = .white; label.numberOfLines = 0; label.textAlignment = .center
        view.addSubview(label)
    }
    deinit {
        NotificationCenter.default.removeObserver(self)
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "hunter")
    }
}

private struct BridgeError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}
