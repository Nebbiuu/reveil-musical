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
import { MusicProviderChain } from '../../src/infrastructure/music/MusicProviderChain.js';
import { LocalFallbackMusicAdapter } from '../../src/infrastructure/music/LocalFallbackMusicAdapter.js';
import { ValidationError, UserNotFoundError, MusicProviderError, NotificationChannelError } from '../../src/domain/errors/DomainErrors.js';

class MockChannel implements INotificationChannel {
  public attempts = 0;
  constructor(
    public readonly channelType: string,
    private readonly shouldFail: boolean = false,
  ) {}

  public async send(_payload: NotificationPayload): Promise<void> {
    this.attempts++;
    if (this.shouldFail) {
      throw new NotificationChannelError(`Channel ${this.channelType} down`, this.channelType);
    }
  }
}

class MockFailingMusicProvider implements IMusicProvider {
  public attempts = 0;
  constructor(
    public readonly providerName: string,
    private readonly failsOnQuery?: string,
  ) {}

  public async resolveTrack(query: string): Promise<Track> {
    this.attempts++;
    if (!this.failsOnQuery || query === this.failsOnQuery) {
      throw new MusicProviderError(`Provider ${this.providerName} failed for ${query}`, this.providerName);
    }
    return { title: query, artist: `Artist of ${query}` };
  }
}

