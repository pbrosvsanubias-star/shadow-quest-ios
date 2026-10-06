import Foundation

@main
enum CameraRepCounterTests {
    static func main() {
        var counter = CameraRepCounter(configuration: .init(upperAngle: 155, lowerAngle: 105))
        var time: TimeInterval = 0
        func hold(_ angle: Double?, for duration: TimeInterval) {
            let samples = Int(ceil(duration / 0.1))
            for _ in 0..<samples {
                _ = counter.observe(angle: angle, at: time)
                time += 0.1
            }
        }
        hold(90, for: 1)
        hold(170, for: 1)
        precondition(counter.count == 0, "Starting in the lower position must not count.")
        hold(90, for: 0.8)
        hold(170, for: 0.8)
        precondition(counter.count == 1, "A stable up/down/up cycle must count once.")
        hold(170, for: 1)
        precondition(counter.count == 1, "A static pose must not count again.")
        hold(90, for: 0.8)
        hold(nil, for: 0.1)
        hold(170, for: 1)
        precondition(counter.count == 1, "Body loss must discard the incomplete repetition.")
        hold(90, for: 0.8)
        counter.recalibrate()
        hold(170, for: 1)
        precondition(counter.count == 1, "Recalibration must discard the incomplete repetition.")
        for _ in 0..<15 {
            hold(90, for: 0.1)
            hold(170, for: 0.1)
        }
        precondition(counter.count == 1, "Fast noisy threshold crossings must not count.")
        hold(170, for: 1)
        hold(90, for: 0.8)
        time += 1 // A frame gap invalidates the pending lower-to-upper transition.
        hold(170, for: 1)
        precondition(counter.count == 1, "A long frame gap must not complete an old cycle.")
        hold(90, for: 0.8)
        hold(170, for: 0.8)
        precondition(counter.count == 2, "Tracking can count a new cycle after recovery.")
        counter.correctCount()
        precondition(counter.count == 1 && counter.phase == .setup)
        counter.resetCount()
        precondition(counter.count == 0 && !counter.tracking)
        counter.correctCount()
        precondition(counter.count == 0, "Correction must never create a negative count.")
        hold(.nan, for: 0.2)
        precondition(!counter.tracking && counter.phase == .setup)
        print("CameraRepCounter: all cycle, loss, gap, jitter and correction checks passed.")
    }
}
