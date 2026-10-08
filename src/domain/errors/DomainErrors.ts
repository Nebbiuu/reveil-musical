export abstract class DomainError extends Error {
  public override readonly name: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, public readonly field?: string) {
    super(message);
  }
}

export class UserNotFoundError extends DomainError {
  constructor(public readonly userId: string) {
    super(`User with id '${userId}' was not found.`);
  }
}

export class MusicProviderError extends DomainError {
  constructor(
    message: string,
    public readonly providerName: string,
    public readonly causeError?: unknown,
  ) {
    super(`[${providerName}] ${message}`);
  }
}

export class NotificationChannelError extends DomainError {
  constructor(
    message: string,
    public readonly channel: string,
    public readonly causeError?: unknown,
  ) {
    super(`[${channel}] ${message}`);
  }
}

export class RateLimitExceededError extends DomainError {
  constructor(public readonly resource: string, public readonly retryAfterMs: number) {
    super(`Rate limit exceeded for resource '${resource}'. Retry after ${retryAfterMs}ms.`);
  }
}

export class CircuitBreakerOpenError extends DomainError {
  constructor(public readonly serviceName: string) {
    super(`Circuit breaker is OPEN for service '${serviceName}'. Requests are currently blocked.`);
  }
}
