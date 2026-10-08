import { randomUUID } from 'node:crypto';
import { IIdGenerator } from '../../domain/ports/IIdGenerator.js';

export class UuidGenerator implements IIdGenerator {
  public generate(): string {
    return randomUUID();
  }
}