describe('Fallbacks & Degraded Modes Resilience Tests', () => {
  let clock: FakeClock;
  let logger: SilentLogger;
  let cache: InMemoryCache;
  let idempotencyStore: InMemoryIdempotencyStore;
  let userPrefs: InMemoryUserPreferencesProvider;

  beforeEach(() => {
    clock = new FakeClock();
    logger = new SilentLogger();
    cache = new InMemoryCache(clock);
    idempotencyStore = new InMemoryIdempotencyStore(cache);

    userPrefs = new InMemoryUserPreferencesProvider([
      {
        userId: 'user-full',
        trackByWeather: {
          [Weather.SOLEIL]: 'Sun Hit',
          [Weather.PLUIE]: 'Rain Hit',
        },
        fallbackTrack: 'Safe Fallback Song',
        preferredChannel: 'EMAIL',
        fallbackChannel: 'SMS',
      },
      {
        userId: 'user-partial',
        trackByWeather: {
          [Weather.SOLEIL]: 'Sun Hit',
          // NEIGE not covered
        },
        fallbackTrack: 'Safe Fallback Song',
        preferredChannel: 'EMAIL',
      },
    ]);
  });

  describe('Validation & User Not Found', () => {
    it('should throw ValidationError on empty or whitespace userId', async () => {
      const useCase = new SendWakeUpUseCase({
        userPreferencesProvider: userPrefs,
        musicProvider: new LocalFallbackMusicAdapter(logger),
        trackSelectionStrategy: new DefaultTrackSelectionStrategy(),
        notificationRegistry: new NotificationChannelRegistry([], logger),
        clock,
        logger,
        idempotencyStore,
        timeZone: 'Europe/Paris',
        locale: 'fr-FR',
        idempotencyTtlSeconds: 86400,
      });

      await expect(useCase.sendWakeUp('', DayOfWeek.LUNDI, Weather.SOLEIL)).rejects.toThrowError(
        ValidationError,
      );
      await expect(useCase.sendWakeUp('   ', DayOfWeek.LUNDI, Weather.SOLEIL)).rejects.toThrowError(
        ValidationError,
      );
    });

    it('should throw ValidationError on invalid dayOfWeek', async () => {
      const useCase = new SendWakeUpUseCase({
        userPreferencesProvider: userPrefs,
        musicProvider: new LocalFallbackMusicAdapter(logger),
        trackSelectionStrategy: new DefaultTrackSelectionStrategy(),
        notificationRegistry: new NotificationChannelRegistry([], logger),
        clock,
        logger,
        idempotencyStore,
        timeZone: 'Europe/Paris',
        locale: 'fr-FR',
        idempotencyTtlSeconds: 86400,
      });

      await expect(useCase.sendWakeUp('user-full', 'FUNDAY', Weather.SOLEIL)).rejects.toThrowError(
        ValidationError,
      );
    });

    it('should throw ValidationError on invalid weather', async () => {
      const useCase = new SendWakeUpUseCase({
        userPreferencesProvider: userPrefs,
        musicProvider: new LocalFallbackMusicAdapter(logger),
        trackSelectionStrategy: new DefaultTrackSelectionStrategy(),
        notificationRegistry: new NotificationChannelRegistry([], logger),
        clock,
        logger,
        idempotencyStore,
        timeZone: 'Europe/Paris',
        locale: 'fr-FR',
        idempotencyTtlSeconds: 86400,
      });

      await expect(useCase.sendWakeUp('user-full', DayOfWeek.LUNDI, 'GREY')).rejects.toThrowError(
        ValidationError,
      );
    });

    it('should throw UserNotFoundError when user does not exist', async () => {
      const useCase = new SendWakeUpUseCase({
        userPreferencesProvider: userPrefs,
        musicProvider: new LocalFallbackMusicAdapter(logger),
        trackSelectionStrategy: new DefaultTrackSelectionStrategy(),
        notificationRegistry: new NotificationChannelRegistry([], logger),
        clock,
        logger,
        idempotencyStore,
        timeZone: 'Europe/Paris',
        locale: 'fr-FR',
        idempotencyTtlSeconds: 86400,
      });

      await expect(useCase.sendWakeUp('non-existent-user', DayOfWeek.LUNDI, Weather.SOLEIL)).rejects.toThrowError(
        UserNotFoundError,
      );
    });
  });

  describe('Weather Not Covered Degraded Mode', () => {
    it('should switch to user fallback track and mark degraded: true when weather is uncovered', async () => {
      const emailChannel = new MockChannel('EMAIL', false);
      const registry = new NotificationChannelRegistry([emailChannel], logger);
      const musicProvider = new LocalFallbackMusicAdapter(logger);

      const useCase = new SendWakeUpUseCase({
        userPreferencesProvider: userPrefs,
        musicProvider,
        trackSelectionStrategy: new DefaultTrackSelectionStrategy(),
        notificationRegistry: registry,
        clock,
        logger,
        idempotencyStore,
        timeZone: 'Europe/Paris',
        locale: 'fr-FR',
        idempotencyTtlSeconds: 86400,
      });

      // user-partial has NO entry for NEIGE
      const result = await useCase.sendWakeUp('user-partial', DayOfWeek.MERCREDI, Weather.NEIGE);

      expect(result.degraded).toBe(true);
      expect(result.channelUsed).toBe('EMAIL');
      expect(result.track).toBeDefined();
    });
  });

  describe('Music Cascade Fallbacks', () => {
    it('should cascade to next music provider in chain when first provider fails', async () => {
      const failingP1 = new MockFailingMusicProvider('Provider-1'); // fails always
      const localFallback = new LocalFallbackMusicAdapter(logger);  // succeeds
      const chain = new MusicProviderChain([failingP1, localFallback], logger);

      const emailChannel = new MockChannel('EMAIL', false);
      const registry = new NotificationChannelRegistry([emailChannel], logger);

      const useCase = new SendWakeUpUseCase({
        userPreferencesProvider: userPrefs,
        musicProvider: chain,
        trackSelectionStrategy: new DefaultTrackSelectionStrategy(),
        notificationRegistry: registry,
        clock,
        logger,
        idempotencyStore,
        timeZone: 'Europe/Paris',
        locale: 'fr-FR',
        idempotencyTtlSeconds: 86400,
      });

      const result = await useCase.sendWakeUp('user-full', DayOfWeek.LUNDI, Weather.SOLEIL);

      expect(result.track).toBeDefined();
      expect(failingP1.attempts).toBe(1);
    });

    it('should cascade to user fallback track if primary track resolution fails completely', async () => {
      // Fails specifically for 'Sun Hit', but resolves 'Safe Fallback Song'
      const failingOnSunHit = new MockFailingMusicProvider('PrimaryProvider', 'Sun Hit');
      const emailChannel = new MockChannel('EMAIL', false);
      const registry = new NotificationChannelRegistry([emailChannel], logger);

      const useCase = new SendWakeUpUseCase({
        userPreferencesProvider: userPrefs,
        musicProvider: failingOnSunHit,
        trackSelectionStrategy: new DefaultTrackSelectionStrategy(),
        notificationRegistry: registry,
        clock,
        logger,
        idempotencyStore,
        timeZone: 'Europe/Paris',
        locale: 'fr-FR',
        idempotencyTtlSeconds: 86400,
      });

      const result = await useCase.sendWakeUp('user-full', DayOfWeek.LUNDI, Weather.SOLEIL);

      expect(result.degraded).toBe(true); // Cascade occurred!
      expect(result.track.title).toBe('Safe Fallback Song');
    });
  });

  describe('Notification Channel Cascade Fallbacks & Never Silence', () => {
    it('should cascade to user fallbackChannel when preferredChannel fails and mark degraded: true', async () => {
      const failingEmail = new MockChannel('EMAIL', true);  // fails
      const healthySms = new MockChannel('SMS', false);    // succeeds
      const registry = new NotificationChannelRegistry([failingEmail, healthySms], logger);

      const useCase = new SendWakeUpUseCase({
        userPreferencesProvider: userPrefs,
        musicProvider: new LocalFallbackMusicAdapter(logger),
        trackSelectionStrategy: new DefaultTrackSelectionStrategy(),
        notificationRegistry: registry,
        clock,
        logger,
        idempotencyStore,
        timeZone: 'Europe/Paris',
        locale: 'fr-FR',
        idempotencyTtlSeconds: 86400,
      });

      const result = await useCase.sendWakeUp('user-full', DayOfWeek.LUNDI, Weather.SOLEIL);

      expect(failingEmail.attempts).toBe(1);
      expect(healthySms.attempts).toBe(1);
      expect(result.channelUsed).toBe('SMS');
      expect(result.degraded).toBe(true);
    });

    it('should fallback to LOG_FALLBACK when all notification channels fail (never silence guarantee)', async () => {
      const failingEmail = new MockChannel('EMAIL', true);
      const failingSms = new MockChannel('SMS', true);
      const registry = new NotificationChannelRegistry([failingEmail, failingSms], logger);

      const useCase = new SendWakeUpUseCase({
        userPreferencesProvider: userPrefs,
        musicProvider: new LocalFallbackMusicAdapter(logger),
        trackSelectionStrategy: new DefaultTrackSelectionStrategy(),
        notificationRegistry: registry,
        clock,
        logger,
        idempotencyStore,
        timeZone: 'Europe/Paris',
        locale: 'fr-FR',
        idempotencyTtlSeconds: 86400,
      });

      const result = await useCase.sendWakeUp('user-full', DayOfWeek.LUNDI, Weather.SOLEIL);

      expect(failingEmail.attempts).toBe(1);
      expect(failingSms.attempts).toBe(1);
      expect(result.channelUsed).toBe('LOG_FALLBACK');
      expect(result.degraded).toBe(true);
      expect(result.track).toBeDefined();

      // Verify that structured log notification was recorded in logger
      const errorLog = logger.logs.find((l) => l.message.includes('CRITICAL: All notification channels failed'));
      expect(errorLog).toBeDefined();
    });
  });
});
