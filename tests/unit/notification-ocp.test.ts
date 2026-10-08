import { describe, it, expect, beforeEach } from 'vitest';
import { INotificationChannel, NotificationPayload } from '../../src/domain/ports/INotificationChannel.js';
import { NotificationChannelRegistry } from '../../src/infrastructure/notification/NotificationChannelRegistry.js';
import { EmailNotificationAdapter } from '../../src/infrastructure/notification/EmailNotificationAdapter.js';
import { MockEmailService } from '../../src/infrastructure/notification/MockEmailService.js';
import { SilentLogger } from '../fakes/SilentLogger.js';
import { UuidGenerator } from '../../src/infrastructure/system/UuidGenerator.js';
import { FakeClock } from '../fakes/FakeClock.js';
import { InMemoryCache } from '../../src/infrastructure/system/InMemoryCache.js';
import { InMemoryIdempotencyStore } from '../../src/infrastructure/system/InMemoryIdempotencyStore.js';
import { InMemoryUserPreferencesProvider } from '../../src/infrastructure/user/InMemoryUserPreferencesProvider.js';
import { LocalFallbackMusicAdapter } from '../../src/infrastructure/music/LocalFallbackMusicAdapter.js';
import { DefaultTrackSelectionStrategy } from '../../src/domain/strategies/DefaultTrackSelectionStrategy.js';
import { SendWakeUpUseCase } from '../../src/application/use-cases/SendWakeUpUseCase.js';
import { DayOfWeek } from '../../src/domain/models/DayOfWeek.js';
import { Weather } from '../../src/domain/models/Weather.js';

// ============================================================================
// NEW CHANNEL IMPLEMENTATION (1 new class, OCP demonstration)
// No existing class or interface in domain/application/infrastructure is altered!
// ============================================================================
class WhatsAppNotificationChannel implements INotificationChannel {
  public readonly channelType = 'WHATSAPP';
  public sentMessages: NotificationPayload[] = [];

  public async send(payload: NotificationPayload): Promise<void> {
    this.sentMessages.push(payload);
  }
}

describe('Open/Closed Principle (OCP) - New Notification Channel Test', () => {
  let logger: SilentLogger;
  let idGen: UuidGenerator;
  let clock: FakeClock;
  let registry: NotificationChannelRegistry;

  beforeEach(() => {
    logger = new SilentLogger();
    idGen = new UuidGenerator();
    clock = new FakeClock();

    const emailChannel = new EmailNotificationAdapter(new MockEmailService(logger, idGen));
    registry = new NotificationChannelRegistry([emailChannel], logger);
  });

  it('should allow adding a new WhatsApp channel with 1 class + 1 registration without modifying existing code', async () => {
    // Before registration
    expect(registry.getChannel('WHATSAPP')).toBeUndefined();

    // 1 Registration step
    const whatsAppChannel = new WhatsAppNotificationChannel();
    registry.register(whatsAppChannel);

    // After registration
    const resolved = registry.getChannel('WHATSAPP');
    expect(resolved).toBeDefined();
    expect(resolved?.channelType).toBe('WHATSAPP');

    // Test execution through full SendWakeUpUseCase with a user configured for WHATSAPP
    const cache = new InMemoryCache(clock);
    const userPrefs = new InMemoryUserPreferencesProvider([
      {
        userId: 'user-whatsapp',
        trackByWeather: { [Weather.SOLEIL]: 'Sunny Day' },
        fallbackTrack: 'Morning Mood',
        preferredChannel: 'WHATSAPP',
      },
    ]);

    const useCase = new SendWakeUpUseCase({
      userPreferencesProvider: userPrefs,
      musicProvider: new LocalFallbackMusicAdapter(logger),
      trackSelectionStrategy: new DefaultTrackSelectionStrategy(),
      notificationRegistry: registry,
      clock,
      logger,
      idempotencyStore: new InMemoryIdempotencyStore(cache),
      timeZone: 'Europe/Paris',
      locale: 'fr-FR',
      idempotencyTtlSeconds: 86400,
    });

    const result = await useCase.sendWakeUp('user-whatsapp', DayOfWeek.MARDI, Weather.SOLEIL);

    expect(result.channelUsed).toBe('WHATSAPP');
    expect(result.degraded).toBe(false);
    expect(whatsAppChannel.sentMessages.length).toBe(1);
    expect(whatsAppChannel.sentMessages[0]?.userId).toBe('user-whatsapp');
  });
});
