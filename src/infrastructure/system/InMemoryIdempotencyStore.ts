import { IIdempotencyStore } from '../../domain/ports/IIdempotencyStore.js';
import { WakeUpResult } from '../../domain/models/WakeUpResult.js';
import { ICache } from '../../domain/ports/ICache.js';

export class InMemoryIdempotencyStore implements IIdempotencyStore {
  constructor(private readonly cache: ICache) {}

  public async get(key: string): Promise<WakeUpResult | null> {
    return this.cache.get<WakeUpResult>(key);
  }

  public async save(key: string, result: WakeUpResult, ttlSeconds: number): Promise<void> {
    await this.cache.set(key, result, ttlSeconds);
  }
}
