import AVFoundation
import ImageIO
import UIKit
import Vision

/// On-device body-pose estimation. Images are neither saved nor sent over a network.
/// This is a conservative fitness counter, not a medical or form-assessment system.
final class CameraPoseController: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    enum Exercise: String, CaseIterable, Hashable { case squats, pushups }

    /// Assign and use the controller's public interface on the main thread.
    /// Every callback is delivered on the main thread.
    var onUpdate: (([String: Any], Int) -> Void)?
    private(set) var activeExercise: Exercise = .squats
    let previewLayer: AVCaptureVideoPreviewLayer
    // Main-thread tokens invalidate queued old drafts as soon as reset/correct is requested.
    private var uiDraftRevisions: [Exercise: Int] = [.squats: 0, .pushups: 0]

    private let session: AVCaptureSession
    private let sessionQueue = DispatchQueue(label: "de.shadowquest.camera", qos: .userInitiated)
    private let videoOutput = AVCaptureVideoDataOutput()
    private let poseRequest = VNDetectHumanBodyPoseRequest()
    private var cameraInput: AVCaptureDeviceInput?
    private var position: AVCaptureDevice.Position = .front
    private var exercise: Exercise = .squats
    private var counters: [Exercise: CameraRepCounter] = [
        .squats: CameraRepCounter(configuration: .init(upperAngle: 155, lowerAngle: 105)),
        .pushups: CameraRepCounter(configuration: .init(upperAngle: 150, lowerAngle: 100))
    ]
    // Capture state is confined to sessionQueue; public/UI properties live on main.
    private var wantsRunning = false
    private var previewVisible = false
    private var status = "idle"
    private var guidance = "Übung wählen und die Kamera starten."
    private var bodyDetected = false
    private var generation = 0
    private var lastFrameTime = -Double.infinity
    private var lastEmissionTime = -Double.infinity
    private var consecutiveVisionFailures = 0
    private var poseSide: Int?
    private var captureDraftRevisions: [Exercise: Int] = [.squats: 0, .pushups: 0]
    private var observers: [NSObjectProtocol] = []

    override init() {
        let captureSession = AVCaptureSession()
        session = captureSession
        previewLayer = AVCaptureVideoPreviewLayer(session: captureSession)
        super.init()
        previewLayer.videoGravity = .resizeAspectFill
        previewLayer.isHidden = true
        videoOutput.alwaysDiscardsLateVideoFrames = true
        observers.append(NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
        ) { [weak self] _ in self?.pause() })
        observers.append(NotificationCenter.default.addObserver(
            forName: AVCaptureSession.wasInterruptedNotification, object: session, queue: nil
        ) { [weak self] _ in
            guard let self else { return }
            self.sessionQueue.async {
                self.generation += 1
                self.wantsRunning = false
                self.resetCycle()
                self.status = "paused"
                self.guidance = "Kamera unterbrochen. Tippe auf Start, um fortzufahren."
                if self.session.isRunning { self.session.stopRunning() }
                self.emit()
            }
        })
        observers.append(NotificationCenter.default.addObserver(
            forName: AVCaptureSession.runtimeErrorNotification, object: session, queue: nil
        ) { [weak self] _ in
            guard let self else { return }
            self.sessionQueue.async {
                self.fail("Die Kamera ist nicht verfügbar. Schließe andere Kamera-Apps und starte erneut.")
            }
        })
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        // Do not synchronously wait on the video delegate's queue during teardown.
        let captureSession = session
        sessionQueue.async { if captureSession.isRunning { captureSession.stopRunning() } }
    }

    func attachPreview(to view: UIView) {
        precondition(Thread.isMainThread)
        if previewLayer.superlayer !== view.layer {
            previewLayer.removeFromSuperlayer()
            view.layer.insertSublayer(previewLayer, at: 0)
        }
        setPreviewFrame(view.bounds)
    }

    func setPreviewFrame(_ frame: CGRect) {
        precondition(Thread.isMainThread)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        previewLayer.frame = frame
        if let connection = previewLayer.connection, connection.isVideoOrientationSupported {
            connection.videoOrientation = .portrait
        }
        CATransaction.commit()
    }

    func setPreviewVisible(_ visible: Bool) {
        precondition(Thread.isMainThread)
        previewLayer.isHidden = !visible
        sessionQueue.async {
            guard self.previewVisible != visible else { return }
            self.previewVisible = visible
            self.emit()
        }
    }

    func start(_ selectedExercise: Exercise) {
        precondition(Thread.isMainThread)
        activeExercise = selectedExercise
        sessionQueue.async {
            self.generation += 1
            let requestGeneration = self.generation
            if self.exercise != selectedExercise {
                // Publish the previous exercise's final count and inactive state
                // even when callers switch directly without an earlier pause.
                self.wantsRunning = false
                self.resetCycle()
                self.status = "paused"
                self.guidance = "Pausiert. Deine erkannten Wiederholungen bleiben erhalten."
                self.emit()
            }
            self.exercise = selectedExercise
            self.wantsRunning = true
            self.resetCycle()
            self.status = "starting"
            self.guidance = self.setupGuidance
            self.emit()
            switch AVCaptureDevice.authorizationStatus(for: .video) {
            case .authorized:
                self.startAuthorizedSession()
            case .notDetermined:
                DispatchQueue.main.async {
                    AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                        guard let self else { return }
                        self.sessionQueue.async {
                            guard self.generation == requestGeneration, self.wantsRunning else { return }
                            if granted { self.startAuthorizedSession() }
                            else { self.fail("Kamerazugriff abgelehnt. Erlaube ihn in Einstellungen → Shadow Quest → Kamera.") }
                        }
                    }
                }
            case .denied, .restricted:
                self.fail("Kamerazugriff fehlt. Erlaube ihn in Einstellungen → Shadow Quest → Kamera.")
            @unknown default:
                self.fail("Der Kamerazugriff ist auf diesem Gerät nicht verfügbar.")
            }
        }
    }

    func pause() {
        precondition(Thread.isMainThread)
        sessionQueue.async {
            self.generation += 1
            self.wantsRunning = false
            self.resetCycle()
            if self.session.isRunning { self.session.stopRunning() }
            self.status = "paused"
            self.guidance = "Pausiert. Deine erkannten Wiederholungen bleiben erhalten."
            self.emit()
        }
    }

    func switchCamera() {
        precondition(Thread.isMainThread)
        sessionQueue.async {
            self.generation += 1
            self.resetCycle()
            let previousPosition = self.position
            self.position = previousPosition == .front ? .back : .front
            // Camera selection alone never prompts for access or starts capture.
            guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
                self.emit()
                return
            }
            let wasRunning = self.wantsRunning
            if self.session.isRunning { self.session.stopRunning() }
            do {
                try self.configureSession()
                if wasRunning {
                    self.session.startRunning()
                    self.status = "tracking"
                    self.guidance = self.setupGuidance
                }
                self.emit()
            } catch {
                self.position = previousPosition
                self.fail("Diese Kamera ist nicht verfügbar. Starte die vorherige Kamera erneut.")
            }
        }
    }

    func recalibrate() {
        precondition(Thread.isMainThread)
        sessionQueue.async {
            self.resetCycle()
            self.guidance = self.setupGuidance
            if self.wantsRunning { self.status = self.session.isRunning ? "tracking" : "starting" }
            self.emit()
        }
    }

    /// Corrects the uncommitted camera draft by removing its last repetition.
    func correctCount() {
        correctCount(for: activeExercise)
    }

    func correctCount(for selectedExercise: Exercise) {
        precondition(Thread.isMainThread)
        let revision = (uiDraftRevisions[selectedExercise] ?? 0) + 1
        uiDraftRevisions[selectedExercise] = revision
        sessionQueue.async {
            self.captureDraftRevisions[selectedExercise] = revision
            self.counters[selectedExercise]?.correctCount()
            if self.exercise == selectedExercise {
                self.resetCycle()
                self.guidance = self.setupGuidance
            }
            self.emit()
        }
    }

    /// Root should call this after transferring the draft to the app's saved total.
    func resetCount() {
        resetCount(for: activeExercise)
    }

    func resetCount(for selectedExercise: Exercise) {
        precondition(Thread.isMainThread)
        let revision = (uiDraftRevisions[selectedExercise] ?? 0) + 1
        uiDraftRevisions[selectedExercise] = revision
        sessionQueue.async {
            self.captureDraftRevisions[selectedExercise] = revision
            self.counters[selectedExercise]?.resetCount()
            if self.exercise == selectedExercise {
                self.resetCycle()
                self.guidance = self.setupGuidance
            }
            self.emit()
        }
    }

    /// Freeze capture before saving a draft. The completion runs on main after the
    /// stable camera-state callback, and receives the exact capture-queue count.
    /// Keep this draft on a failed history write; call resetCount(for:) only after
    /// a successful write. Root should guard repeated save requests until complete.
    func freezeDraft(for selectedExercise: Exercise, completion: @escaping (Int) -> Void) {
        precondition(Thread.isMainThread)
        sessionQueue.async {
            self.generation += 1
            self.wantsRunning = false
            self.resetCycle()
            self.counters[selectedExercise]?.recalibrate()
            if self.session.isRunning { self.session.stopRunning() }
            self.status = "paused"
            self.guidance = "Pausiert. Dein Satz ist zum Speichern bereit."
            let count = self.counters[selectedExercise]?.count ?? 0
            self.emit()
            // Same serial sender as emit(): main receives the snapshot first.
            DispatchQueue.main.async { completion(count) }
        }
    }

    private var setupGuidance: String {
        exercise == .squats
            ? "Stelle die Kamera seitlich auf. Hüfte, Knie und Füße müssen sichtbar sein. Beginne aufrecht."
            : "Stelle die Kamera seitlich auf. Arme und ganzer Körper müssen sichtbar sein. Beginne mit gestreckten Armen."
    }

    private func startAuthorizedSession() {
        guard wantsRunning else { return }
        do {
            try configureSession()
            if !session.isRunning { session.startRunning() }
            guard session.isRunning else {
                fail("Die Kamera konnte nicht starten. Versuche es erneut.")
                return
            }
            status = "tracking"
            guidance = setupGuidance
            emit()
        } catch {
            fail("Die Kamera konnte nicht eingerichtet werden. Prüfe, ob sie verfügbar ist.")
        }
    }

    private enum CameraError: Error { case missingDevice, inputUnavailable, outputUnavailable }

    /// Capture-session mutations and start/stop always occur on sessionQueue.
    private func configureSession() throws {
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position)
        else { throw CameraError.missingDevice }
        if cameraInput?.device.uniqueID == device.uniqueID,
           session.outputs.contains(where: { $0 === videoOutput }) { return }
        let nextInput = try AVCaptureDeviceInput(device: device)
        session.beginConfiguration()
        defer { session.commitConfiguration() }
        if session.canSetSessionPreset(.vga640x480) { session.sessionPreset = .vga640x480 }
        let previousInput = cameraInput
        if let previousInput { session.removeInput(previousInput) }
        guard session.canAddInput(nextInput) else {
            if let previousInput, session.canAddInput(previousInput) { session.addInput(previousInput) }
            throw CameraError.inputUnavailable
        }
        session.addInput(nextInput)
        cameraInput = nextInput
        if !session.outputs.contains(where: { $0 === videoOutput }) {
            videoOutput.videoSettings = [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
            ]
            videoOutput.setSampleBufferDelegate(self, queue: sessionQueue)
            guard session.canAddOutput(videoOutput) else {
                session.removeInput(nextInput)
                if let previousInput, session.canAddInput(previousInput) { session.addInput(previousInput) }
                cameraInput = previousInput
                throw CameraError.outputUnavailable
            }
            session.addOutput(videoOutput)
        }
        if let connection = videoOutput.connection(with: .video) {
            // AVFoundation rotates output buffers into portrait; Vision sees upright pixels.
            if connection.isVideoOrientationSupported { connection.videoOrientation = .portrait }
            if connection.isVideoMirroringSupported {
                connection.automaticallyAdjustsVideoMirroring = false
                connection.isVideoMirrored = false
            }
        }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        guard wantsRunning, session.isRunning,
              let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let time = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sampleBuffer))
        guard time.isFinite, time - lastFrameTime >= 0.095 else { return }
        lastFrameTime = time
        do {
            let handler = VNImageRequestHandler(cvPixelBuffer: buffer, orientation: .up, options: [:])
            try handler.perform([poseRequest])
            consecutiveVisionFailures = 0
            let observations = poseRequest.results ?? []
            // Avoid switching between people halfway through a movement.
            guard observations.count == 1, let observation = observations.first else {
                receiveMissingBody(time: time, message: observations.count > 1
                    ? "Bitte nur eine Person im Kamerabild zeigen."
                    : "Kein Körper erkannt. Stelle dich seitlich ins Bild und sorge für gutes Licht.")
                return
            }
            let imageSize = CGSize(width: CGFloat(CVPixelBufferGetWidth(buffer)),
                                   height: CGFloat(CVPixelBufferGetHeight(buffer)))
            guard let angle = try exerciseAngle(observation, imageSize: imageSize) else {
                receiveMissingBody(time: time, message: setupGuidance)
                return
            }
            bodyDetected = true
            let counted = counters[exercise]?.observe(angle: angle, at: time) ?? false
            let counter = counters[exercise]
            // status describes capture; tracking independently describes body lock.
            // Keep the preview visible while the user moves into the camera frame.
            status = "tracking"
            switch counter?.phase ?? .setup {
            case .setup: guidance = exercise == .squats
                    ? "Halte die aufrechte Startposition kurz still."
                    : "Halte die Position mit gestreckten Armen kurz still."
            case .up: guidance = "Startposition erkannt. Führe eine vollständige Wiederholung aus."
            case .down: guidance = "Untere Position erkannt. Kehre vollständig zur Startposition zurück."
            }
            if counted { guidance = "Wiederholung erkannt. Weiter so!" }
            if counted || time - lastEmissionTime >= 0.20 {
                lastEmissionTime = time
                emit()
            }
        } catch {
            consecutiveVisionFailures += 1
            receiveMissingBody(time: time, message: "Die Körpererkennung wartet auf ein klares Kamerabild.")
            if consecutiveVisionFailures >= 12 {
                fail("Die Körpererkennung konnte nicht starten. Pausiere und starte die Kamera erneut.")
            }
        }
    }

    private func receiveMissingBody(time: TimeInterval, message: String) {
        resetCycle(resetFrameTime: false)
        status = "tracking"
        guidance = message
        if time - lastEmissionTime >= 0.20 {
            lastEmissionTime = time
            emit()
        }
    }

    private func exerciseAngle(_ observation: VNHumanBodyPoseObservation,
                               imageSize: CGSize) throws -> Double? {
        let points = try observation.recognizedPoints(.all)
        typealias Joint = VNHumanBodyPoseObservation.JointName
        func point(_ name: Joint) -> CGPoint? {
            guard let joint = points[name], joint.confidence >= 0.40,
                  joint.location.x > 0.015, joint.location.x < 0.985,
                  joint.location.y > 0.015, joint.location.y < 0.985 else { return nil }
            return CGPoint(x: joint.location.x * imageSize.width, y: joint.location.y * imageSize.height)
        }
        let sides: [(Joint, Joint, Joint, Joint, Joint)] = [
            (.leftShoulder, .leftElbow, .leftWrist, .leftHip, .leftKnee),
            (.rightShoulder, .rightElbow, .rightWrist, .rightHip, .rightKnee)
        ]
        var candidates: [(angle: Double, confidence: Float, side: Int)] = []
        for (index, side) in sides.enumerated() {
            let ankleName: Joint = index == 0 ? .leftAnkle : .rightAnkle
            if exercise == .squats {
                guard let shoulder = point(side.0), let hip = point(side.3),
                      let knee = point(side.4), let ankle = point(ankleName),
                      shoulder.y > hip.y,
                      distance(hip, knee) >= imageSize.height * 0.055,
                      distance(knee, ankle) >= imageSize.height * 0.055,
                      let kneeAngle = jointAngle(hip, knee, ankle) else { continue }
                let confidence = [side.0, side.3, side.4, ankleName].compactMap { points[$0]?.confidence }.min() ?? 0
                candidates.append((kneeAngle, confidence, index))
            } else {
                guard let shoulder = point(side.0), let elbow = point(side.1),
                      let wrist = point(side.2), let hip = point(side.3), let ankle = point(ankleName),
                      distance(shoulder, elbow) >= imageSize.height * 0.035,
                      distance(elbow, wrist) >= imageSize.height * 0.035,
                      distance(shoulder, ankle) >= imageSize.height * 0.20,
                      // A roughly horizontal, straight body prevents counting standing arm bends.
                      abs(shoulder.y - ankle.y) <= abs(shoulder.x - ankle.x) * 0.75,
                      let bodyAngle = jointAngle(shoulder, hip, ankle), bodyAngle >= 145,
                      let elbowAngle = jointAngle(shoulder, elbow, wrist) else { continue }
                let confidence = [side.0, side.1, side.2, side.3, ankleName].compactMap { points[$0]?.confidence }.min() ?? 0
                candidates.append((elbowAngle, confidence, index))
            }
        }
        // Keep using one body side until recognition is lost or calibration resets.
        // Alternating left/right arms must never manufacture a repetition cycle.
        if let poseSide { return candidates.first(where: { $0.side == poseSide })?.angle }
        guard let selected = candidates.max(by: { $0.confidence < $1.confidence }) else { return nil }
        poseSide = selected.side
        return selected.angle
    }

    private func jointAngle(_ a: CGPoint, _ vertex: CGPoint, _ b: CGPoint) -> Double? {
        let first = CGPoint(x: a.x - vertex.x, y: a.y - vertex.y)
        let second = CGPoint(x: b.x - vertex.x, y: b.y - vertex.y)
        let denominator = hypot(first.x, first.y) * hypot(second.x, second.y)
        guard denominator > 1 else { return nil }
        let cosine = max(-1, min(1, (first.x * second.x + first.y * second.y) / denominator))
        return Double(acos(cosine) * 180 / .pi)
    }

    private func distance(_ a: CGPoint, _ b: CGPoint) -> CGFloat { hypot(a.x - b.x, a.y - b.y) }

    private func resetCycle(resetFrameTime: Bool = true) {
        counters[exercise]?.recalibrate()
        bodyDetected = false
        poseSide = nil
        if resetFrameTime {
            lastFrameTime = -Double.infinity
            lastEmissionTime = -Double.infinity
            consecutiveVisionFailures = 0
        }
    }

    private func fail(_ message: String) {
        generation += 1
        wantsRunning = false
        resetCycle()
        if session.isRunning { session.stopRunning() }
        status = "error"
        guidance = message
        emit()
    }

    private func emit() {
        let counter = counters[exercise]
        let currentExercise = exercise
        let draftRevision = captureDraftRevisions[currentExercise] ?? 0
        let permission: String
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: permission = "authorized"
        case .notDetermined: permission = "notDetermined"
        case .restricted: permission = "restricted"
        case .denied: permission = "denied"
        @unknown default: permission = "unavailable"
        }
        let count = counter?.count ?? 0
        let state: [String: Any] = [
            "status": status,
            "guidance": guidance,
            "phase": counter?.phase.rawValue ?? "setup",
            "tracking": wantsRunning && counter?.tracking == true,
            "bodyDetected": bodyDetected,
            "camera": position == .front ? "front" : "back",
            "cameraLabel": position == .front ? "Frontkamera" : "Rückkamera",
            "previewAvailable": cameraInput != nil && permission == "authorized",
            "previewActive": previewVisible && session.isRunning,
            "permission": permission,
            "exercise": currentExercise.rawValue,
            "draft": count
        ]
        DispatchQueue.main.async { [weak self] in
            guard let self, self.uiDraftRevisions[currentExercise] == draftRevision else { return }
            // Root stores both exercises separately. Deliver final inactive/pause
            // states too; they must survive a rapid switch to the other exercise.
            self.onUpdate?(state, count)
        }
    }
}
