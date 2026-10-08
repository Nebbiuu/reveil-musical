import { ITrackSelectionStrategy, TrackSelectionResult } from '../ports/ITrackSelectionStrategy.js';
import { UserPreferences } from '../models/UserPreferences.js';
import { Weather } from '../models/Weather.js';
import { DayOfWeek } from '../models/DayOfWeek.js';

export class DefaultTrackSelectionStrategy implements ITrackSelectionStrategy {
  public selectTrack(
    preferences: UserPreferences,
    weather: Weather,
    _dayOfWeek: DayOfWeek,
  ): TrackSelectionResult {
    const weatherTrack = preferences.trackByWeather[weather];
    if (weatherTrack && weatherTrack.trim().length > 0) {
      return {
        query: weatherTrack.trim(),
        isWeatherCovered: true,
      };
    }

    return {
      query: preferences.fallbackTrack.trim(),
      isWeatherCovered: false,
    };
  }
}
