import { afterEach, describe, expect, it, vi } from "vitest";
import { isWarmingUp, warmPrivacyFilter, WARMUP_LIMIT_MS } from "./warm";

const holder = globalThis as { privacyWarmth?: unknown };
afterEach(() => {
  delete holder.privacyWarmth;
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("warmPrivacyFilter", () => {
  it("loads once, however many times it is asked, and reports ready when the load ends", async () => {
    const load = vi.fn(async () => {});
    const first = warmPrivacyFilter(0, load);
    expect(first.state).toBe("loading");
    expect(warmPrivacyFilter(5, load)).toBe(first);
    await settle();
    expect(warmPrivacyFilter(10, load).state).toBe("ready");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reports a failed load and tries again only after a minute", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const load = vi.fn().mockRejectedValueOnce(new Error("sin red")).mockResolvedValueOnce(undefined);
    warmPrivacyFilter(0, load);
    await settle();
    expect(warmPrivacyFilter(30_000, load).state).toBe("failed");
    expect(load).toHaveBeenCalledTimes(1);
    expect(warmPrivacyFilter(61_000, load).state).toBe("loading");
    await settle();
    expect(warmPrivacyFilter(62_000, load).state).toBe("ready");
    error.mockRestore();
  });
});

describe("isWarmingUp", () => {
  it("holds a health check back only while the model is still loading in time", () => {
    expect(isWarmingUp({ state: "loading", startedAt: 0 }, 1000)).toBe(true);
    expect(isWarmingUp({ state: "loading", startedAt: 0 }, WARMUP_LIMIT_MS)).toBe(false);
    expect(isWarmingUp({ state: "ready", startedAt: 0 }, 1000)).toBe(false);
    expect(isWarmingUp({ state: "failed", startedAt: 0 }, 1000)).toBe(false);
  });
});
