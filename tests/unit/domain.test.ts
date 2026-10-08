import { describe, it, expect } from 'vitest';
import { Weather, isWeather } from '../../src/domain/models/Weather.js';
import { DayOfWeek, isDayOfWeek } from '../../src/domain/models/DayOfWeek.js';
import { isNotificationChannelType } from '../../src/domain/models/NotificationChannelType.js';
import { DefaultTrackSelectionStrategy } from '../../src/domain/strategies/DefaultTrackSelectionStrategy.js';
import {
  DomainError,
  ValidationError,
  UserNotFoundError,
  MusicProviderError,
  NotificationChannelError,
  RateLimitExceededError,
  CircuitBreakerOpenError,
} from '../../src/domain/errors/DomainErrors.js';

describe('Domain Models, Guards, Strategies & Errors Tests', () => {
  describe('Guards', () => {
    it('should validate Weather values correctly', () => {
      expect(isWeather('SOLEIL')).toBe(true);
      expect(isWeather('PLUIE')).toBe(true);
      expect(isWeather('NEIGE')).toBe(true);
      expect(isWeather('NUAGEUX')).toBe(true);
      expect(isWeather('VENTEUX')).toBe(false);
      expect(isWeather(123)).toBe(false);
      expect(isWeather(null)).toBe(false);
    });

    it('should validate DayOfWeek values correctly', () => {
      expect(isDayOfWeek('LUNDI')).toBe(true);
      expect(isDayOfWeek('DIMANCHE')).toBe(true);
      expect(isDayOfWeek('FUNDAY')).toBe(false);
      expect(isDayOfWeek(undefined)).toBe(false);
    });

    it('should validate NotificationChannelType values correctly', () => {
      expect(isNotificationChannelType('EMAIL')).toBe(true);
      expect(isNotificationChannelType('WHATSAPP')).toBe(true);
      expect(isNotificationChannelType('')).toBe(false);
      expect(isNotificationChannelType(null)).toBe(false);
    });
  });

  describe('DefaultTrackSelectionStrategy', () => {
    const strategy = new DefaultTrackSelectionStrategy();

    it('should select weather-specific track when covered', () => {
      const prefs = {
        userId: 'u1',
        trackByWeather: { [Weather.SOLEIL]: 'Walking on Sunshine' },
        fallbackTrack: 'Default Song',
        preferredChannel: 'EMAIL',
      };

      const result = strategy.selectTrack(prefs, Weather.SOLEIL, DayOfWeek.LUNDI);
      expect(result).toEqual({
        query: 'Walking on Sunshine',
        isWeatherCovered: true,
      });
    });

    it('should select fallback track when weather is missing or empty', () => {
      const prefs = {
        userId: 'u1',
        trackByWeather: { [Weather.SOLEIL]: 'Walking on Sunshine' },
        fallbackTrack: 'Default Song',
        preferredChannel: 'EMAIL',
      };

      const result = strategy.selectTrack(prefs, Weather.PLUIE, DayOfWeek.LUNDI);
      expect(result).toEqual({
        query: 'Default Song',
        isWeatherCovered: false,
      });
    });
  });

  describe('Domain Errors Hierarchy', () => {
    it('should instantiate ValidationError with field', () => {
      const err = new ValidationError('Invalid name', 'name');
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('ValidationError');
      expect(err.field).toBe('name');
    });

    it('should instantiate UserNotFoundError', () => {
      const err = new UserNotFoundError('usr-99');
      expect(err.name).toBe('UserNotFoundError');
      expect(err.userId).toBe('usr-99');
      expect(err.message).toContain('usr-99');
    });

    it('should instantiate MusicProviderError with providerName and cause', () => {
      const cause = new Error('Socket timeout');
      const err = new MusicProviderError('Network fail', 'iTunes', cause);
      expect(err.name).toBe('MusicProviderError');
      expect(err.providerName).toBe('iTunes');
      expect(err.causeError).toBe(cause);
      expect(err.message).toContain('[iTunes]');
    });

    it('should instantiate NotificationChannelError with channel', () => {
      const err = new NotificationChannelError('SMTP down', 'EMAIL');
      expect(err.name).toBe('NotificationChannelError');
      expect(err.channel).toBe('EMAIL');
      expect(err.message).toContain('[EMAIL]');
    });

    it('should instantiate RateLimitExceededError', () => {
      const err = new RateLimitExceededError('iTunes', 5000);
      expect(err.name).toBe('RateLimitExceededError');
      expect(err.resource).toBe('iTunes');
      expect(err.retryAfterMs).toBe(5000);
    });

    it('should instantiate CircuitBreakerOpenError', () => {
      const err = new CircuitBreakerOpenError('MusicBrainz');
      expect(err.name).toBe('CircuitBreakerOpenError');
      expect(err.serviceName).toBe('MusicBrainz');
    });
  });
});
