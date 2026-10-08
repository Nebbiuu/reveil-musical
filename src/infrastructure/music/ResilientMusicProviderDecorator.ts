import { IMusicProvider } from '../../domain/ports/IMusicProvider.js';
import { Track } from '../../domain/models/Track.js';
import { RateLimiter } from '../resilience/RateLimiter.js';
import { CircuitBreaker } from '../resilience/CircuitBreaker.js';
import { RetryPolicy } from '../resilience/RetryPolicy.js';
import { ILogger } from '../../domain/ports/ILogger.js';

export interface ResilientDecoratorOptions {
  readonly rateLimiter?: RateLimiter;
  readonly circuitBreaker?: CircuitBreaker;
  readonly retryPolicy?: RetryPolicy;
}

export class ResilientMusicProviderDecorator implements IMusicProvider {
  public readonly providerName: string;
  private readonly rateLimiter: RateLimiter | undefined;
  private readonly circuitBreaker: CircuitBreaker | undefined;
  private readonly retryPolicy: RetryPolicy | undefined;

  private readonly logger: ILogger | undefined;

  constructor(
    private readonly inner: IMusicProvider,
    options: ResilientDecoratorOptions,
    logger?: ILogger,
  ) {
    this.providerName = `${inner.providerName}:Resilient`;
    this.rateLimiter = options.rateLimiter;
    this.circuitBreaker = options.circuitBreaker;
    this.retryPolicy = options.retryPolicy;
    this.logger = logger;
  }

  public async resolveTrack(query: string): Promise<Track> {
    this.logger?.debug(`Executing resilient resolution for ${this.inner.providerName}`, { query });
    const executeCall = async (): Promise<Track> => {
      if (this.rateLimiter) {
        await this.rateLimiter.acquire();
      }
      return this.inner.resolveTrack(query);
    };

    const callWithCircuitBreaker = async (): Promise<Track> => {
      if (this.circuitBreaker) {
        return this.circuitBreaker.execute(executeCall);
      }
      return executeCall();
    };

    if (this.retryPolicy) {
      return this.retryPolicy.execute(callWithCircuitBreaker);
    }

    return callWithCircuitBreaker();
  }
}
