import { INotificationChannel, NotificationPayload } from '../../domain/ports/INotificationChannel.js';
import { NotificationChannelType } from '../../domain/models/NotificationChannelType.js';
import { NotificationChannelError } from '../../domain/errors/DomainErrors.js';
import { MockPushService } from './MockPushService.js';

export class PushNotificationAdapter implements INotificationChannel {
  public readonly channelType = NotificationChannelType.PUSH;

  constructor(private readonly pushService: MockPushService) {}

  public async send(payload: NotificationPayload): Promise<void> {
    try {
      const deviceToken = `token-${payload.userId}`;
      await this.pushService.pushNotification(deviceToken, {
        title: `Réveil - ${payload.dayOfWeek}`,
        content: payload.messageText,
        extra: {
          trackTitle: payload.track.title,
          trackArtist: payload.track.artist,
          weather: payload.weather,
        },
      });
    } catch (error) {
      throw new NotificationChannelError(
        `Failed to send Push to user '${payload.userId}': ${error instanceof Error ? error.message : String(error)}`,
        this.channelType,
        error,
      );
    }
  }
}
