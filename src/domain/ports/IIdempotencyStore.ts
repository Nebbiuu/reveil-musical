import { WakeUpResult } from '../models/WakeUpResult.js';

export interface IIdempotencyStore {
  get(key: string): Promise<WakeUpResult | null>;
  save(key: string, result: WakeUpResult, ttlSeconds: number): Promise<void>;
}
