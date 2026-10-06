import Foundation
import Security

/// Opt-in online ranking compatible with the original Android member documents.
/// Only anonymous identity, hunter name and aggregate training XP cross the network.
/// Firebase REST is used deliberately: the APK contains an Android registration,
/// which must not be presented to the iOS Firebase SDK as an iOS application ID.
@MainActor
final class LeaderboardService {
    var onChange: (() -> Void)?
    func clearProfileError() { profileError = nil }
    private(set) var profileError: String?
    private(set) var profileBusy = false
    private(set) var entries = [[String: Any]]()
    private(set) var ownUID = ""

    private let store: QuestStore
    private let defaults = UserDefaults.standard
    private let prefix = "shadowQuest.online.v1."
    private let config: Configuration?
    private let session: URLSession
    private let keychain: IdentityKeychain
    private var identity: Identity?
    private var idToken: String?
    private var tokenExpiresAt = Date.distantPast
    private var optedIn = false
    private var enrolled = false
    private var pendingDelete = false
    private var busy = false
    private var period = "week"
    private var nickname = ""
    private var rankingError: String?
    private var message = "Gib deinen Hunter-Namen ein und mach bei der Rangliste mit."
    private var lastUpdated: Int64 = 0
    private var cachedWeekStart: Int64 = 0
    private var syncedKey = ""
    private var caches = [String: RankingCache]()
    private var needsUpload = false
    private var queuedProfileSync = false
    private var generation: UInt64 = 0
    private var operation: Task<Void, Never>?

    var state: [String: Any] {
        let totals = trainingTotals()
        let visible = period == "week" && cachedWeekStart != totals.weekStart ? [] : entries
        return ["configured": config != nil, "enabled": optedIn && enrolled, "busy": busy,
                "nickname": nickname, "period": period, "entries": visible, "ownUid": ownUID,
                "ownTotalXp": totals.total, "ownWeekXp": totals.week,
                "weekStart": totals.weekStart, "lastUpdated": lastUpdated,
                "error": rankingError.map { $0 as Any } ?? NSNull(),
                "statusMessage": message,
                "pendingSync": pendingDelete || needsUpload || (optedIn && !enrolled)]
    }

