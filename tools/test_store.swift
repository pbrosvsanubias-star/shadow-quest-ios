import Foundation

// Run on macOS: swiftc ShadowQuest/QuestStore.swift tools/test_store.swift -o /tmp/sq-store-tests && /tmp/sq-store-tests
@main
struct StoreTests {
    struct Failure: Error, CustomStringConvertible {
        let description: String
    }

    static func require(_ condition: @autoclosure () -> Bool, _ message: String) throws {
        if !condition() { throw Failure(description: message) }
    }

    static func rejects(_ message: String, _ operation: () throws -> Void) throws {
        do {
            try operation()
        } catch {
            return
        }
        throw Failure(description: "Expected rejection: \(message)")
    }

    static func integer(_ item: [String: Any], _ key: String) -> Int64 {
        (item[key] as? NSNumber)?.int64Value ?? -1
    }

    static func main() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent("shadow-quest-tests-\(UUID().uuidString)", isDirectory: true)
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        defer {
            do { try fm.removeItem(at: root) }
            catch { print("Test cleanup failed: \(error)") }
        }

        let storeURL = root.appendingPathComponent("normal", isDirectory: true)
        let store = QuestStore(directory: storeURL)
        try require(store.workouts.isEmpty && store.gifts.isEmpty && store.lastError == nil, "New store is empty")
        var changeCount = 0
        store.onChange = { changeCount += 1 }
        try store.saveReps(type: "pushups", reps: 19)
        try store.saveReps(type: "squats", reps: 20)
        let runID = UUID().uuidString
        let runPoints: [[String: Any]] = [["lat": 52.5, "lon": 13.4, "segmentStart": true]]
        try store.saveRun(distanceMeters: 125.99, elapsedSeconds: 60, points: runPoints, id: runID)
        try require(integer(store.workouts[2], "xp") == 38, "Push Ups award 2 XP each")
        try require(integer(store.workouts[1], "xp") == 40, "Squats award 2 XP each")
        try require(integer(store.workouts[0], "xp") == 12, "Run XP rounds down per 10 m")
        try require(integer(store.workouts[0], "elapsedSeconds") == 60, "Run duration round trip")
        try require((store.workouts[0]["points"] as? [[String: Any]])?.first?["segmentStart"] as? Bool == true,
                    "Route segment boundary is preserved")
        try require(integer(store.workouts[0], "timestamp") > 1_000_000_000_000, "Timestamp uses milliseconds")
        try require(changeCount == 3, "Successful writes notify once")
        let firstRunTimestamp = integer(store.workouts[0], "timestamp")
        try store.saveRun(distanceMeters: 125.99, elapsedSeconds: 60, points: runPoints, id: runID.lowercased())
        try require(store.workouts.count == 3 && changeCount == 3,
                    "Same run UUID retry never adds history, XP or emits a successful write")
        try require(integer(store.workouts[0], "timestamp") == firstRunTimestamp,
                    "Idempotent run retry preserves original timestamp")

        let unavailable = store.claimGift(target: 20, requestID: "not-ready")
        try require(unavailable["ok"] as? Bool == false, "Gift needs enough saved Push Ups")
        try require(unavailable["requestId"] as? String == "not-ready", "Gift failure includes request ID")
        try require(store.gifts.isEmpty, "Squats do not unlock the Push Up gift")
        try store.saveReps(type: "pushups", reps: 1)
        let ready = store.claimGift(target: 20, requestID: "ready")
        try require(ready["ok"] as? Bool == true && store.gifts.count == 1, "Gift unlocks at target")
        try require(integer(store.gifts[0], "xp") == 50, "Gift awards 50 XP")
        let cards = store.gifts[0]["cards"] as? [String] ?? []
        try require(cards.count == 1 && ["strength", "crown", "energy"].contains(cards[0]), "Gift gives one valid card")
        let duplicate = store.claimGift(target: 1, requestID: "duplicate")
        try require(duplicate["ok"] as? Bool == true && duplicate["alreadyClaimed"] as? Bool == true,
                    "Same day gift retry is idempotent")
        try require(store.gifts.count == 1, "Retry never awards a second gift")

