import { describe, expect, it } from "vitest";
import { createReporter, distanceMeters, type LatLon } from "./reporter";

const LAT = -33.45;
const LON = -70.65;
const M_PER_DEG = 111_194.9;
const at = (east: number, north = 0): LatLon => [
  LAT + north / M_PER_DEG,
  LON + east / (M_PER_DEG * Math.cos((LAT * Math.PI) / 180)),
];
const ORIGIN = at(0);

describe("createReporter", () => {
  it("reports the first reading, then only when it moved past the threshold", () => {
    const report = createReporter({ threshold: 5, accuracyFraction: 0, smoothing: 1 });
    expect(report(at(0), 5, 0)).toEqual(ORIGIN);
    expect(report(at(3), 5, 2000)).toBeNull();
    expect(report(at(6), 5, 4000)).toEqual(at(6));
  });

  it("treats movement below a fraction of the declared accuracy as noise", () => {
    const report = createReporter({ threshold: 3, accuracyFraction: 0.25, smoothing: 1 });
    report(at(0), 40, 0);
    expect(report(at(8), 40, 2000)).toBeNull(); // 8 m < 0.25 × 40 m
    expect(report(at(12), 40, 4000)).toEqual(at(12));
  });

  it("respects the minimum interval and sends a heartbeat when still", () => {
    const report = createReporter({
      threshold: 5,
      accuracyFraction: 0,
      smoothing: 1,
      minIntervalMs: 1000,
      heartbeatMs: 30_000,
    });
    report(at(0), 5, 0);
    expect(report(at(50), 5, 500)).toBeNull();
    expect(report(at(50), 5, 1000)).toEqual(at(50));
    expect(report(at(50), 5, 20_000)).toBeNull();
    expect(report(at(50), 5, 31_000)).toBe("heartbeat");
  });

  it("lets a much more precise reading through at once and takes its position", () => {
    const report = createReporter();
    report(at(110), 60, 0); // coarse start-up reading, 110 m off
    const precise = report(at(0), 15, 300);
    expect(precise).not.toBeNull();
    expect(distanceMeters(ORIGIN, precise as LatLon)).toBeLessThan(10);
  });

  it("barely moves on one much worse reading, and ignores useless ones", () => {
    const report = createReporter();
    for (let second = 0; second < 10; second++) report(at(0), 15, second * 1000);
    report(at(120), 100, 10_000);
    expect(distanceMeters(ORIGIN, report.estimate as LatLon)).toBeLessThan(5);
    report(at(300), 400, 11_000); // worse than discardAbove
    expect(distanceMeters(ORIGIN, report.estimate as LatLon)).toBeLessThan(5);
  });

  it("does not filter when the GPS went quiet: it only decides whether something is due", () => {
    const report = createReporter({ heartbeatMs: 30_000 });
    expect(report(null, 15, 0)).toBeNull(); // nothing to say before the first reading
    report(at(0), 15, 1000);
    const before = report.estimate;
    expect(report(null, 15, 5000)).toBeNull();
    expect(report.estimate).toEqual(before);
    expect(report(null, 15, 32_000)).toBe("heartbeat");
  });
});
