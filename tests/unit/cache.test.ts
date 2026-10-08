import { describe, it, expect, beforeEach } from 'vitest';
import { FakeClock } from '../fakes/FakeClock.js';
import { InMemoryCache } from '../../src/infrastructure/system/InMemoryCache.js';

describe('InMemoryCache Tests', () => {
  let clock: FakeClock;
  let cache: InMemoryCache;

  beforeEach(() => {
    clock = new FakeClock();
    cache = new InMemoryCache(clock);
  });

  it('should store and retrieve an item before TTL expires', async () => {
    await cache.set('key-1', { message: 'hello' }, 60);

    const retrieved = await cache.get<{ message: string }>('key-1');
    expect(retrieved).toEqual({ message: 'hello' });
    expect(await cache.has('key-1')).toBe(true);
  });

  it('should return null and purge item after TTL expires', async () => {
    await cache.set('key-ttl', 'temp-data', 10); // 10 seconds

    expect(await cache.get('key-ttl')).toBe('temp-data');

    // Advance clock past TTL (11 seconds)
    clock.advanceSeconds(11);

    expect(await cache.get('key-ttl')).toBeNull();
    expect(await cache.has('key-ttl')).toBe(false);
  });

  it('should support delete and clear', async () => {
    await cache.set('a', 1, 60);
    await cache.set('b', 2, 60);
    expect(cache.size()).toBe(2);

    const deleted = await cache.delete('a');
    expect(deleted).toBe(true);
    expect(await cache.get('a')).toBeNull();
    expect(cache.size()).toBe(1);

    await cache.clear();
    expect(cache.size()).toBe(0);
    expect(await cache.get('b')).toBeNull();
  });
});
