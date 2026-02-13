type TokenBucketConfig = {
  capacity: number;
  refillPerMs: number;
};

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillPerMs: number;

  constructor(config: TokenBucketConfig) {
    this.capacity = config.capacity;
    this.refillPerMs = config.refillPerMs;
    this.tokens = config.capacity;
    this.lastRefill = Date.now();
  }

  take(cost = 1): number {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
      this.lastRefill = now;
    }
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return 0;
    }
    const needed = cost - this.tokens;
    return Math.ceil(needed / this.refillPerMs);
  }
}

const buckets = new Map<string, TokenBucket>();

export const getRateLimiter = (key: string, config: TokenBucketConfig) => {
  const existing = buckets.get(key);
  if (existing) return existing;
  const bucket = new TokenBucket(config);
  buckets.set(key, bucket);
  return bucket;
};
