import { describe, expect, it, vi } from "vitest";
import { createFixedWindowLimiter } from "./_core/rateLimit";

describe("fixed window limiter", () => {
  it("blocks the third hit in a two-request window", () => {
    const limiter = createFixedWindowLimiter({
      key: "chat",
      maxHits: 2,
      windowMs: 60_000,
    });

    expect(limiter.consume("user-1").allowed).toBe(true);
    expect(limiter.consume("user-1").allowed).toBe(true);
    expect(limiter.consume("user-1").allowed).toBe(false);
  });

  it("allows the identity again after reset", () => {
    const limiter = createFixedWindowLimiter({
      key: "voice",
      maxHits: 1,
      windowMs: 60_000,
    });

    expect(limiter.consume("user-1").allowed).toBe(true);
    expect(limiter.consume("user-1").allowed).toBe(false);

    limiter.reset();

    expect(limiter.consume("user-1").allowed).toBe(true);
  });

  it("starts a fresh window after the expiry time passes", () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(1_000);

    const limiter = createFixedWindowLimiter({
      key: "tts",
      maxHits: 1,
      windowMs: 500,
    });

    expect(limiter.consume("user-1").allowed).toBe(true);
    expect(limiter.consume("user-1").allowed).toBe(false);

    nowSpy.mockReturnValue(1_501);

    expect(limiter.consume("user-1").allowed).toBe(true);

    nowSpy.mockRestore();
  });
});
