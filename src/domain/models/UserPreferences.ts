import { Weather } from './Weather.js';
import { NotificationChannelType } from './NotificationChannelType.js';

export interface UserPreferences {
  readonly userId: string;
  readonly trackByWeather: Partial<Record<Weather, string>>;
  readonly fallbackTrack: string;
  readonly preferredChannel: NotificationChannelType;
  readonly fallbackChannel?: NotificationChannelType;
}
