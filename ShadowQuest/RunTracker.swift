import Foundation
import CoreLocation

/// Owns only the active run. Completed runs belong to QuestStore.
final class RunTracker: NSObject, CLLocationManagerDelegate {
    var onChange: (() -> Void)?
    private let manager = CLLocationManager()
    private(set) var status = "idle"
    private(set) var distanceMeters: Double = 0
    private(set) var points: [[String: Any]] = []
    private(set) var gpsStatus = "GPS bereit"
    private(set) var lastError: String?
    private(set) var sessionID = UUID().uuidString
    private var accuracy: Double?
    private var accumulatedSeconds: Double = 0
    private var startedUptime: TimeInterval?
    private var previous: CLLocation?
    private var timer: Timer?
    private var startRequested = false
    private var recoveryRequired = false
    private var lastPersist = Date.distantPast
    private let fileURL: URL

    override init() {
        let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("ShadowQuest", isDirectory: true)
        fileURL = directory.appendingPathComponent("active-run.json")
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 3
        manager.activityType = .fitness
        manager.pausesLocationUpdatesAutomatically = false
        manager.allowsBackgroundLocationUpdates = true
        manager.showsBackgroundLocationIndicator = true
        restore()
    }

    var elapsedSeconds: Int {
        let total = accumulatedSeconds + (startedUptime.map { max(0, ProcessInfo.processInfo.systemUptime - $0) } ?? 0)
        return total.isFinite ? Int(max(0, min(Double(31 * 24 * 60 * 60), total))) : 0
    }

    var state: [String: Any] {
        ["sessionID": sessionID, "status": status, "distanceMeters": distanceMeters, "elapsedSeconds": elapsedSeconds,
         "gpsStatus": gpsStatus, "accuracyMeters": accuracy.map { $0 as Any } ?? NSNull(), "points": points]
    }

    func start() {
        guard status == "idle" else { return }
        startRequested = true
        lastError = nil
        authorizeOrStart()
    }

    func resume() {
        guard status == "paused" else { return }
        guard !recoveryRequired else { fail("Die beschädigte Aufzeichnung muss zuerst ausdrücklich verworfen werden."); return }
        startRequested = true
        lastError = nil
        authorizeOrStart()
    }

    private func authorizeOrStart() {
        guard CLLocationManager.locationServicesEnabled() else {
            fail("Standortdienste sind ausgeschaltet. Aktiviere sie in den iPhone-Einstellungen.")
            return
        }
        switch manager.authorizationStatus {
        case .notDetermined:
            gpsStatus = "Standort erlauben, um den Lauf zu starten"
            manager.requestWhenInUseAuthorization()
            onChange?()
        case .authorizedAlways, .authorizedWhenInUse:
            beginTracking()
        case .denied, .restricted:
            fail("Standortzugriff fehlt. Erlaube ihn in den Einstellungen für Shadow Quest.")
        @unknown default:
            fail("Standortzugriff konnte nicht geprüft werden.")
        }
    }

