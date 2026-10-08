import { describe, expect, it } from 'vitest';
import { buildApplicationContainer } from '../../src/composition-root/container.js';
import type { IMusicProvider } from '../../src/domain/ports/IMusicProvider.js';
import type { ILogger } from '../../src/domain/ports/ILogger.js';

const silentLogger: ILogger = { debug() {}, info() {}, warn() {}, error() {} } as unknown as ILogger;

const working = (name: string): IMusicProvider => ({
  providerName: name,
  resolveTrack: async () => ({ title: `title-${name}`, artist: `artist-${name}` }),
});

const broken = (name: string): IMusicProvider => ({
  providerName: name,
  resolveTrack: async () => {
    throw new Error(`${name} down`);
  },
});

const run = (providers: IMusicProvider[], userId: string, weather: string) =>
  buildApplicationContainer({ logger: silentLogger, customMusicProviders: providers })
    .sendWakeUpUseCase.sendWakeUp(userId, 'LUNDI', weather);

describe('degraded flag semantics', () => {
  it('is false when the first provider answers', async () => {
    const result = await run([working('A'), working('B')], 'user-alice', 'SOLEIL');
    expect(result.degraded).toBe(false);
    expect(result.track.title).toBe('title-A');
  });

  it('is true when the chain falls back to a later provider', async () => {
    const result = await run([broken('A'), working('B')], 'user-alice', 'SOLEIL');
    expect(result.degraded).toBe(true);
    expect(result.track.title).toBe('title-B');
  });

  it('is false when the weather is not covered (normal business case)', async () => {
    const result = await run([working('A')], 'user-bob-partial-weather', 'NEIGE');
    expect(result.degraded).toBe(false);
  });

  it('rejects loudly when every provider fails, including the user fallback track', async () => {
    await expect(run([broken('A'), broken('B')], 'user-alice', 'SOLEIL')).rejects.toThrow();
  });
});