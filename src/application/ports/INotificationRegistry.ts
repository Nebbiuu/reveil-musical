import { INotificationChannel } from '../../domain/ports/INotificationChannel.js';
import { NotificationChannelType } from '../../domain/models/NotificationChannelType.js';

export interface INotificationRegistry {
  getChannel(type: NotificationChannelType): INotificationChannel | undefined;
  getAvailableChannels(): readonly INotificationChannel[];
}
