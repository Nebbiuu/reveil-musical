import { describe, it, expect, beforeEach } from 'vitest';
import { FakeClock } from '../fakes/FakeClock.js';
import { SilentLogger } from '../fakes/SilentLogger.js';
import { RateLimiter } from '../../src/infrastructure/resilience/RateLimiter.js';
import { CircuitBreaker } from '../../src/infrastructure/resilience/CircuitBreaker.js';
import { RetryPolicy } from '../../src/infrastructure/resilience/RetryPolicy.js';
import { RateLimitExceededError, CircuitBreakerOpenError } from '../../src/domain/errors/DomainErrors.js';

describe('Resilience Mechanisms Tests', () => {
  let clock: FakeClock;
  let logger: SilentLogger;

  beforeEach(() => {
    clock = new FakeClock();
    logger = new SilentLogger();
  });

  describe('RateLimiter (~20 req/min)', () => {
    it('should allow requests within rate limit threshold', async () => {
      const limiter = new RateLimiter('iTunes', { maxRequests: 3, windowMs: 60000 }, clock);

      await expect(limiter.acquire()).resolves.not.toThrow();
      await expect(limiter.acquire()).resolves.not.toThrow();
      await expect(limiter.acquire()).resolves.not.toThrow();
      expect(limiter.currentCount()).toBe(3);
    });

    it('should throw RateLimitExceededError when limit is reached', async () => {
      const limiter = new RateLimiter('iTunes', { maxRequests: 2, windowMs: 60000 }, clock);

      await limiter.acquire();
      await limiter.acquire();

      await expect(limiter.acquire()).rejects.toThrowError(RateLimitExceededError);
    });

    it('should reset capacity once time window slides past', async () => {
      const limiter = new RateLimiter('iTunes', { maxRequests: 2, windowMs: 60000 }, clock);

      await limiter.acquire();
      await limiter.acquire();
      await expect(limiter.acquire()).rejects.toThrowError(RateLimitExceededError);

      // Advance clock by 61 seconds
      clock.advanceSeconds(61);

      // Now requests should be allowed again
      await expect(limiter.acquire()).resolves.not.toThrow();
      expect(limiter.currentCount()).toBe(1);
    });
  });

  describe('CircuitBreaker', () => {
    it('should stay CLOSED on successful calls', async () => {
      const cb = new CircuitBreaker(
        'TestService',
        { failureThreshold: 3, resetTimeoutMs: 10000 },
        clock,
        logger,
      );

      const res = await cb.execute(async () => 'OK');
      expect(res).toBe('OK');
      expect(cb.getState()).toBe('CLOSED');
    });

    it('should transition to OPEN after reaching failureThreshold', async () => {
      const cb = new CircuitBreaker(
        'TestService',
        { failureThreshold: 3, resetTimeoutMs: 10000 },
        clock,
        logger,
      );

      const fail = () => cb.execute(async () => { throw new Error('Downstream failure'); });

      await expect(fail()).rejects.toThrow('Downstream failure');
      expect(cb.getState()).toBe('CLOSED');

      await expect(fail()).rejects.toThrow('Downstream failure');
      expect(cb.getState()).toBe('CLOSED');

      await expect(fail()).rejects.toThrow('Downstream failure');
      // 3rd failure trips the breaker to OPEN
      expect(cb.getState()).toBe('OPEN');

      // Subsequent call is blocked immediately with CircuitBreakerOpenError without invoking inner fn
      let fnInvoked = false;
      await expect(
        cb.execute(async () => {
          fnInvoked = true;
          return 'should not run';
        }),
      ).rejects.toThrowError(CircuitBreakerOpenError);

      expect(fnInvoked).toBe(false);
    });

    it('should transition to HALF_OPEN after resetTimeoutMs and to CLOSED after recovery', async () => {
      const cb = new CircuitBreaker(
        'TestService',
        { failureThreshold: 2, resetTimeoutMs: 5000, successThreshold: 1 },
        clock,
        logger,
      );

      // Trigger 2 failures
      await expect(cb.execute(async () => { throw new Error('err 1'); })).rejects.toThrow();
      await expect(cb.execute(async () => { throw new Error('err 2'); })).rejects.toThrow();
      expect(cb.getState()).toBe('OPEN');

      // Advance clock less than reset timeout
      clock.advanceMs(4000);
      expect(cb.getState()).toBe('OPEN');

      // Advance clock past reset timeout
      clock.advanceMs(2000);
      expect(cb.getState()).toBe('HALF_OPEN');

      // Successful call in HALF_OPEN recovers to CLOSED
      const result = await cb.execute(async () => 'recovered');
      expect(result).toBe('recovered');
      expect(cb.getState()).toBe('CLOSED');
    });

    it('should re-trip to OPEN if call fails in HALF_OPEN state', async () => {
      const cb = new CircuitBreaker(
        'TestService',
        { failureThreshold: 2, resetTimeoutMs: 5000 },
        clock,
        logger,
      );

      await expect(cb.execute(async () => { throw new Error('err 1'); })).rejects.toThrow();
      await expect(cb.execute(async () => { throw new Error('err 2'); })).rejects.toThrow();
      expect(cb.getState()).toBe('OPEN');

      clock.advanceMs(6000);
      expect(cb.getState()).toBe('HALF_OPEN');

      // Failure in HALF_OPEN trips immediately to OPEN
      await expect(cb.execute(async () => { throw new Error('still down'); })).rejects.toThrow();
      expect(cb.getState()).toBe('OPEN');
    });
  });

  describe('RetryPolicy', () => {
    it('should succeed immediately if operation succeeds on first attempt', async () => {
      const retry = new RetryPolicy(
        'testOp',
        { maxRetries: 3, initialDelayMs: 10 },
        logger,
        async () => {},
      );

      let attempts = 0;
      const res = await retry.execute(async () => {
        attempts++;
        return 'success';
      });

      expect(res).toBe('success');
      expect(attempts).toBe(1);
    });

    it('should retry on failure and return result upon subsequent success', async () => {
      const sleepCalls: number[] = [];
      const fakeSleeper = async (ms: number) => {
        sleepCalls.push(ms);
      };

      const retry = new RetryPolicy(
        'testOp',
        { maxRetries: 3, initialDelayMs: 50, backoffFactor: 2 },
        logger,
        fakeSleeper,
      );

      let attempts = 0;
      const res = await retry.execute(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error(`Attempt ${attempts} failed`);
        }
        return 'recovered';
      });

      expect(res).toBe('recovered');
      expect(attempts).toBe(3);
      expect(sleepCalls).toEqual([50, 100]);
    });

    it('should exhaust retries and throw error when all attempts fail', async () => {
      const retry = new RetryPolicy(
        'testOp',
        { maxRetries: 2, initialDelayMs: 10 },
        logger,
        async () => {},
      );

      let attempts = 0;
      await expect(
        retry.execute(async () => {
          attempts++;
          throw new Error('Persistent error');
        }),
      ).rejects.toThrow('Persistent error');

      expect(attempts).toBe(3); // 1 initial + 2 retries
    });
  });
});
