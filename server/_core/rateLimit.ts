export type FixedWindowHitResult = {
  allowed: boolean;
  remaining: number;
};

export type FixedWindowLimiter = {
  consume(identity: string): FixedWindowHitResult;
  reset(): void;
};

export function createFixedWindowLimiter({
  key,
  maxHits,
  windowMs,
}: {
  key: string;
  maxHits: number;
  windowMs: number;
}): FixedWindowLimiter {
  const entries = new Map<string, { count: number; resetAt: number }>();

  return {
    consume(identity: string) {
      const now = Date.now();
      const cacheKey = `${key}:${identity}`;
      const existing = entries.get(cacheKey);

      if (!existing || existing.resetAt <= now) {
        entries.set(cacheKey, {
          count: 1,
          resetAt: now + windowMs,
        });
        return {
          allowed: true,
          remaining: maxHits - 1,
        };
      }

      if (existing.count >= maxHits) {
        return {
          allowed: false,
          remaining: 0,
        };
      }

      existing.count += 1;
      return {
        allowed: true,
        remaining: maxHits - existing.count,
      };
    },

    reset() {
      entries.clear();
    },
  };
}
