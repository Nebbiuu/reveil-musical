import { INotificationChannel } from '../../domain/ports/INotificationChannel.js';
import { NotificationChannelType } from '../../domain/models/NotificationChannelType.js';
import { INotificationRegistry } from '../../application/ports/INotificationRegistry.js';
import { ILogger } from '../../domain/ports/ILogger.js';

export class NotificationChannelRegistry implements INotificationRegistry {
  private readonly channels = new Map<NotificationChannelType, INotificationChannel>();

  constructor(
    initialChannels: readonly INotificationChannel[] = [],
    private readonly logger?: ILogger,
  ) {
    for (const channel of initialChannels) {
      this.register(channel);
    }
  }

  public register(channel: INotificationChannel): void {
    if (this.channels.has(channel.channelType)) {
      this.logger?.warn(`Overwriting registration for channel '${channel.channelType}'`);
    }
    this.channels.set(channel.channelType, channel);
    this.logger?.info(`Registered notification channel: ${channel.channelType}`);
  }

  public getChannel(type: NotificationChannelType): INotificationChannel | undefined {
    return this.channels.get(type);
  }

  public getAvailableChannels(): readonly INotificationChannel[] {
    return Array.from(this.channels.values());
  }
}
