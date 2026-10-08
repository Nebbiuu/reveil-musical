import { UserPreferences } from '../models/UserPreferences.js';
import { Weather } from '../models/Weather.js';
import { DayOfWeek } from '../models/DayOfWeek.js';

export interface TrackSelectionResult {
  readonly query: string;
  readonly isWeatherCovered: boolean;
}

export interface ITrackSelectionStrategy {
  selectTrack(
    preferences: UserPreferences,
    weather: Weather,
    dayOfWeek: DayOfWeek,
  ): TrackSelectionResult;
}
