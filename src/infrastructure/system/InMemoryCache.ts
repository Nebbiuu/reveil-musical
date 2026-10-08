import { ICache } from '../../domain/ports/ICache.js';
import { IClock } from '../../domain/ports/IClock.js';

interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAtMs: number;
}

export class InMemoryCache implements ICache {
  private readonly store = new Map<string, CacheEntry<unknown>>();

  constructor(private readonly clock: IClock) {}

  public async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }

    if (this.clock.now().getTime() > entry.expiresAtMs) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  public async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const expiresAtMs = this.clock.now().getTime() + ttlSeconds * 1000;
    this.store.set(key, { value, expiresAtMs });
  }

  public async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  public async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  public async clear(): Promise<void> {
    this.store.clear();
  }

  public size(): number {
    return this.store.size;
  }
}
