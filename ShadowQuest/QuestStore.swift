import Foundation

/// Local training data. The app calls this store on the main thread.
/// A new snapshot becomes visible only after its atomic disk write succeeds.
final class QuestStore {
    var onChange: (() -> Void)?
    private(set) var lastError: String?

    private let directory: URL
    private let fileURL: URL
    private var state = StoredState()
    private var initialReadError: Error?
    private var operationRevision: Int64 = 0
    private var statusMessage = ""

    var workouts: [[String: Any]] { state.workouts.map { $0.dictionary } }
    var gifts: [[String: Any]] { state.gifts.map { $0.dictionary } }
    var profile: [String: Any] {
        var result = state.profile.dictionary
        result["operationRevision"] = max(operationRevision, state.profile.operationRevision)
        return result
    }

    init(directory: URL? = nil) {
        self.directory = directory ?? FileManager.default.urls(for: .applicationSupportDirectory,
                                                                in: .userDomainMask)[0]
            .appendingPathComponent("ShadowQuest", isDirectory: true)
        fileURL = self.directory.appendingPathComponent("state-v1.json")
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return }
        do {
            let decoded = try JSONDecoder().decode(StoredState.self, from: Data(contentsOf: fileURL))
            try decoded.validate()
            state = decoded
            operationRevision = state.profile.operationRevision
        } catch {
            // Retain a damaged or unsupported file so later actions cannot overwrite it.
            initialReadError = error
            lastError = "Die gespeicherten Daten konnten nicht geladen werden: \(error.localizedDescription)"
        }
    }

    func saveReps(type: String, reps: Int) throws {
        do {
            guard type == "pushups" || type == "squats" else { throw StoreError.invalidWorkoutType }
            guard (1...10_000).contains(reps) else { throw StoreError.invalidReps }
            var candidate = state
            candidate.workouts.insert(Workout(id: UUID().uuidString, type: type,
                                               timestamp: Self.nowMilliseconds(), reps: reps,
                                               distanceMeters: 0, elapsedSeconds: 0,
                                               xp: reps * 2, points: []), at: 0)
            try commit(candidate)
        } catch {
            lastError = error.localizedDescription
            throw error
        }
    }

    func saveRun(distanceMeters: Double, elapsedSeconds: Int, points: [[String: Any]], id: String? = nil) throws {
        do {
            let runID: String
            if let id = id {
                guard let uuid = UUID(uuidString: id) else { throw StoreError.invalidRunID }
                runID = uuid.uuidString
            } else {
                runID = UUID().uuidString
            }
            guard distanceMeters.isFinite, distanceMeters >= 0, distanceMeters <= 100_000_000,
                  elapsedSeconds >= 0, elapsedSeconds <= 31 * 24 * 60 * 60,
                  distanceMeters > 0 || elapsedSeconds > 0 else { throw StoreError.invalidRun }
            guard points.count <= 200_000 else { throw StoreError.invalidRoute }
            let route = try points.map(RoutePoint.init)
            if let existing = state.workouts.first(where: { $0.id == runID }) {
                guard existing.type == "run", existing.distanceMeters == distanceMeters,
                      existing.elapsedSeconds == elapsedSeconds, existing.points == route
                else { throw StoreError.conflictingRunID }
                // Saving succeeded earlier but active-run cleanup may have been interrupted.
                // Preserve the original timestamp and XP and acknowledge the retry without a write.
                lastError = nil
                return
            }
            guard !state.gifts.contains(where: { $0.id == runID }) else { throw StoreError.conflictingRunID }
            var candidate = state
            candidate.workouts.insert(Workout(id: runID, type: "run",
                                               timestamp: Self.nowMilliseconds(), reps: 0,
                                               distanceMeters: distanceMeters, elapsedSeconds: elapsedSeconds,
                                               xp: Int(floor(distanceMeters / 10)), points: route), at: 0)
            try commit(candidate)
        } catch {
            lastError = error.localizedDescription
            throw error
        }
    }

    func claimGift(target: Int, requestID: String) -> [String: Any] {
        do {
            guard (1...1_000).contains(target) else { throw StoreError.invalidGiftTarget }
            let now = Date()
            let day = Self.dayKey(now)
            // Day uniqueness also makes retries and different request IDs idempotent.
            if let existing = state.gifts.first(where: { $0.day == day }) {
                lastError = nil
                return ["ok": true, "requestId": requestID, "gift": existing.dictionary,
                        "alreadyClaimed": true]
            }
            let reps = state.workouts.reduce(0) { total, workout in
                guard workout.type == "pushups",
                      Self.dayKey(Date(timeIntervalSince1970: Double(workout.timestamp) / 1_000)) == day
                else { return total }
                // Only a capped threshold is needed; this cannot overflow after a large history.
                return min(1_000, total + min(1_000, workout.reps))
            }
            guard reps >= target else { throw StoreError.giftThresholdNotMet }
            let cards = ["strength", "crown", "energy"]
            let gift = Gift(id: UUID().uuidString, timestamp: Self.nowMilliseconds(now),
                            day: day, target: target, cards: [cards[Int.random(in: 0..<cards.count)]], xp: 50)
            var candidate = state
            candidate.gifts.insert(gift, at: 0)
            try commit(candidate)
            return ["ok": true, "requestId": requestID, "gift": gift.dictionary,
                    "alreadyClaimed": false]
        } catch {
            lastError = error.localizedDescription
            return ["ok": false, "requestId": requestID, "error": error.localizedDescription]
        }
    }

    func saveProfile(nickname: String, bio: String) throws {
        try changeProfile(message: "Dein Profil wurde gespeichert.") { profile in
            guard !Self.containsISOControl(nickname) else { throw StoreError.invalidNickname }
            guard !bio.unicodeScalars.contains(where: {
                Self.isISOControl($0) && ![9, 10, 13].contains($0.value)
            }) else { throw StoreError.invalidBio }
            let name = nickname.components(separatedBy: .whitespacesAndNewlines)
                .filter { !$0.isEmpty }.joined(separator: " ")
            let biography = bio.replacingOccurrences(of: "\r\n", with: "\n")
                .replacingOccurrences(of: "\r", with: "\n").replacingOccurrences(of: "\t", with: " ")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            // JavaScript uses Array.from(), so match its Unicode code-point length.
            guard (2...20).contains(name.unicodeScalars.count) else { throw StoreError.invalidNickname }
            guard biography.unicodeScalars.count <= 300 else { throw StoreError.invalidBio }
            profile.nickname = name
            profile.bio = biography
        }
    }

    func addFriend(_ friend: [String: Any]) throws {
        try changeProfile(message: "Hunter wurde zu deinen Freunden hinzugefügt.") { profile in
            let sanitized = try Friend(friend)
            if let index = profile.friends.firstIndex(where: { $0.uid == sanitized.uid }) {
                profile.friends[index] = sanitized
            } else {
                guard profile.friends.count < 30 else { throw StoreError.friendsLimit }
                profile.friends.append(sanitized)
            }
        }
    }

    func removeFriend(uid: String) throws {
        try changeProfile(message: "Hunter wurde aus deiner Freundesliste entfernt.") { profile in
            let cleaned = uid.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleaned.isEmpty else { throw StoreError.invalidFriend }
            profile.friends.removeAll { $0.uid == cleaned }
        }
    }

    func setFriends(_ friends: [[String: Any]]) throws {
        try changeProfile(message: "Deine Freunde wurden aktualisiert.") { profile in
            var unique = [Friend]()
            var ids = Set<String>()
            for item in friends {
                let friend = try Friend(item)
                if ids.insert(friend.uid).inserted { unique.append(friend) }
                guard unique.count <= 30 else { throw StoreError.friendsLimit }
            }
            profile.friends = unique
        }
    }

    func stateProfile(error: String? = nil, busy: Bool = false) -> [String: Any] {
        var result = profile
        result["busy"] = busy
        result["error"] = (error ?? lastError).map { $0 as Any } ?? NSNull()
        result["statusMessage"] = statusMessage
        return result
    }

    /// Acknowledge an online profile operation which did not change local profile data.
    /// This is a transient UI marker; saved profile fields remain unchanged.
    func acknowledgeProfileOperation(statusMessage: String? = nil, error: String? = nil) {
        operationRevision = nextRevision()
        self.statusMessage = statusMessage ?? ""
        lastError = error
        onChange?()
    }

    private func changeProfile(message: String, update: (inout HunterProfile) throws -> Void) throws {
        do {
            var candidate = state
            try update(&candidate.profile)
            candidate.profile.lastUpdated = Self.nowMilliseconds()
            candidate.profile.operationRevision = nextRevision()
            try commit(candidate, message: message)
        } catch {
            // A failed profile operation must acknowledge the web UI without changing saved data.
            operationRevision = nextRevision()
            statusMessage = ""
            lastError = error.localizedDescription
            throw error
        }
    }

    private func nextRevision() -> Int64 {
        let previous = max(operationRevision, state.profile.operationRevision)
        return previous < Int64.max ? previous + 1 : 1
    }

    private func commit(_ candidate: StoredState, message: String? = nil) throws {
        if let error = initialReadError { throw StoreError.unreadableData(error.localizedDescription) }
        try candidate.validate()
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(candidate)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        #if os(iOS)
        try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try data.write(to: fileURL, options: [.atomic])
        #endif
        state = candidate
        operationRevision = max(operationRevision, state.profile.operationRevision)
        lastError = nil
        if let message = message { statusMessage = message }
        onChange?()
    }

    private static func nowMilliseconds(_ date: Date = Date()) -> Int64 {
        Int64((date.timeIntervalSince1970 * 1_000).rounded(.down))
    }

    private static func dayKey(_ date: Date) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        let values = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", values.year ?? 0, values.month ?? 0, values.day ?? 0)
    }

    private static func isISOControl(_ scalar: Unicode.Scalar) -> Bool {
        scalar.value < 32 || (127...159).contains(scalar.value)
    }

    private static func containsISOControl(_ value: String) -> Bool {
        value.unicodeScalars.contains(where: isISOControl)
    }

    private struct StoredState: Codable {
        var schemaVersion = 1
        var workouts = [Workout]()
        var gifts = [Gift]()
        var profile = HunterProfile()

        func validate() throws {
            guard schemaVersion == 1 else { throw StoreError.unsupportedSchema }
            var ids = Set<String>()
            for workout in workouts {
                guard ids.insert(workout.id).inserted, !workout.id.isEmpty,
                      workout.timestamp >= 0, workout.distanceMeters.isFinite,
                      workout.distanceMeters >= 0, workout.distanceMeters <= 100_000_000,
                      workout.elapsedSeconds >= 0, workout.elapsedSeconds <= 31 * 24 * 60 * 60,
                      workout.points.count <= 200_000 else { throw StoreError.corruptedData }
                if workout.type == "run" {
                    guard workout.reps == 0, workout.xp == Int(floor(workout.distanceMeters / 10)),
                          workout.distanceMeters > 0 || workout.elapsedSeconds > 0 else { throw StoreError.corruptedData }
                } else {
                    guard ["pushups", "squats"].contains(workout.type),
                          (1...10_000).contains(workout.reps), workout.xp == workout.reps * 2,
                          workout.distanceMeters == 0, workout.elapsedSeconds == 0,
                          workout.points.isEmpty else { throw StoreError.corruptedData }
                }
                for point in workout.points { try point.validate() }
            }
            var days = Set<String>()
            for gift in gifts {
                guard ids.insert(gift.id).inserted, !gift.id.isEmpty, gift.timestamp >= 0,
                      days.insert(gift.day).inserted, Self.isValidDay(gift.day),
                      (1...1_000).contains(gift.target), gift.xp == 50, gift.cards.count == 1,
                      gift.cards.allSatisfy({ ["strength", "crown", "energy"].contains($0) })
                else { throw StoreError.corruptedData }
            }
            try profile.validate()
        }

        private static func isValidDay(_ value: String) -> Bool {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.dateFormat = "yyyy-MM-dd"
            formatter.isLenient = false
            guard let date = formatter.date(from: value) else { return false }
            return formatter.string(from: date) == value
        }
    }

    private struct Workout: Codable {
        var id: String
        var type: String
        var timestamp: Int64
        var reps: Int
        var distanceMeters: Double
        var elapsedSeconds: Int
        var xp: Int
        var points: [RoutePoint]
        var dictionary: [String: Any] {
            ["id": id, "type": type, "timestamp": timestamp, "reps": reps,
             "distanceMeters": distanceMeters, "elapsedSeconds": elapsedSeconds,
             "xp": xp, "points": points.map { $0.dictionary }]
        }
    }

    private struct RoutePoint: Codable, Equatable {
        var lat: Double
        var lon: Double
        var segmentStart: Bool
        init(_ dictionary: [String: Any]) throws {
            guard let latitude = dictionary["lat"] as? NSNumber,
                  let longitude = dictionary["lon"] as? NSNumber else { throw StoreError.invalidRoute }
            lat = latitude.doubleValue
            lon = longitude.doubleValue
            segmentStart = dictionary["segmentStart"] as? Bool ?? false
            try validate()
        }
        func validate() throws {
            guard lat.isFinite, lon.isFinite, (-90...90).contains(lat), (-180...180).contains(lon)
            else { throw StoreError.invalidRoute }
        }
        var dictionary: [String: Any] { ["lat": lat, "lon": lon, "segmentStart": segmentStart] }
    }

    private struct Gift: Codable {
        var id: String
        var timestamp: Int64
        var day: String
        var target: Int
        var cards: [String]
        var xp: Int
        var dictionary: [String: Any] {
            ["id": id, "timestamp": timestamp, "day": day, "target": target, "cards": cards, "xp": xp]
        }
    }

    private struct HunterProfile: Codable {
        var nickname = ""
        var bio = ""
        var friends = [Friend]()
        var lastUpdated: Int64 = 0
        var operationRevision: Int64 = 0
        func validate() throws {
            guard nickname.isEmpty || (2...20).contains(nickname.unicodeScalars.count),
                  !QuestStore.containsISOControl(nickname),
                  bio.unicodeScalars.count <= 300, friends.count <= 30,
                  !bio.unicodeScalars.contains(where: { QuestStore.isISOControl($0) && $0.value != 10 }),
                  Set(friends.map { $0.uid }).count == friends.count,
                  lastUpdated >= 0, operationRevision >= 0 else { throw StoreError.corruptedData }
            for friend in friends { try friend.validate() }
        }
        var dictionary: [String: Any] {
            ["nickname": nickname, "bio": bio, "friends": friends.map { $0.dictionary },
             "lastUpdated": lastUpdated, "operationRevision": operationRevision]
        }
    }

    private struct Friend: Codable {
        var uid: String
        var name: String
        var totalXp: Int64
        var weekXp: Int64
        var active: Bool
        var updatedAt: Int64
        var weekStart: Int64
        init(_ dictionary: [String: Any]) throws {
            uid = (dictionary["uid"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let rawName = dictionary["name"] as? String ?? "Hunter"
            guard !QuestStore.containsISOControl(rawName) else { throw StoreError.invalidFriend }
            name = rawName.components(separatedBy: .whitespacesAndNewlines)
                .filter { !$0.isEmpty }.joined(separator: " ")
            totalXp = min(1_000_000_000, Self.score(dictionary["totalXp"]))
            weekXp = min(totalXp, Self.score(dictionary["weekXp"]))
            active = dictionary["active"] as? Bool ?? true
            updatedAt = Self.score(dictionary["updatedAt"])
            weekStart = Self.score(dictionary["weekStart"])
            try validate()
        }
        func validate() throws {
            guard !uid.isEmpty, uid.unicodeScalars.count <= 128,
                  uid.unicodeScalars.allSatisfy({
                      (65...90).contains($0.value) || (97...122).contains($0.value) ||
                      (48...57).contains($0.value) || $0.value == 95 || $0.value == 45
                  }),
                  (2...20).contains(name.unicodeScalars.count), !QuestStore.containsISOControl(name),
                  totalXp <= 1_000_000_000, weekXp <= totalXp,
                  [totalXp, weekXp, updatedAt, weekStart].allSatisfy({ $0 >= 0 && $0 <= 9_007_199_254_740_991 })
            else { throw StoreError.invalidFriend }
        }
        private static func score(_ value: Any?) -> Int64 {
            guard let number = value as? NSNumber, number.doubleValue.isFinite else { return 0 }
            return Int64(max(0, min(9_007_199_254_740_991, number.doubleValue)).rounded(.down))
        }
        var dictionary: [String: Any] {
            ["uid": uid, "name": name, "totalXp": totalXp, "weekXp": weekXp,
             "active": active, "updatedAt": updatedAt, "weekStart": weekStart]
        }
    }

    private enum StoreError: LocalizedError {
        case invalidWorkoutType, invalidReps, invalidRun, invalidRunID, conflictingRunID, invalidRoute, invalidGiftTarget
        case giftThresholdNotMet, invalidNickname, invalidBio, invalidFriend, friendsLimit
        case corruptedData, unsupportedSchema, unreadableData(String)
        var errorDescription: String? {
            switch self {
            case .invalidWorkoutType: return "Diese Trainingsart ist ungültig."
            case .invalidReps: return "Bitte speichere 1 bis 10.000 Wiederholungen."
            case .invalidRun: return "Der Lauf enthält ungültige Entfernungs- oder Zeitdaten."
            case .invalidRunID: return "Die gespeicherte Laufkennung ist ungültig."
            case .conflictingRunID: return "Diese Laufkennung wurde bereits für andere Trainingsdaten verwendet."
            case .invalidRoute: return "Die Laufstrecke enthält ungültige GPS-Punkte."
            case .invalidGiftTarget: return "Dein Tagesziel muss zwischen 1 und 1.000 Push Ups liegen."
            case .giftThresholdNotMet: return "Speichere zuerst genügend Push Ups für dein Tagesziel."
            case .invalidNickname: return "Dein Hunter-Name braucht 2 bis 20 Zeichen."
            case .invalidBio: return "Deine Bio darf höchstens 300 Zeichen enthalten."
            case .invalidFriend: return "Dieser Hunter enthält ungültige Profildaten."
            case .friendsLimit: return "Du kannst höchstens 30 Freunde speichern."
            case .corruptedData: return "Die gespeicherten Trainingsdaten sind beschädigt."
            case .unsupportedSchema: return "Diese Datenversion wird noch nicht unterstützt."
            case .unreadableData(let details): return "Die gespeicherten Daten bleiben geschützt: \(details)"
            }
        }
    }
}
