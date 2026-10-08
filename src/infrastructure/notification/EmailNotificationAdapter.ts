import { INotificationChannel, NotificationPayload } from '../../domain/ports/INotificationChannel.js';
import { NotificationChannelType } from '../../domain/models/NotificationChannelType.js';
import { NotificationChannelError } from '../../domain/errors/DomainErrors.js';
import { MockEmailService } from './MockEmailService.js';

export class EmailNotificationAdapter implements INotificationChannel {
  public readonly channelType = NotificationChannelType.EMAIL;

  constructor(private readonly emailService: MockEmailService) {}

  public async send(payload: NotificationPayload): Promise<void> {
    try {
      const subject = `Réveil en musique - ${payload.dayOfWeek}`;
      const body = `${payload.messageText}\n\nMorceau sélectionné : "${payload.track.title}" par ${payload.track.artist}.`;

      await this.emailService.sendMail({
        toAddress: `${payload.userId}@domain.example`,
        subject,
        body,
      });
    } catch (error) {
      throw new NotificationChannelError(
        `Failed to send email to user '${payload.userId}': ${error instanceof Error ? error.message : String(error)}`,
        this.channelType,
        error,
      );
    }
  }
}
