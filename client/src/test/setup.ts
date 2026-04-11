import { afterEach, vi } from "vitest";

type MatchMediaListener = (event: MediaQueryListEvent) => void;
type TurnstileStub = {
  render: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
};

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function createMatchMedia(query: string): MediaQueryList {
  const listeners = new Set<MatchMediaListener>();

  return {
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn((listener: MatchMediaListener) => {
      listeners.add(listener);
    }),
    removeListener: vi.fn((listener: MatchMediaListener) => {
      listeners.delete(listener);
    }),
    addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
      if (typeof listener === "function") {
        listeners.add(listener as MatchMediaListener);
      }
    }),
    removeEventListener: vi.fn(
      (_type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === "function") {
          listeners.delete(listener as MatchMediaListener);
        }
      }
    ),
    dispatchEvent: vi.fn((event: Event) => {
      listeners.forEach(listener => listener(event as MediaQueryListEvent));
      return true;
    }),
  } as MediaQueryList;
}

if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = createMatchMedia;
}

if (typeof globalThis !== "undefined" && !globalThis.ResizeObserver) {
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
}

if (typeof window !== "undefined") {
  window.scrollTo = vi.fn();
}

if (typeof HTMLElement !== "undefined") {
  HTMLElement.prototype.scrollTo = vi.fn();
}

if (typeof HTMLElement !== "undefined") {
  HTMLElement.prototype.scrollIntoView = vi.fn();
}

const globalTurnstile = globalThis as typeof globalThis & { turnstile?: TurnstileStub };

if (!globalTurnstile.turnstile) {
  globalTurnstile.turnstile = {
    render: vi.fn(),
    reset: vi.fn(),
    remove: vi.fn(),
    execute: vi.fn(),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});
