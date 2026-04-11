import { describe, expect, it, vi } from "vitest";

describe("test DOM setup", () => {
  it("mocks scroll helpers for jsdom", () => {
    expect(vi.isMockFunction(window.scrollTo)).toBe(true);
    expect(vi.isMockFunction(HTMLElement.prototype.scrollTo)).toBe(true);
    expect(vi.isMockFunction(HTMLElement.prototype.scrollIntoView)).toBe(true);
  });
});
