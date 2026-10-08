import { IClock } from '../../domain/ports/IClock.js';
import { RateLimitExceededError } from '../../domain/errors/DomainErrors.js';

export interface RateLimiterOptions {
  readonly maxRequests: number;
  readonly windowMs: number;
}

export class RateLimiter {
  private readonly timestamps: number[] = [];

  constructor(
    private readonly resourceName: string,
    private readonly options: RateLimiterOptions,
    private readonly clock: IClock,
  ) {}

  public async acquire(): Promise<void> {
    const now = this.clock.now().getTime();
    const windowStart = now - this.options.windowMs;

    // Purge timestamps older than the window
    while (this.timestamps.length > 0 && (this.timestamps[0] ?? 0) <= windowStart) {
      this.timestamps.shift();
    }

    if (this.timestamps.length >= this.options.maxRequests) {
      const oldest = this.timestamps[0] ?? now;
      const retryAfterMs = Math.max(0, oldest + this.options.windowMs - now);
      throw new RateLimitExceededError(this.resourceName, retryAfterMs);
    }

    this.timestamps.push(now);
  }

  public currentCount(): number {
    const now = this.clock.now().getTime();
    const windowStart = now - this.options.windowMs;
    return this.timestamps.filter((ts) => ts > windowStart).length;
  }
}
