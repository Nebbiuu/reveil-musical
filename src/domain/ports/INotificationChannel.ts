import { Track } from '../models/Track.js';
import { Weather } from '../models/Weather.js';
import { DayOfWeek } from '../models/DayOfWeek.js';
import { NotificationChannelType } from '../models/NotificationChannelType.js';

export interface NotificationPayload {
  readonly userId: string;
  readonly track: Track;
  readonly dayOfWeek: DayOfWeek;
  readonly weather: Weather;
  readonly messageText: string;
}

export interface INotificationChannel {
  readonly channelType: NotificationChannelType;
  send(payload: NotificationPayload): Promise<void>;
}
