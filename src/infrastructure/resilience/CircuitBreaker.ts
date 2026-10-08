import { IClock } from '../../domain/ports/IClock.js';
import { ILogger } from '../../domain/ports/ILogger.js';
import { CircuitBreakerOpenError } from '../../domain/errors/DomainErrors.js';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  readonly failureThreshold: number;
  readonly resetTimeoutMs: number;
  readonly successThreshold?: number;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private openedAtMs = 0;

  constructor(
    private readonly serviceName: string,
    private readonly options: CircuitBreakerOptions,
    private readonly clock: IClock,
    private readonly logger: ILogger,
  ) {}

  public getState(): CircuitBreakerState {
    if (this.state === 'OPEN') {
      const now = this.clock.now().getTime();
      if (now - this.openedAtMs >= this.options.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        this.consecutiveSuccesses = 0;
        this.logger.info(`Circuit breaker for ${this.serviceName} entered HALF_OPEN state`);
      }
    }
    return this.state;
  }

  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.getState();
    if (currentState === 'OPEN') {
      this.logger.warn(`Circuit breaker blocked call to ${this.serviceName} (state: OPEN)`);
      throw new CircuitBreakerOpenError(this.serviceName);
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }

  private recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.consecutiveSuccesses++;
      const threshold = this.options.successThreshold ?? 1;
      if (this.consecutiveSuccesses >= threshold) {
        this.state = 'CLOSED';
        this.consecutiveFailures = 0;
        this.logger.info(`Circuit breaker for ${this.serviceName} transitioned to CLOSED`);
      }
    } else if (this.state === 'CLOSED') {
      this.consecutiveFailures = 0;
    }
  }

  private recordFailure(error: unknown): void {
    this.consecutiveFailures++;
    this.logger.warn(`Failure recorded on circuit breaker for ${this.serviceName}`, {
      consecutiveFailures: this.consecutiveFailures,
      state: this.state,
      error: error instanceof Error ? error.message : String(error),
    });

    if (this.state === 'HALF_OPEN' || this.consecutiveFailures >= this.options.failureThreshold) {
      this.state = 'OPEN';
      this.openedAtMs = this.clock.now().getTime();
      this.logger.error(`Circuit breaker for ${this.serviceName} tripped to OPEN`);
    }
  }

  public reset(): void {
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.openedAtMs = 0;
  }
}
