import { DayOfWeek } from '../../domain/models/DayOfWeek.js';
import { Weather } from '../../domain/models/Weather.js';

export interface SendWakeUpRequest {
  readonly userId: string;
  readonly dayOfWeek: DayOfWeek | string;
  readonly weather: Weather | string;
}
