// Reporting policy for the phone: decides, on every GPS reading, whether it is worth using network.
// No server imports: this file is meant to run in the browser.

const RAD = Math.PI / 180;
const EARTH_RADIUS_M = 6_371_000;

export type LatLon = [lat: number, lon: number];

/** Metres east and north to go from `a` to `b`. */
function displacement(a: LatLon, b: LatLon): [east: number, north: number] {
  return [(b[1] - a[1]) * RAD * EARTH_RADIUS_M * Math.cos(a[0] * RAD), (b[0] - a[0]) * RAD * EARTH_RADIUS_M];
}

export const distanceMeters = (a: LatLon, b: LatLon) => Math.hypot(...displacement(a, b));

export type ReporterOptions = {
  /** Metres to move from the last report before sending another… */
  threshold?: number;
  /** …or this fraction of the accuracy the GPS declares, whichever is larger: less than that is noise. */
  accuracyFraction?: number;
  /** Minimum milliseconds between reports. */
  minIntervalMs?: number;
  /** Milliseconds without reporting after which a heartbeat says "still here". */
  heartbeatMs?: number;
  /** Weight of a new reading against what is accumulated while accuracy stays the same; 1 = no filter. */
  smoothing?: number;
  /** Readings with a worse accuracy than this (metres) are ignored. */
  discardAbove?: number;
};

export type Reporter = {
  /**
   * Returns the position to report, "heartbeat" when only presence has to be renewed, or null.
   * Pass `reading = null` when the GPS went quiet: nothing is filtered, it only decides whether a
   * report or a heartbeat is due. Repeating the last reading as if it were new drags the estimate.
   */
  (reading: LatLon | null, accuracy: number, timeMs: number): LatLon | "heartbeat" | null;
  /** Current filtered position. */
  estimate: LatLon | null;
};

export function createReporter({
  threshold = 3,
  accuracyFraction = 0.25,
  minIntervalMs = 1000,
  heartbeatMs = 30_000,
  smoothing = 0.5,
  discardAbove = 150,
}: ReporterOptions = {}): Reporter {
  let lastReported: LatLon | null = null;
  let lastReportAt = -Infinity;
  let lastReportedAccuracy = Infinity;
  let variance = 0;

  const report: Reporter = (reading, accuracy, timeMs) => {
    // Accuracy-weighted filter. The accumulated variance grows in proportion to itself: with a
    // steady accuracy the gain is `smoothing`, a much better reading replaces nearly everything
    // (a phone's first reading is usually coarse) and a much worse one barely moves it.
    const current = report.estimate;
    const noise = Math.max(accuracy, 1) ** 2;
    if (reading === null || accuracy > discardAbove) {
      if (!current) return null;
    } else if (!current || smoothing >= 1) {
      report.estimate = reading;
      variance = noise;
    } else {
      const predicted = variance / (1 - smoothing);
      const gain = predicted / (predicted + noise);
      report.estimate = [current[0] + gain * (reading[0] - current[0]), current[1] + gain * (reading[1] - current[1])];
      variance = (1 - gain) * predicted;
    }
    const estimate = report.estimate as LatLon;
    // The minimum interval does not hold back a much more precise reading: otherwise the coarse
    // one from start-up stays as the official position for several seconds.
    const muchBetter = accuracy < 0.6 * lastReportedAccuracy;
    if (timeMs - lastReportAt < minIntervalMs && !muchBetter) return null;
    if (
      !lastReported ||
      muchBetter ||
      distanceMeters(lastReported, estimate) >= Math.max(threshold, accuracyFraction * accuracy)
    ) {
      lastReported = estimate;
      lastReportAt = timeMs;
      lastReportedAccuracy = accuracy;
      return estimate;
    }
    if (timeMs - lastReportAt >= heartbeatMs) {
      lastReportAt = timeMs;
      return "heartbeat";
    }
    return null;
  };
  report.estimate = null;
  return report;
}