    init(store: QuestStore) {
        self.store = store
        config = Configuration.read()
        let settings = URLSessionConfiguration.ephemeral
        settings.timeoutIntervalForRequest = 20
        settings.timeoutIntervalForResource = 30
        settings.requestCachePolicy = .reloadIgnoringLocalCacheData
        settings.httpShouldSetCookies = false
        settings.urlCache = nil
        session = URLSession(configuration: settings)
        keychain = IdentityKeychain(service: (Bundle.main.bundleIdentifier ?? "de.shadowquest.ios") + ".anonymous-ranking")
        identity = try? keychain.read()
        optedIn = defaults.bool(forKey: prefix + "optedIn")
        enrolled = defaults.bool(forKey: prefix + "enrolled")
        pendingDelete = defaults.bool(forKey: prefix + "pendingDelete")
        ownUID = defaults.string(forKey: prefix + "uid") ?? identity?.uid ?? ""
        nickname = defaults.string(forKey: prefix + "nickname") ?? ""
        period = defaults.string(forKey: prefix + "period") == "total" ? "total" : "week"
        syncedKey = defaults.string(forKey: prefix + "syncedKey") ?? ""
        needsUpload = defaults.bool(forKey: prefix + "needsUpload")
        if let data = defaults.data(forKey: prefix + "cache"),
           let cache = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            entries = (cache["entries"] as? [[String: Any]] ?? []).prefix(50).compactMap(Self.cleanEntry)
            lastUpdated = Self.integer(cache["lastUpdated"])
            cachedWeekStart = Self.integer(cache["weekStart"])
        }
        if let data = defaults.data(forKey: prefix + "periodCaches"),
           let saved = try? JSONSerialization.jsonObject(with: data) as? [String: [String: Any]] {
            for (key, value) in saved where key == "week" || key == "total" {
                caches[key] = RankingCache(entries: (value["entries"] as? [[String: Any]] ?? []).prefix(50).compactMap(Self.cleanEntry),
                                           updatedAt: Self.integer(value["lastUpdated"]),
                                           weekStart: Self.integer(value["weekStart"]))
            }
        }
        if caches[period] == nil {
            caches[period] = RankingCache(entries: entries, updatedAt: lastUpdated, weekStart: cachedWeekStart)
        }
        if config == nil { message = "Der Online-Dienst ist noch nicht eingerichtet. Dein Training bleibt offline nutzbar." }
        else if pendingDelete { message = "Die Entfernung deines Eintrags wartet auf eine Verbindung. Erneut „Teilnahme beenden“ wählen." }
        else if optedIn && enrolled { message = "Gespeicherter Stand · zum Aktualisieren verbinden." }
        else if optedIn { message = "Deine Teilnahme wurde noch nicht bestätigt. Versuche „Mitmachen“ erneut." }
        // Loading saved preferences and Keychain identity never starts a network request.
    }

    func activate(nickname rawName: String) {
        guard let name = Self.normalizeName(rawName) else {
            rankingError = "Dein Hunter-Name braucht 2 bis 20 Zeichen."; onChange?(); return
        }
        guard config != nil else { configurationError(); return }
        guard !pendingDelete else {
            rankingError = "Beende zuerst die ausstehende Entfernung deines Ranglisten-Eintrags."; onChange?(); return
        }
        do {
            try store.saveProfile(nickname: name, bio: store.profile["bio"] as? String ?? "")
        } catch { rankingError = error.localizedDescription; onChange?(); return }
        nickname = name
        optedIn = true
        needsUpload = true
        persist()
        start(.ranking, message: "Verbinde deinen Hunter …") { service, ticket in
            try await service.upload(ticket: ticket)
            try service.ensureCurrent(ticket)
            service.enrolled = true
            service.persist()
            try await service.fetchRanking(ticket: ticket)
            service.message = "Du nimmst an der Hunter-Rangliste teil."
        }
    }

    func refresh(period requested: String) {
        guard optedIn && enrolled, !pendingDelete else { return }
        let next = requested == "total" ? "total" : "week"
        if next != period {
            caches[period] = RankingCache(entries: entries, updatedAt: lastUpdated, weekStart: cachedWeekStart)
            period = next
            let cache = caches[next]
            entries = cache?.entries ?? []
            lastUpdated = cache?.updatedAt ?? 0
            cachedWeekStart = cache?.weekStart ?? 0
        }
        persist()
        start(.ranking, message: "Aktualisiere die Hunter-Rangliste …") { service, ticket in
            if service.currentSyncKey() != service.syncedKey || service.needsUpload {
                try await service.upload(ticket: ticket)
            }
            try await service.fetchRanking(ticket: ticket)
            service.message = "Rangliste aktualisiert · höchstens 50 Hunter."
        }
    }

    func disconnect() {
        guard optedIn || enrolled || pendingDelete else { return }
        pendingDelete = true
        queuedProfileSync = false
        persist()
        start(.ranking, message: "Entferne deinen Ranglisten-Eintrag …") { service, ticket in
            guard !service.ownUID.isEmpty else {
                // An unconfirmed attempt may have created an Auth user but no member.
                if service.enrolled { throw OnlineError.identityLost }
                service.finishDisconnect(); return
            }
            let token = try await service.accessToken(ticket: ticket)
            let document = try await service.getMember(uid: service.ownUID, token: token, ticket: ticket)
            if let document = document {
                let path = try service.memberName(uid: service.ownUID)
                var write: [String: Any] = ["delete": path]
                if let updateTime = document["updateTime"] as? String {
                    write["currentDocument"] = ["updateTime": updateTime]
                }
                _ = try await service.firestore(path: service.databasePath + "/documents:commit", method: "POST",
                                                 body: ["writes": [write]], ticket: ticket)
            }
            try service.ensureCurrent(ticket)
            service.finishDisconnect()
        }
    }

    func syncTrainingIfEnabled() {
        guard optedIn && enrolled, !pendingDelete else { return }
        guard currentSyncKey() != syncedKey || needsUpload else { return }
        needsUpload = true
        persist()
        if busy { onChange?(); return }
        start(.ranking, message: "Synchronisiere deine Trainings-XP …") { service, ticket in
            try await service.upload(ticket: ticket)
            service.message = "Deine Trainings-XP wurden synchronisiert."
        }
    }

    func syncProfileIfEnabled() {
        guard optedIn && enrolled, !pendingDelete else { return }
        guard let name = Self.normalizeName(store.profile["nickname"] as? String ?? "") else { return }
        nickname = name
        needsUpload = true
        queuedProfileSync = true
        persist()
        if busy { profileBusy = true; onChange?(); return }
        queuedProfileSync = false
        start(.profile, message: "Aktualisiere deinen Hunter-Namen …") { service, ticket in
            try await service.upload(ticket: ticket)
            service.message = "Dein Hunter-Name wurde in der Rangliste aktualisiert."
        }
    }

    func refreshFriends() {
        guard optedIn && enrolled, !pendingDelete else {
            profileError = "Nimm zuerst an der Hunter-Rangliste teil."
            store.acknowledgeProfileOperation(error: profileError)
            onChange?(); return
        }
        start(.friends, message: "Aktualisiere deine Freunde …") { service, ticket in
            let token = try await service.accessToken(ticket: ticket)
            let original = service.store.profile["friends"] as? [[String: Any]] ?? []
            var updates = [String: [String: Any]]()
            var unavailable = [String]()
            var failures = 0
            for friend in original.prefix(30) {
                try service.ensureCurrent(ticket)
                guard let uid = friend["uid"] as? String, Self.validUID(uid) else { continue }
                do {
                    if let document = try await service.getMember(uid: uid, token: token, ticket: ticket) {
                        if let refreshed = Self.memberEntry(document, currentWeek: service.trainingTotals().weekStart) {
                            updates[uid] = refreshed
                        } else { failures += 1 }
                    } else { unavailable.append(uid) }
                } catch {
                    if error is CancellationError { throw error }
                    failures += 1
                }
            }
            try service.ensureCurrent(ticket)
            // Re-read to preserve additions/removals made locally while reads were pending.
            let current = service.store.profile["friends"] as? [[String: Any]] ?? []
            let merged = current.map { friend -> [String: Any] in
                let uid = friend["uid"] as? String ?? ""
                if let update = updates[uid] { return update }
                var copy = friend
                if unavailable.contains(uid) { copy["active"] = false; copy["updatedAt"] = Self.nowMillis() }
                // Network failures retain the saved entry and its previous timestamp.
                return copy
            }
            try service.store.setFriends(merged)
            if failures > 0 {
                throw OnlineError.message("Einige Hunter konnten nicht aktualisiert werden. Ihr gespeicherter Stand bleibt erhalten.")
            }
            service.message = "Freundesliste aktualisiert. Deine Bio und Freundesliste bleiben auf diesem Gerät."
        }
    }

    private enum Kind: Equatable { case ranking, profile, friends }
    private struct RankingCache {
        var entries: [[String: Any]]
        var updatedAt: Int64
        var weekStart: Int64
        var dictionary: [String: Any] { ["entries": entries, "lastUpdated": updatedAt, "weekStart": weekStart] }
    }

    private func start(_ kind: Kind, message text: String,
                       work: @escaping @MainActor (LeaderboardService, UInt64) async throws -> Void) {
        let previous = operation
        generation &+= 1
        let ticket = generation
        busy = true
        profileBusy = kind != .ranking
        rankingError = nil
        if kind != .ranking { profileError = nil }
        message = text
        onChange?()
        operation = Task { @MainActor [weak self] in
            // Wait for any in-flight request before a subsequent write/delete. Generation
            // prevents an older response from re-enabling participation after disconnect.
            await previous?.value
            guard let self = self, self.generation == ticket else { return }
            var succeeded = false
            do {
                try await work(self, ticket)
                try self.ensureCurrent(ticket)
                succeeded = true
                if kind != .ranking {
                    self.profileError = nil
                    self.store.acknowledgeProfileOperation(statusMessage: self.message)
                }
            } catch {
                guard self.generation == ticket else { return }
                let text = Self.friendlyError(error)
                self.rankingError = text
                if kind != .ranking {
                    self.profileError = text
                    self.store.acknowledgeProfileOperation(error: text)
                }
                self.message = self.pendingDelete
                    ? "Die Entfernung wurde noch nicht bestätigt. Bitte erneut versuchen."
                    : "Gespeicherter Stand · deine lokalen Trainings bleiben erhalten."
            }
            guard self.generation == ticket else { return }
            self.busy = false
            self.profileBusy = false
            self.operation = nil
            self.persist()
            self.onChange?()
            if succeeded && self.optedIn && self.enrolled && !self.pendingDelete {
                if self.queuedProfileSync { self.syncProfileIfEnabled() }
                else if self.currentSyncKey() != self.syncedKey { self.syncTrainingIfEnabled() }
            }
        }
    }

    private func ensureCurrent(_ ticket: UInt64) throws {
        guard ticket == generation, !Task.isCancelled else { throw CancellationError() }
    }

    private func finishDisconnect() {
        optedIn = false; enrolled = false; pendingDelete = false; needsUpload = false
        queuedProfileSync = false; syncedKey = ""; entries = []; lastUpdated = 0
        caches = [:]
        profileError = nil
        message = "Dein Ranglisten-Eintrag wurde entfernt. Deine Trainings bleiben auf diesem Gerät."
        persist()
        store.acknowledgeProfileOperation(statusMessage: message)
    }

    private func upload(ticket: UInt64) async throws {
        guard let name = Self.normalizeName(nickname) else {
            throw OnlineError.message("Dein Hunter-Name braucht 2 bis 20 Zeichen.")
        }
        let totals = trainingTotals()
        let targetKey = name + ":" + totals.key
        let token = try await accessToken(ticket: ticket)
        let member = try memberName(uid: ownUID)
        for attempt in 0..<3 {
            let existing = try await getMember(uid: ownUID, token: token, ticket: ticket)
            var fields: [String: Any] = ["name": ["stringValue": name],
                                       "totalXp": Self.firestoreInt(totals.total),
                                       "weekXp": Self.firestoreInt(totals.week),
                                       "weekStart": Self.firestoreInt(totals.weekStart)]
            var transforms: [[String: Any]] = [["fieldPath": "updatedAt", "setToServerValue": "REQUEST_TIME"]]
            if let previous = existing?["fields"] as? [String: Any],
               let joined = previous["joinedAt"] as? [String: Any],
               let value = joined["timestampValue"] as? String, Self.timestampMillis(value) != nil {
                fields["joinedAt"] = ["timestampValue": value]
            } else { transforms.append(["fieldPath": "joinedAt", "setToServerValue": "REQUEST_TIME"]) }
            var write: [String: Any] = ["update": ["name": member, "fields": fields], "updateTransforms": transforms]
            if let updateTime = existing?["updateTime"] as? String {
                write["currentDocument"] = ["updateTime": updateTime]
            } else { write["currentDocument"] = ["exists": false] }
            do {
                _ = try await firestore(path: databasePath + "/documents:commit", method: "POST",
                                        body: ["writes": [write]], ticket: ticket)
                try ensureCurrent(ticket)
                syncedKey = targetKey
                needsUpload = currentSyncKey() != targetKey
                persist()
                return
            } catch let error as HTTPError where attempt < 2 && error.isConflict {
                continue
            }
        }
        throw OnlineError.message("Dein Eintrag wurde gleichzeitig geändert. Bitte erneut aktualisieren.")
    }

    private func fetchRanking(ticket: UInt64) async throws {
        let totals = trainingTotals()
        let requestedPeriod = period
        let sort = requestedPeriod == "week" ? "weekXp" : "totalXp"
        var query: [String: Any] = ["from": [["collectionId": "members"]],
                                   "orderBy": [["field": ["fieldPath": sort], "direction": "DESCENDING"],
                                               ["field": ["fieldPath": "__name__"], "direction": "ASCENDING"]],
                                   "limit": 50]
        if requestedPeriod == "week" {
            query["where"] = ["fieldFilter": ["field": ["fieldPath": "weekStart"],
                                               "op": "EQUAL", "value": Self.firestoreInt(totals.weekStart)]]
        }
        let payload = try await firestore(path: databasePath + "/documents/leaderboards/global:runQuery",
                                          method: "POST", body: ["structuredQuery": query], ticket: ticket)
        guard let rows = payload as? [[String: Any]] else { throw OnlineError.invalidResponse }
        var seen = Set<String>()
        let ranking = rows.compactMap { row -> [String: Any]? in
            guard let document = row["document"] as? [String: Any],
                  let entry = Self.memberEntry(document, currentWeek: totals.weekStart),
                  let uid = entry["uid"] as? String, seen.insert(uid).inserted else { return nil }
            return entry
        }
        try ensureCurrent(ticket)
        guard period == requestedPeriod, trainingTotals().weekStart == totals.weekStart else { return }
        entries = Array(ranking.prefix(50))
        cachedWeekStart = totals.weekStart
        lastUpdated = Self.nowMillis()
        caches[requestedPeriod] = RankingCache(entries: entries, updatedAt: lastUpdated, weekStart: cachedWeekStart)
        persist()
    }

    private func getMember(uid: String, token: String, ticket: UInt64) async throws -> [String: Any]? {
        let name = try memberName(uid: uid)
        do {
            return try await firestore(path: name, method: "GET", body: nil, ticket: ticket) as? [String: Any]
        } catch let error as HTTPError where error.status == 404 { return nil }
    }

    private var databasePath: String { "projects/\(config?.projectID ?? "")/databases/(default)" }
    private func memberName(uid: String) throws -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
        guard Self.validUID(uid), let escaped = uid.addingPercentEncoding(withAllowedCharacters: allowed) else {
            throw OnlineError.identityLost
        }
        return databasePath + "/documents/leaderboards/global/members/" + escaped
    }

    private func firestore(path: String, method: String, body: [String: Any]?, ticket: UInt64,
                           retryAuth: Bool = true) async throws -> Any {
        let token = try await accessToken(ticket: ticket)
        guard let url = URL(string: "https://firestore.googleapis.com/v1/" + path) else { throw OnlineError.invalidResponse }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        if let body = body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        do { return try await send(request, ticket: ticket) }
        catch let error as HTTPError where retryAuth && error.status == 401 {
            idToken = nil; tokenExpiresAt = .distantPast
            return try await firestore(path: path, method: method, body: body, ticket: ticket, retryAuth: false)
        }
    }

    private func accessToken(ticket: UInt64) async throws -> String {
        try ensureCurrent(ticket)
        guard optedIn || pendingDelete, let config = config else { throw OnlineError.notConfigured }
        if let token = idToken, tokenExpiresAt.timeIntervalSinceNow > 60 { return token }
        if let saved = identity {
            var request = URLRequest(url: try config.authURL(host: "securetoken.googleapis.com", path: "/v1/token"))
            request.httpMethod = "POST"
            request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))
            guard let escaped = saved.refreshToken.addingPercentEncoding(withAllowedCharacters: allowed) else {
                throw OnlineError.invalidResponse
            }
            request.httpBody = Data(("grant_type=refresh_token&refresh_token=" + escaped).utf8)
            guard let response = try await send(request, ticket: ticket) as? [String: Any],
                  let token = response["id_token"] as? String,
                  let uid = response["user_id"] as? String,
                  let refresh = response["refresh_token"] as? String,
                  let expiry = Self.expiry(response["expires_in"]), Self.validUID(uid), !token.isEmpty, !refresh.isEmpty else {
                throw OnlineError.invalidResponse
            }
            guard uid == saved.uid, ownUID.isEmpty || uid == ownUID else { throw OnlineError.identityLost }
            try installIdentity(Identity(uid: uid, refreshToken: refresh), token: token, expiry: expiry)
            return token
        }
        // Never silently create a new account for a previously published member.
        guard !enrolled, !pendingDelete || ownUID.isEmpty else { throw OnlineError.identityLost }
        var request = URLRequest(url: try config.authURL(host: "identitytoolkit.googleapis.com", path: "/v1/accounts:signUp"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["returnSecureToken": true])
        guard let response = try await send(request, ticket: ticket) as? [String: Any],
              let token = response["idToken"] as? String,
              let uid = response["localId"] as? String,
              let refresh = response["refreshToken"] as? String,
              let expiry = Self.expiry(response["expiresIn"]), Self.validUID(uid), !token.isEmpty, !refresh.isEmpty else {
            throw OnlineError.invalidResponse
        }
        try installIdentity(Identity(uid: uid, refreshToken: refresh), token: token, expiry: expiry)
        return token
    }

    private func installIdentity(_ identity: Identity, token: String, expiry: TimeInterval) throws {
        try keychain.write(identity)
        self.identity = identity
        ownUID = identity.uid
        idToken = token
        tokenExpiresAt = Date().addingTimeInterval(expiry)
        persist()
    }

    private func send(_ request: URLRequest, ticket: UInt64) async throws -> Any {
        try ensureCurrent(ticket)
        let (data, response) = try await session.data(for: request)
        try ensureCurrent(ticket)
        guard let http = response as? HTTPURLResponse, data.count <= 2_000_000 else { throw OnlineError.invalidResponse }
        let payload: Any = data.isEmpty ? [:] : (try JSONSerialization.jsonObject(with: data))
        guard (200..<300).contains(http.statusCode) else {
            let envelope = (payload as? [String: Any])?["error"] as? [String: Any]
            throw HTTPError(status: http.statusCode,
                            code: envelope?["status"] as? String ?? "",
                            detail: envelope?["message"] as? String ?? "")
        }
        return payload
    }

    private func persist() {
        defaults.set(optedIn, forKey: prefix + "optedIn")
        defaults.set(enrolled, forKey: prefix + "enrolled")
        defaults.set(pendingDelete, forKey: prefix + "pendingDelete")
        defaults.set(ownUID, forKey: prefix + "uid")
        defaults.set(nickname, forKey: prefix + "nickname")
        defaults.set(period, forKey: prefix + "period")
        defaults.set(syncedKey, forKey: prefix + "syncedKey")
        defaults.set(needsUpload, forKey: prefix + "needsUpload")
        if let data = try? JSONSerialization.data(withJSONObject: ["entries": entries, "lastUpdated": lastUpdated,
                                                                  "weekStart": cachedWeekStart]) {
            defaults.set(data, forKey: prefix + "cache")
        }
        if let data = try? JSONSerialization.data(withJSONObject: caches.mapValues { $0.dictionary }) {
            defaults.set(data, forKey: prefix + "periodCaches")
        }
    }

    private func configurationError() { rankingError = OnlineError.notConfigured.localizedDescription; onChange?() }
    private func currentSyncKey() -> String { nickname + ":" + trainingTotals().key }

    private struct Totals {
        let total: Int64
        let week: Int64
        let weekStart: Int64
        var key: String { "\(total):\(week):\(weekStart)" }
    }
    private func trainingTotals() -> Totals {
        let now = Self.nowMillis()
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let date = Date(timeIntervalSince1970: Double(now) / 1_000)
        let day = calendar.startOfDay(for: date)
        let daysSinceMonday = (calendar.component(.weekday, from: day) + 5) % 7
        let monday = calendar.date(byAdding: .day, value: -daysSinceMonday, to: day)!
        let start = Int64(monday.timeIntervalSince1970 * 1_000)
        var total: Int64 = 0, week: Int64 = 0
        var seen = Set<String>()
        for workout in store.workouts {
            guard ["run", "pushups", "squats"].contains(workout["type"] as? String ?? "") else { continue }
            let id = workout["id"] as? String ?? ""
            guard id.isEmpty || seen.insert(id).inserted else { continue }
            let xp = min(1_000_000_000, Self.integer(workout["xp"]))
            total = min(1_000_000_000, total + xp)
            let timestamp = Self.integer(workout["timestamp"])
            if timestamp >= start && timestamp <= now { week = min(1_000_000_000, week + xp) }
        }
        return Totals(total: total, week: week, weekStart: start)
    }

    private static func memberEntry(_ document: [String: Any], currentWeek: Int64) -> [String: Any]? {
        guard let path = document["name"] as? String, let uid = path.split(separator: "/").last.map(String.init),
              validUID(uid), let fields = document["fields"] as? [String: Any],
              let nameField = fields["name"] as? [String: Any],
              let name = normalizeName(nameField["stringValue"] as? String ?? ""),
              let total = fieldInt(fields["totalXp"]), let week = fieldInt(fields["weekXp"]),
              let weekStart = fieldInt(fields["weekStart"]),
              (0...1_000_000_000).contains(total), (0...total).contains(week), weekStart >= 0,
              let update = fields["updatedAt"] as? [String: Any],
              let timestamp = update["timestampValue"] as? String,
              let updatedAt = timestampMillis(timestamp) else { return nil }
        return ["uid": uid, "name": name, "totalXp": total,
                "weekXp": weekStart == currentWeek ? week : 0, "weekStart": weekStart,
                "active": true, "updatedAt": updatedAt]
    }

    private static func cleanEntry(_ entry: [String: Any]) -> [String: Any]? {
        guard let uid = entry["uid"] as? String, validUID(uid),
              let name = normalizeName(entry["name"] as? String ?? "") else { return nil }
        let total = min(1_000_000_000, integer(entry["totalXp"]))
        return ["uid": uid, "name": name, "totalXp": total, "weekXp": min(total, integer(entry["weekXp"])),
                "weekStart": integer(entry["weekStart"]), "updatedAt": integer(entry["updatedAt"]),
                "active": entry["active"] as? Bool ?? true]
    }

    private static func normalizeName(_ name: String) -> String? {
        guard !name.unicodeScalars.contains(where: { $0.value < 32 || (127...159).contains($0.value) }) else { return nil }
        let value = name.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
        return (2...20).contains(value.unicodeScalars.count) ? value : nil
    }
    private static func validUID(_ uid: String) -> Bool {
        !uid.isEmpty && uid.utf8.count <= 128 && uid.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil
    }
    private static func integer(_ value: Any?) -> Int64 {
        if let string = value as? String { return max(0, Int64(string) ?? 0) }
        guard let number = value as? NSNumber, number.doubleValue.isFinite else { return 0 }
        return Int64(max(0, min(9_007_199_254_740_991, number.doubleValue)).rounded(.down))
    }
    private static func fieldInt(_ value: Any?) -> Int64? {
        guard let field = value as? [String: Any], let value = field["integerValue"] as? String else { return nil }
        return Int64(value)
    }
    private static func firestoreInt(_ value: Int64) -> [String: Any] { ["integerValue": String(value)] }
    private static func nowMillis() -> Int64 { Int64((Date().timeIntervalSince1970 * 1_000).rounded(.down)) }
    private static func expiry(_ value: Any?) -> TimeInterval? {
        let seconds = (value as? String).flatMap(Double.init) ?? (value as? NSNumber)?.doubleValue
        guard let seconds = seconds, seconds.isFinite, seconds > 0, seconds <= 86_400 else { return nil }
        return seconds
    }
    private static func timestampMillis(_ timestamp: String) -> Int64? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let regular = ISO8601DateFormatter()
        guard let date = fractional.date(from: timestamp) ?? regular.date(from: timestamp),
              date.timeIntervalSince1970 >= 0 else { return nil }
        return Int64((date.timeIntervalSince1970 * 1_000).rounded(.down))
    }

    private struct Configuration {
        let projectID: String
        let apiKey: String
        static func read() -> Configuration? {
            guard let url = Bundle.main.url(forResource: "firebase-config", withExtension: "json", subdirectory: "web"),
                  let data = try? Data(contentsOf: url), data.count <= 16_384,
                  let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let project = object["projectId"] as? String,
                  project.range(of: "^[a-z][a-z0-9-]{4,61}[a-z0-9]$", options: .regularExpression) != nil,
                  let key = object["apiKey"] as? String, key.hasPrefix("AIza"), key.utf8.count <= 256 else { return nil }
            return Configuration(projectID: project, apiKey: key)
        }
        func authURL(host: String, path: String) throws -> URL {
            var components = URLComponents()
            components.scheme = "https"; components.host = host; components.path = path
            components.queryItems = [URLQueryItem(name: "key", value: apiKey)]
            guard let url = components.url else { throw OnlineError.invalidResponse }
            return url
        }
    }

    private struct Identity: Codable { let uid: String; let refreshToken: String }
    private struct IdentityKeychain {
        let service: String
        private var query: [String: Any] {
            [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
             kSecAttrAccount as String: "anonymous"]
        }
        func read() throws -> Identity? {
            var query = self.query
            query[kSecReturnData as String] = true
            query[kSecMatchLimit as String] = kSecMatchLimitOne
            var result: CFTypeRef?
            let status = SecItemCopyMatching(query as CFDictionary, &result)
            if status == errSecItemNotFound { return nil }
            guard status == errSecSuccess, let data = result as? Data else { throw OnlineError.keychain }
            let identity = try JSONDecoder().decode(Identity.self, from: data)
            guard !identity.uid.isEmpty, identity.uid.utf8.count <= 128,
                  identity.uid.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil,
                  !identity.refreshToken.isEmpty else { throw OnlineError.keychain }
            return identity
        }
        func write(_ identity: Identity) throws {
            let data = try JSONEncoder().encode(identity)
            let attributes: [String: Any] = [kSecValueData as String: data,
                                             kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
            let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
            if status == errSecItemNotFound {
                var item = query
                attributes.forEach { item[$0.key] = $0.value }
                guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw OnlineError.keychain }
            } else if status != errSecSuccess { throw OnlineError.keychain }
        }
    }

    private struct HTTPError: Error {
        let status: Int
        let code: String
        let detail: String
        var isConflict: Bool { status == 409 || code == "ABORTED" || code == "FAILED_PRECONDITION" }
    }
    private enum OnlineError: LocalizedError {
        case notConfigured, invalidResponse, identityLost, keychain, message(String)
        var errorDescription: String? {
            switch self {
            case .notConfigured: return "Der Online-Dienst ist noch nicht eingerichtet."
            case .invalidResponse: return "Der Online-Dienst hat eine ungültige Antwort gesendet. Bitte erneut versuchen."
            case .identityLost: return "Der Zugang zu deinem Gastprofil fehlt oder hat sich geändert. Dein vorhandener Eintrag kann mit dieser Installation nicht geändert werden."
            case .keychain: return "Dein Gastprofil konnte nicht sicher im iPhone-Schlüsselbund gespeichert werden."
            case .message(let message): return message
            }
        }
    }
    private static func friendlyError(_ error: Error) -> String {
        if let url = error as? URLError {
            if url.code == .timedOut { return "Die Verbindung dauert zu lange. Bitte später erneut versuchen." }
            return "Keine Verbindung zur Hunter-Rangliste. Dein gespeicherter Stand bleibt erhalten."
        }
        if let http = error as? HTTPError {
            let code = (http.code + " " + http.detail).uppercased()
            if code.contains("OPERATION_NOT_ALLOWED") {
                return "Die Gastanmeldung ist im Firebase-Projekt nicht freigeschaltet. Der Projektbesitzer muss anonyme Anmeldung aktivieren."
            }
            if code.contains("API_KEY") || code.contains("APP_TOKEN") || code.contains("APP_CHECK") {
                return "Die Firebase-Konfiguration erlaubt diese iOS-Verbindung noch nicht. Der Projektbesitzer muss API-Schlüssel- und App-Zugriffsregeln prüfen."
            }
            if code.contains("INVALID_REFRESH_TOKEN") || code.contains("TOKEN_EXPIRED") || code.contains("USER_DISABLED") || code.contains("USER_NOT_FOUND") {
                return "Der Zugang zu deinem Gastprofil ist nicht mehr gültig. Deine lokalen Trainings bleiben erhalten."
            }
            if http.code == "FAILED_PRECONDITION" { return "Die Rangliste benötigt noch einen Firestore-Index oder eine passende Datenbankkonfiguration." }
            if http.status == 401 { return "Die Gastanmeldung konnte nicht bestätigt werden. Bitte erneut verbinden." }
            if http.status == 403 || http.code == "PERMISSION_DENIED" { return "Die Firebase-Zugriffsregeln erlauben diese Verbindung noch nicht. Der Projektbesitzer muss die Ranglisten-Regeln prüfen." }
            if http.status == 429 { return "Der Online-Dienst hat zu viele Anfragen erhalten. Bitte etwas warten." }
            if http.status >= 500 { return "Der Online-Dienst ist vorübergehend nicht erreichbar. Bitte später erneut versuchen." }
            if http.isConflict { return "Dein Ranglisten-Eintrag wurde gleichzeitig geändert. Bitte erneut versuchen." }
            return "Die Hunter-Rangliste konnte nicht aktualisiert werden. Dein gespeicherter Stand bleibt erhalten."
        }
        return error.localizedDescription
    }
}
