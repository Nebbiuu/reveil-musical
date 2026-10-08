import { describe, it, expect } from 'vitest';
import { FakeClock } from '../fakes/FakeClock.js';
import { SilentLogger } from '../fakes/SilentLogger.js';
import { InMemoryCache } from '../../src/infrastructure/system/InMemoryCache.js';
import { InMemoryIdempotencyStore } from '../../src/infrastructure/system/InMemoryIdempotencyStore.js';
import { InMemoryUserPreferencesProvider } from '../../src/infrastructure/user/InMemoryUserPreferencesProvider.js';
import { DefaultTrackSelectionStrategy } from '../../src/domain/strategies/DefaultTrackSelectionStrategy.js';
import { SendWakeUpUseCase } from '../../src/application/use-cases/SendWakeUpUseCase.js';
import { NotificationChannelRegistry } from '../../src/infrastructure/notification/NotificationChannelRegistry.js';
import { CircuitBreaker } from '../../src/infrastructure/resilience/CircuitBreaker.js';
import { DayOfWeek } from '../../src/domain/models/DayOfWeek.js';
import { Weather } from '../../src/domain/models/Weather.js';
import { IMusicProvider } from '../../src/domain/ports/IMusicProvider.js';
import { INotificationChannel, NotificationPayload } from '../../src/domain/ports/INotificationChannel.js';
import { buildApplicationContainer } from '../../src/composition-root/container.js';
import { asTrackResolver } from '../helpers/trackResolver.js';

class ChannelWithFailure implements INotificationChannel {
  constructor(public readonly channelType: string, private readonly fail: boolean) {}
  public async send(_payload: NotificationPayload): Promise<void> {
    if (this.fail) throw new Error(`${this.channelType} failed`);
  }
}

describe('Targeted Edge Cases for Comprehensive Branch Coverage', () => {
  it('should test CircuitBreaker reset method', () => {
    const clock = new FakeClock();
    const logger = new SilentLogger();
    const cb = new CircuitBreaker('Service', { failureThreshold: 1, resetTimeoutMs: 1000 }, clock, logger);
    cb.reset();
    expect(cb.getState()).toBe('CLOSED');
  });

  it('should test NotificationChannelRegistry overwrite warning', () => {
    const logger = new SilentLogger();
    const registry = new NotificationChannelRegistry([], logger);
    const ch1 = new ChannelWithFailure('CH1', false);
    const ch2 = new ChannelWithFailure('CH1', false);
    registry.register(ch1);
    registry.register(ch2); // overwrites
    expect(registry.getChannel('CH1')).toBe(ch2);
    expect(logger.logs.some((l) => l.message.includes('Overwriting registration'))).toBe(true);
  });

  it('should cover SendWakeUpUseCase when preferredChannel is not registered', async () => {
    const clock = new FakeClock();
    const logger = new SilentLogger();
    const cache = new InMemoryCache(clock);
    const idempotencyStore = new InMemoryIdempotencyStore(cache);

    const userPrefs = new InMemoryUserPreferencesProvider([
      {
        userId: 'unregistered-pref-user',
        trackByWeather: { [Weather.SOLEIL]: 'Sun' },
        fallbackTrack: 'Fallback',
        preferredChannel: 'UNKNOWN_CHANNEL',
        fallbackChannel: 'BACKUP_CHANNEL',
      },
    ]);

    const backupChannel = new ChannelWithFailure('BACKUP_CHANNEL', false);
    const registry = new NotificationChannelRegistry([backupChannel], logger);

    const useCase = new SendWakeUpUseCase({
      userPreferencesProvider: userPrefs,
      trackResolver: asTrackResolver({
        providerName: 'SimpleMusic',
        resolveTrack: async () => ({ title: 'T', artist: 'A' }),
      }),
      trackSelectionStrategy: new DefaultTrackSelectionStrategy(),
      notificationRegistry: registry,
      clock,
      logger,
      idempotencyStore,
      timeZone: 'Europe/Paris',
      locale: 'fr-FR',
      idempotencyTtlSeconds: 86400,
    });

    const result = await useCase.sendWakeUp('unregistered-pref-user', DayOfWeek.LUNDI, Weather.SOLEIL);
    expect(result.channelUsed).toBe('BACKUP_CHANNEL');
    expect(result.degraded).toBe(true);
  });

  it('should cover SendWakeUpUseCase when user fallback query equals primary query and fails', async () => {
    const clock = new FakeClock();
    const logger = new SilentLogger();
    const cache = new InMemoryCache(clock);
    const idempotencyStore = new InMemoryIdempotencyStore(cache);

    const userPrefs = new InMemoryUserPreferencesProvider([
      {
        userId: 'same-query-user',
        trackByWeather: { [Weather.SOLEIL]: 'SameSong' },
        fallbackTrack: 'SameSong', // identical
        preferredChannel: 'CH',
      },
    ]);

    const ch = new ChannelWithFailure('CH', false);
    const registry = new NotificationChannelRegistry([ch], logger);

    const useCase = new SendWakeUpUseCase({
      userPreferencesProvider: userPrefs,
      trackResolver: asTrackResolver({
        providerName: 'AlwaysFailingProvider',
        resolveTrack: async () => {
          throw new Error('Total failure');
        },
      }),
      trackSelectionStrategy: new DefaultTrackSelectionStrategy(),
      notificationRegistry: registry,
      clock,
      logger,
      idempotencyStore,
      timeZone: 'Europe/Paris',
      locale: 'fr-FR',
      idempotencyTtlSeconds: 86400,
    });

    await expect(
      useCase.sendWakeUp('same-query-user', DayOfWeek.LUNDI, Weather.SOLEIL),
    ).rejects.toThrow('Total failure');
  });

  it('should cover container overrides for additionalChannels and customMusicProviders', () => {
    const customProvider: IMusicProvider = {
      providerName: 'CustomP',
      resolveTrack: async () => ({ title: 'CustTitle', artist: 'CustArtist' }),
    };
    const customChannel: INotificationChannel = new ChannelWithFailure('CUSTOM_CH', false);

    const container = buildApplicationContainer({
      customMusicProviders: [customProvider],
      additionalChannels: [customChannel],
    });

    expect(container.notificationRegistry.getChannel('CUSTOM_CH')).toBe(customChannel);
    expect(container.musicProviderChain).toBeDefined();
  });
});