    private func beginTracking() {
        guard startRequested else { return }
        startRequested = false
        status = "running"
        startedUptime = ProcessInfo.processInfo.systemUptime
        previous = nil // No distance across a pause or a permissions dialog.
        gpsStatus = "GPS-Signal wird gesucht …"
        manager.startUpdatingLocation()
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            if Date().timeIntervalSince(self.lastPersist) >= 15 { self.persist() }
            self.onChange?()
        }
        persist()
        onChange?()
    }

    func pause() {
        startRequested = false
        guard status == "running" else { return }
        if let startedUptime = startedUptime { accumulatedSeconds += max(0, ProcessInfo.processInfo.systemUptime - startedUptime) }
        startedUptime = nil
        status = "paused"
        gpsStatus = "Lauf pausiert"
        previous = nil
        manager.stopUpdatingLocation()
        timer?.invalidate()
        timer = nil
        persist()
        onChange?()
    }

    /// Call only after a completed run has been saved successfully.
    func discard() throws {
        // Atomic idle tombstone precedes resetting memory. An old saved run cannot reappear.
        do {
            try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            let tombstone = try JSONSerialization.data(withJSONObject: ["status": "idle"])
            try tombstone.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        } catch {
            lastError = "Die letzte Laufaufzeichnung konnte nicht entfernt werden. Versuche es erneut."
            onChange?()
            throw NSError(domain: "ShadowQuest.Run", code: 1, userInfo: [NSLocalizedDescriptionKey: lastError!])
        }
        startRequested = false
        manager.stopUpdatingLocation()
        timer?.invalidate()
        timer = nil
        status = "idle"
        startedUptime = nil
        accumulatedSeconds = 0
        distanceMeters = 0
        points = []
        previous = nil
        accuracy = nil
        gpsStatus = "GPS bereit"
        lastError = nil
        sessionID = UUID().uuidString
        recoveryRequired = false
        onChange?()
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if startRequested { authorizeOrStart() }
        else if status == "running" && (manager.authorizationStatus == .denied || manager.authorizationStatus == .restricted) {
            pause()
            fail("Der Standortzugriff wurde entzogen. Der Lauf ist pausiert.")
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard status == "running" else { return }
        for location in locations {
            let age = Date().timeIntervalSince(location.timestamp)
            guard age >= -1, age <= 10, location.horizontalAccuracy >= 0,
                  location.horizontalAccuracy <= 35,
                  CLLocationCoordinate2DIsValid(location.coordinate) else {
                gpsStatus = "Warte auf ein genaueres GPS-Signal …"
                continue
            }
            accuracy = location.horizontalAccuracy
            gpsStatus = "GPS aktiv · Genauigkeit ±\(Int(location.horizontalAccuracy)) m"
            var segmentStart = previous == nil
            if let previous = previous {
                let delta = location.distance(from: previous)
                let seconds = location.timestamp.timeIntervalSince(previous.timestamp)
                guard seconds > 0 else { continue }
                if seconds > 30 {
                    segmentStart = true // Missing GPS must never create a straight-line shortcut.
                } else {
                    guard delta / seconds <= 12 else { continue }
                    let noiseThreshold = max(3, min(8, (location.horizontalAccuracy + previous.horizontalAccuracy) * 0.15))
                    guard delta >= noiseThreshold else { continue }
                    distanceMeters += delta
                }
            }
            self.previous = location
            points.append(["lat": location.coordinate.latitude, "lon": location.coordinate.longitude,
                           "timestamp": location.timestamp.timeIntervalSince1970 * 1000,
                           "accuracy": location.horizontalAccuracy, "segmentStart": segmentStart])
            if points.count > 12000 { points = points.enumerated().filter { $0.offset % 2 == 0 || $0.element["segmentStart"] as? Bool == true }.map { $0.element } }
            lastError = nil
            persist()
        }
        onChange?()
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if (error as NSError).code == CLError.denied.rawValue {
            pause()
            fail("Standortzugriff verweigert. Der Lauf ist pausiert.")
        } else {
            gpsStatus = "GPS-Signal vorübergehend nicht verfügbar"
            onChange?()
        }
    }

    private func fail(_ message: String) {
        startRequested = false
        lastError = message
        gpsStatus = message
        onChange?()
    }

    private func persist() {
        guard !recoveryRequired else { return }
        do {
            try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            let data = try JSONSerialization.data(withJSONObject: state)
            try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            lastPersist = Date()
        } catch { lastError = "Die aktive Laufaufzeichnung konnte nicht gesichert werden." }
    }

    private func restore() {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return }
        do {
            let data = try Data(contentsOf: fileURL)
            guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw CocoaError(.fileReadCorruptFile) }
            if value["status"] as? String == "idle" { return }
            guard let savedStatus = value["status"] as? String, ["running", "paused"].contains(savedStatus),
                  let id = value["sessionID"] as? String, UUID(uuidString: id) != nil,
                  let meters = value["distanceMeters"] as? Double, meters.isFinite, meters >= 0, meters <= 100_000_000,
                  let seconds = value["elapsedSeconds"] as? Int, seconds >= 0, seconds <= 31 * 24 * 60 * 60,
                  let route = value["points"] as? [[String: Any]], route.count <= 200_000 else { throw CocoaError(.fileReadCorruptFile) }
            sessionID = id
            distanceMeters = meters
            accumulatedSeconds = Double(seconds)
            points = route.filter {
                guard let lat = $0["lat"] as? Double, let lon = $0["lon"] as? Double else { return false }
                return lat.isFinite && lon.isFinite && abs(lat) <= 90 && abs(lon) <= 180
            }
            status = "paused"
            gpsStatus = "Gesicherter Lauf · zum Fortsetzen tippen"
        } catch {
            status = "paused"
            recoveryRequired = true
            lastError = "Die letzte Laufaufzeichnung konnte nicht geladen werden. Verwirf sie ausdrücklich, um neu zu starten."
            gpsStatus = lastError!
        }
    }

    deinit { timer?.invalidate() }
}
