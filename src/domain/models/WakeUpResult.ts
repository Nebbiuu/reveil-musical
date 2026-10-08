import { Track } from './Track.js';
import { NotificationChannelType } from './NotificationChannelType.js';

export interface WakeUpResult {
  readonly track: Track;
  readonly channelUsed: NotificationChannelType;
  readonly degraded: boolean;
}
