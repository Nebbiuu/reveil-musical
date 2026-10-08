import { INotificationChannel, NotificationPayload } from '../../domain/ports/INotificationChannel.js';
import { NotificationChannelType } from '../../domain/models/NotificationChannelType.js';
import { NotificationChannelError } from '../../domain/errors/DomainErrors.js';
import { MockSmsService } from './MockSmsService.js';

export class SmsNotificationAdapter implements INotificationChannel {
  public readonly channelType = NotificationChannelType.SMS;

  constructor(private readonly smsService: MockSmsService) {}

  public async send(payload: NotificationPayload): Promise<void> {
    try {
      const text = `${payload.messageText} Titre: ${payload.track.title} - ${payload.track.artist}`;
      // In production, user phone number would be resolved from a user directory
      const phoneNumber = `+33600${payload.userId.replace(/\D/g, '').padEnd(6, '0').slice(0, 6)}`;

      await this.smsService.dispatchText(phoneNumber, text);
    } catch (error) {
      throw new NotificationChannelError(
        `Failed to send SMS to user '${payload.userId}': ${error instanceof Error ? error.message : String(error)}`,
        this.channelType,
        error,
      );
    }
  }
}
