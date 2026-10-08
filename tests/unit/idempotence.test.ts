import { describe, it, expect, beforeEach } from 'vitest';
import { FakeClock } from '../fakes/FakeClock.js';
import { SilentLogger } from '../fakes/SilentLogger.js';
import { InMemoryCache } from '../../src/infrastructure/system/InMemoryCache.js';
import { InMemoryIdempotencyStore } from '../../src/infrastructure/system/InMemoryIdempotencyStore.js';
import { InMemoryUserPreferencesProvider } from '../../src/infrastructure/user/InMemoryUserPreferencesProvider.js';
import { DefaultTrackSelectionStrategy } from '../../src/domain/strategies/DefaultTrackSelectionStrategy.js';
import { SendWakeUpUseCase } from '../../src/application/use-cases/SendWakeUpUseCase.js';
import { NotificationChannelRegistry } from '../../src/infrastructure/notification/NotificationChannelRegistry.js';
import { INotificationChannel, NotificationPayload } from '../../src/domain/ports/INotificationChannel.js';
import { IMusicProvider } from '../../src/domain/ports/IMusicProvider.js';
import { Track } from '../../src/domain/models/Track.js';
import { DayOfWeek } from '../../src/domain/models/DayOfWeek.js';
import { Weather } from '../../src/domain/models/Weather.js';

class SpyMusicProvider implements IMusicProvider {
  public readonly providerName = 'SpyMusic';
  public resolveCount = 0;

  public async resolveTrack(query: string): Promise<Track> {
    this.resolveCount++;
    return { title: query, artist: 'Spy Artist' };
  }
}

class SpyNotificationChannel implements INotificationChannel {
  public readonly channelType = 'EMAIL';
  public sendCount = 0;

  public async send(_payload: NotificationPayload): Promise<void> {
    this.sendCount++;
  }
}

describe('Idempotency Tests (userId + date)', () => {
  let clock: FakeClock;
  let logger: SilentLogger;
  let cache: InMemoryCache;
  let idempotencyStore: InMemoryIdempotencyStore;
  let spyMusic: SpyMusicProvider;
  let spyChannel: SpyNotificationChannel;
  let useCase: SendWakeUpUseCase;

  beforeEach(() => {
    clock = new FakeClock('2026-10-08T07:00:00Z');
    logger = new SilentLogger();
    cache = new InMemoryCache(clock);
    idempotencyStore = new InMemoryIdempotencyStore(cache);

    spyMusic = new SpyMusicProvider();
    spyChannel = new SpyNotificationChannel();

    const registry = new NotificationChannelRegistry([spyChannel], logger);
    const userPrefs = new InMemoryUserPreferencesProvider([
      {
        userId: 'alice-idempotent',
        trackByWeather: { [Weather.SOLEIL]: 'Sun Theme' },
        fallbackTrack: 'Fallback Song',
        preferredChannel: 'EMAIL',
      },
    ]);

    useCase = new SendWakeUpUseCase({
      userPreferencesProvider: userPrefs,
      musicProvider: spyMusic,
      trackSelectionStrategy: new DefaultTrackSelectionStrategy(),
      notificationRegistry: registry,
      clock,
      logger,
      idempotencyStore,
      timeZone: 'Europe/Paris',
      locale: 'fr-FR',
      idempotencyTtlSeconds: 86400,
    });
  });

  it('should only resolve music and notify once when called multiple times on same date', async () => {
    // 1st invocation
    const result1 = await useCase.sendWakeUp('alice-idempotent', DayOfWeek.JEUDI, Weather.SOLEIL);
    expect(result1.track.title).toBe('Sun Theme');
    expect(spyMusic.resolveCount).toBe(1);
    expect(spyChannel.sendCount).toBe(1);

    // 2nd invocation (same day)
    const result2 = await useCase.sendWakeUp('alice-idempotent', DayOfWeek.JEUDI, Weather.SOLEIL);
    expect(result2).toEqual(result1);
    expect(spyMusic.resolveCount).toBe(1); // Not called again!
    expect(spyChannel.sendCount).toBe(1);  // Not notified again!

    // 3rd invocation (same day)
    const result3 = await useCase.sendWakeUp('alice-idempotent', DayOfWeek.JEUDI, Weather.SOLEIL);
    expect(result3).toEqual(result1);
    expect(spyMusic.resolveCount).toBe(1);
    expect(spyChannel.sendCount).toBe(1);
  });

  it('should process a new wake-up when date changes to next day', async () => {
    await useCase.sendWakeUp('alice-idempotent', DayOfWeek.JEUDI, Weather.SOLEIL);
    expect(spyMusic.resolveCount).toBe(1);

    // Advance clock to next day
    clock.advanceSeconds(86400);

    await useCase.sendWakeUp('alice-idempotent', DayOfWeek.VENDREDI, Weather.SOLEIL);
    expect(spyMusic.resolveCount).toBe(2);
    expect(spyChannel.sendCount).toBe(2);
  });
});
