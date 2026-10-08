import { ILogger } from '../../domain/ports/ILogger.js';

export interface RetryPolicyOptions {
  readonly maxRetries: number;
  readonly initialDelayMs: number;
  readonly backoffFactor?: number;
  readonly maxDelayMs?: number;
}

export type SleepFn = (ms: number) => Promise<void>;

export class RetryPolicy {
  private readonly backoffFactor: number;
  private readonly maxDelayMs: number;

  constructor(
    private readonly operationName: string,
    private readonly options: RetryPolicyOptions,
    private readonly logger: ILogger,
    private readonly sleepFn: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
    this.backoffFactor = options.backoffFactor ?? 2;
    this.maxDelayMs = options.maxDelayMs ?? 30000;
  }

  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    let delay = this.options.initialDelayMs;

    while (attempt <= this.options.maxRetries) {
      try {
        return await fn();
      } catch (error) {
        attempt++;
        if (attempt > this.options.maxRetries) {
          this.logger.error(
            `Operation '${this.operationName}' failed after max ${this.options.maxRetries} retries`,
            error,
          );
          throw error;
        }

        this.logger.warn(
          `Operation '${this.operationName}' failed (attempt ${attempt}/${this.options.maxRetries}). Retrying in ${delay}ms...`,
          { error: error instanceof Error ? error.message : String(error) },
        );

        await this.sleepFn(delay);
        delay = Math.min(delay * this.backoffFactor, this.maxDelayMs);
      }
    }

    throw new Error(`Unreachable retry state for operation '${this.operationName}'`);
  }
}