        try store.saveProfile(nickname: "  Hunter   😀 ", bio: " My\r\nbio\t ")
        try require(store.profile["nickname"] as? String == "Hunter 😀", "Profile whitespace normalizes")
        try require(store.profile["bio"] as? String == "My\nbio", "Bio line breaks normalize")
        try store.addFriend(["uid": "hunter-1", "name": "Hunter 1", "totalXp": 100, "weekXp": 20])
        try store.addFriend(["uid": "hunter-1", "name": "Hunter 1", "totalXp": 120])
        try require((store.profile["friends"] as? [[String: Any]])?.count == 1, "Adding the same friend deduplicates")
        try store.setFriends([["uid": "hunter-1", "name": "Hunter 1"], ["uid": "hunter-1", "name": "Hunter 1"]])
        try require((store.profile["friends"] as? [[String: Any]])?.count == 1, "Friend refresh deduplicates")

        let reloaded = QuestStore(directory: storeURL)
        try require(reloaded.lastError == nil, "Valid stored JSON reloads")
        try require(NSArray(array: reloaded.workouts).isEqual(to: store.workouts), "Workouts survive a reload")
        try require(NSArray(array: reloaded.gifts).isEqual(to: store.gifts), "Gift survives a reload")
        try require(NSDictionary(dictionary: reloaded.profile).isEqual(to: store.profile), "Profile survives a reload")
        try reloaded.saveRun(distanceMeters: 125.99, elapsedSeconds: 60, points: runPoints, id: runID)
        try require(reloaded.workouts.count == store.workouts.count,
                    "Run UUID remains idempotent after a disk round trip")
        try require(NSArray(array: reloaded.workouts).isEqual(to: store.workouts),
                    "Round-trip run retry never changes original history or XP")
        try rejects("conflicting run UUID distance") {
            try reloaded.saveRun(distanceMeters: 126, elapsedSeconds: 60, points: runPoints, id: runID)
        }
        try rejects("conflicting run UUID duration") {
            try reloaded.saveRun(distanceMeters: 125.99, elapsedSeconds: 61, points: runPoints, id: runID)
        }
        try rejects("conflicting run UUID route") {
            try reloaded.saveRun(distanceMeters: 125.99, elapsedSeconds: 60,
                                 points: [["lat": 52.6, "lon": 13.4, "segmentStart": true]], id: runID)
        }
        try rejects("foreign workout UUID") {
            try reloaded.saveRun(distanceMeters: 125.99, elapsedSeconds: 60, points: runPoints,
                                 id: reloaded.workouts.first(where: { $0["type"] as? String == "pushups" })?["id"] as? String)
        }
        try rejects("foreign gift UUID") {
            try reloaded.saveRun(distanceMeters: 125.99, elapsedSeconds: 60, points: runPoints,
                                 id: reloaded.gifts[0]["id"] as? String)
        }
        try require(NSArray(array: reloaded.workouts).isEqual(to: store.workouts),
                    "Conflicting run ID never changes saved data")
        try reloaded.removeFriend(uid: "hunter-1")
        try require((reloaded.profile["friends"] as? [[String: Any]])?.isEmpty == true, "Friend removal persists")

        let originalCount = store.workouts.count
        try rejects("zero reps") { try store.saveReps(type: "pushups", reps: 0) }
        try rejects("too many reps") { try store.saveReps(type: "pushups", reps: 10_001) }
        try rejects("wrong type") { try store.saveReps(type: "unknown", reps: 1) }
        try rejects("negative distance") { try store.saveRun(distanceMeters: -1, elapsedSeconds: 1, points: []) }
        try rejects("NaN distance") { try store.saveRun(distanceMeters: .nan, elapsedSeconds: 1, points: []) }
        try rejects("invalid run UUID") { try store.saveRun(distanceMeters: 10, elapsedSeconds: 1, points: [], id: "not-a-uuid") }
        try rejects("invalid route") { try store.saveRun(distanceMeters: 10, elapsedSeconds: 1, points: [["lat": 91, "lon": 1]]) }
        try require(store.workouts.count == originalCount, "Validation failures never add workouts")
        try require(store.claimGift(target: 0, requestID: "invalid")["ok"] as? Bool == false, "Gift target validates even on a claimed day")
        let revision = integer(store.profile, "operationRevision")
        try rejects("nickname short") { try store.saveProfile(nickname: "A", bio: "") }
        try require(integer(store.profile, "operationRevision") > revision, "Failed profile operation acknowledges the UI")
        try require(store.profile["nickname"] as? String == "Hunter 😀", "Invalid nickname preserves profile")
        let errorRevision = integer(store.profile, "operationRevision")
        store.acknowledgeProfileOperation(error: "Offline")
        try require(integer(store.profile, "operationRevision") > errorRevision,
                    "Online operation failure acknowledges the UI")
        try require(store.stateProfile()["error"] as? String == "Offline", "Online failure is serializable")
        try require(JSONSerialization.isValidJSONObject(store.stateProfile()), "Profile snapshot is valid JSON")
        try rejects("nickname code-point length") { try store.saveProfile(nickname: String(repeating: "😀", count: 21), bio: "") }
        try rejects("nickname control characters") { try store.saveProfile(nickname: "Hu\u{0}nter", bio: "") }
        try rejects("bio length") { try store.saveProfile(nickname: "Hunter", bio: String(repeating: "😀", count: 301)) }
        try rejects("bio control characters") { try store.saveProfile(nickname: "Hunter", bio: "Bad\u{0}bio") }
        try rejects("friend UID") { try store.addFriend(["uid": "../hunter", "name": "Hunter"]) }
        try rejects("friend limit") {
            try store.setFriends((0..<31).map { ["uid": "friend-\($0)", "name": "Friend"] })
        }
        try require((store.profile["friends"] as? [[String: Any]])?.count == 1, "Rejected friend replacement preserves list")

