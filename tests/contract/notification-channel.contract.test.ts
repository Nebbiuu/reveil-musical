import { describe, it, expect, beforeEach } from 'vitest';
import { INotificationChannel, NotificationPayload } from '../../src/domain/ports/INotificationChannel.js';
import { SilentLogger } from '../fakes/SilentLogger.js';
import { UuidGenerator } from '../../src/infrastructure/system/UuidGenerator.js';
import { MockEmailService } from '../../src/infrastructure/notification/MockEmailService.js';
import { MockSmsService } from '../../src/infrastructure/notification/MockSmsService.js';
import { MockPushService } from '../../src/infrastructure/notification/MockPushService.js';
import { EmailNotificationAdapter } from '../../src/infrastructure/notification/EmailNotificationAdapter.js';
import { SmsNotificationAdapter } from '../../src/infrastructure/notification/SmsNotificationAdapter.js';
import { PushNotificationAdapter } from '../../src/infrastructure/notification/PushNotificationAdapter.js';
import { NotificationChannelType } from '../../src/domain/models/NotificationChannelType.js';
import { Weather } from '../../src/domain/models/Weather.js';
import { DayOfWeek } from '../../src/domain/models/DayOfWeek.js';
import { NotificationChannelError } from '../../src/domain/errors/DomainErrors.js';

interface ChannelFactory {
  name: string;
  expectedType: string;
  createHealthy: () => INotificationChannel;
  createFailing: () => INotificationChannel;
}

describe('NotificationChannel Contract Tests', () => {
  let logger: SilentLogger;
  let idGen: UuidGenerator;

  const validPayload: NotificationPayload = {
    userId: 'user-contract-123',
    track: { title: 'Three Little Birds', artist: 'Bob Marley' },
    dayOfWeek: DayOfWeek.LUNDI,
    weather: Weather.SOLEIL,
    messageText: 'Wake up with good vibes!',
  };

  beforeEach(() => {
    logger = new SilentLogger();
    idGen = new UuidGenerator();
  });

  const factories: ChannelFactory[] = [
    {
      name: 'EmailNotificationAdapter',
      expectedType: NotificationChannelType.EMAIL,
      createHealthy: () => new EmailNotificationAdapter(new MockEmailService(logger, idGen, false)),
      createFailing: () => new EmailNotificationAdapter(new MockEmailService(logger, idGen, true)),
    },
    {
      name: 'SmsNotificationAdapter',
      expectedType: NotificationChannelType.SMS,
      createHealthy: () => new SmsNotificationAdapter(new MockSmsService(logger, idGen, false)),
      createFailing: () => new SmsNotificationAdapter(new MockSmsService(logger, idGen, true)),
    },
    {
      name: 'PushNotificationAdapter',
      expectedType: NotificationChannelType.PUSH,
      createHealthy: () => new PushNotificationAdapter(new MockPushService(logger, idGen, false)),
      createFailing: () => new PushNotificationAdapter(new MockPushService(logger, idGen, true)),
    },
  ];

  factories.forEach(({ name, expectedType, createHealthy, createFailing }) => {
    describe(`Contract implementation: ${name}`, () => {
      it(`should expose channelType '${expectedType}'`, () => {
        const channel = createHealthy();
        expect(channel.channelType).toBe(expectedType);
      });

      it('should send notification successfully when downstream service is healthy', async () => {
        const channel = createHealthy();
        await expect(channel.send(validPayload)).resolves.not.toThrow();
      });

      it('should wrap vendor errors into typed NotificationChannelError when downstream service fails', async () => {
        const channel = createFailing();
        await expect(channel.send(validPayload)).rejects.toThrowError(NotificationChannelError);
      });
    });
  });
});
