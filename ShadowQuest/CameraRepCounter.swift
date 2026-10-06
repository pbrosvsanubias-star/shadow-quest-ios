import Foundation

/// A conservative angle-based repetition cycle. It performs no camera or file I/O.
/// Every repetition must begin at a stable upper position, reach a stable lower
/// position, then return to the upper position while the body remains visible.
struct CameraRepCounter {
    enum Phase: String { case setup, up, down }

    struct Configuration {
        let upperAngle: Double
        let lowerAngle: Double
        var acquisitionDuration: TimeInterval = 0.40
        var upperDuration: TimeInterval = 0.22
        var lowerDuration: TimeInterval = 0.22
        var minimumCycleDuration: TimeInterval = 0.60
        var cooldown: TimeInterval = 0.65
        var maximumSampleGap: TimeInterval = 0.35
    }

    private enum Band: Equatable { case upper, middle, lower }

    let configuration: Configuration
    private(set) var count = 0
    private(set) var phase: Phase = .setup
    private(set) var tracking = false

    private var firstValidTime: TimeInterval?
    private var previousTime: TimeInterval?
    private var smoothedAngle: Double?
    private var candidateBand: Band?
    private var candidateSince: TimeInterval?
    private var cycleBegan: TimeInterval?
    private var lastCountedTime = -Double.infinity

    init(configuration: Configuration) {
        self.configuration = configuration
    }

    /// Invalid observations immediately discard an incomplete cycle. Counts survive.
    mutating func loseBody() {
        phase = .setup
        tracking = false
        firstValidTime = nil
        previousTime = nil
        smoothedAngle = nil
        candidateBand = nil
        candidateSince = nil
        cycleBegan = nil
    }

    mutating func recalibrate() { loseBody() }

    mutating func resetCount() {
        count = 0
        lastCountedTime = -Double.infinity
        loseBody()
    }

    mutating func correctCount() {
        count = max(0, count - 1)
        loseBody()
    }

    /// Returns true only on the sample that completes a full repetition.
    @discardableResult
    mutating func observe(angle: Double?, at time: TimeInterval) -> Bool {
        guard let angle, angle.isFinite, (0...180).contains(angle), time.isFinite else {
            loseBody()
            return false
        }
        if let previousTime,
           time <= previousTime || time - previousTime > configuration.maximumSampleGap {
            loseBody()
        }
        let delta = previousTime.map { time - $0 } ?? 0
        previousTime = time
        if firstValidTime == nil { firstValidTime = time }

        // A time-based low-pass filter avoids depending on a specific camera FPS.
        if let previousAngle = smoothedAngle {
            let alpha = 1 - exp(-max(delta, 0) / 0.085)
            smoothedAngle = previousAngle + alpha * (angle - previousAngle)
        } else {
            smoothedAngle = angle
        }
        guard time - (firstValidTime ?? time) >= configuration.acquisitionDuration,
              let filtered = smoothedAngle else { return false }
        tracking = true

        let band: Band = filtered >= configuration.upperAngle ? .upper
            : filtered <= configuration.lowerAngle ? .lower : .middle
        if candidateBand != band {
            candidateBand = band
            candidateSince = time
        }
        guard let since = candidateSince else { return false }
        let hold = band == .lower ? configuration.lowerDuration : configuration.upperDuration
        guard band != .middle, time - since >= hold else { return false }

        switch (phase, band) {
        case (.setup, .upper):
            phase = .up
            cycleBegan = nil
        case (.up, .lower):
            phase = .down
            cycleBegan = time
        case (.down, .upper):
            let complete = cycleBegan.map {
                time - $0 >= configuration.minimumCycleDuration
            } ?? false
            phase = .up
            cycleBegan = nil
            if complete && time - lastCountedTime >= configuration.cooldown {
                count = min(10_000, count + 1)
                lastCountedTime = time
                return true
            }
        default:
            break
        }
        return false
    }
}