        // Replace the storage directory with a regular file: portable, deterministic I/O failure.
        let failureURL = root.appendingPathComponent("failure", isDirectory: true)
        let failureStore = QuestStore(directory: failureURL)
        try failureStore.saveReps(type: "pushups", reps: 20)
        let backupURL = root.appendingPathComponent("failure-backup", isDirectory: true)
        try fm.moveItem(at: failureURL, to: backupURL)
        try Data("blocked".utf8).write(to: failureURL)
        var failureChanges = 0
        failureStore.onChange = { failureChanges += 1 }
        let failedGift = failureStore.claimGift(target: 20, requestID: "disk-failed")
        try require(failedGift["ok"] as? Bool == false && failureStore.gifts.isEmpty,
                    "Failed persistence never awards gift or XP")
        try rejects("failed workout persistence") { try failureStore.saveReps(type: "pushups", reps: 1) }
        try require(failureStore.workouts.count == 1 && failureChanges == 0, "Failed persistence preserves state and emits no success")
        try rejects("failed profile persistence") { try failureStore.saveProfile(nickname: "New Hunter", bio: "") }
        try require(failureStore.profile["nickname"] as? String == "", "Failed profile persistence preserves profile")
        try require(failureStore.lastError != nil, "Persistence error is exposed")
        try fm.removeItem(at: failureURL)
        try fm.moveItem(at: backupURL, to: failureURL)
        try require(failureStore.claimGift(target: 20, requestID: "retry")["ok"] as? Bool == true,
                    "Gift can be retried after storage recovers")
        try require(QuestStore(directory: failureURL).gifts.count == 1, "Recovered gift persisted exactly once")

        // Corrupt or newer data must not be erased by a new write.
        let corruptURL = root.appendingPathComponent("corrupt", isDirectory: true)
        try fm.createDirectory(at: corruptURL, withIntermediateDirectories: true)
        let corruptFile = corruptURL.appendingPathComponent("state-v1.json")
        let broken = Data("{broken".utf8)
        try broken.write(to: corruptFile)
        let corruptStore = QuestStore(directory: corruptURL)
        try require(corruptStore.lastError != nil, "Unreadable data exposes load error")
        try rejects("protect corrupt storage") { try corruptStore.saveReps(type: "pushups", reps: 1) }
        let preservedData = try Data(contentsOf: corruptFile)
        try require(preservedData == broken, "Unreadable file stays untouched")

        let unsupportedURL = root.appendingPathComponent("unsupported", isDirectory: true)
        try fm.createDirectory(at: unsupportedURL, withIntermediateDirectories: true)
        let validData = try Data(contentsOf: storeURL.appendingPathComponent("state-v1.json"))
        var object = try JSONSerialization.jsonObject(with: validData) as! [String: Any]
        object["schemaVersion"] = 2
        let newerData = try JSONSerialization.data(withJSONObject: object)
        let unsupportedFile = unsupportedURL.appendingPathComponent("state-v1.json")
        try newerData.write(to: unsupportedFile)
        let unsupportedStore = QuestStore(directory: unsupportedURL)
        try require(unsupportedStore.lastError != nil, "Unsupported schema exposes load error")
        try rejects("protect newer schema") { try unsupportedStore.saveReps(type: "pushups", reps: 1) }
        let untouchedNewerData = try Data(contentsOf: unsupportedFile)
        try require(untouchedNewerData == newerData, "Newer schema stays untouched")

        print("QuestStore: all validation, persistence, gift, profile and round-trip tests passed.")
    }
}
