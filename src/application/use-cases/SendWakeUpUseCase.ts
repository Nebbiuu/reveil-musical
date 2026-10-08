import { DayOfWeek, isDayOfWeek } from '../../domain/models/DayOfWeek.js';
import { Weather, isWeather } from '../../domain/models/Weather.js';
import { WakeUpResult } from '../../domain/models/WakeUpResult.js';
import { Track } from '../../domain/models/Track.js';
import { ValidationError, UserNotFoundError } from '../../domain/errors/DomainErrors.js';
import { IUserPreferencesProvider } from '../../domain/ports/IUserPreferencesProvider.js';
import { IMusicProvider } from '../../domain/ports/IMusicProvider.js';
import { ITrackSelectionStrategy } from '../../domain/ports/ITrackSelectionStrategy.js';
import { IClock } from '../../domain/ports/IClock.js';
import { ILogger } from '../../domain/ports/ILogger.js';
import { IIdempotencyStore } from '../../domain/ports/IIdempotencyStore.js';
import { NotificationPayload } from '../../domain/ports/INotificationChannel.js';
import { INotificationRegistry } from '../ports/INotificationRegistry.js';

export interface SendWakeUpDependencies {
  readonly userPreferencesProvider: IUserPreferencesProvider;
  readonly musicProvider: IMusicProvider;
  readonly trackSelectionStrategy: ITrackSelectionStrategy;
  readonly notificationRegistry: INotificationRegistry;
  readonly clock: IClock;
  readonly logger: ILogger;
  readonly idempotencyStore: IIdempotencyStore;
  readonly timeZone: string;
  readonly locale: string;
  readonly idempotencyTtlSeconds: number;
}

export class SendWakeUpUseCase {
  private readonly userPreferencesProvider: IUserPreferencesProvider;
  private readonly musicProvider: IMusicProvider;
  private readonly trackSelectionStrategy: ITrackSelectionStrategy;
  private readonly notificationRegistry: INotificationRegistry;
  private readonly clock: IClock;
  private readonly logger: ILogger;
  private readonly idempotencyStore: IIdempotencyStore;
  private readonly timeZone: string;
  private readonly locale: string;
  private readonly idempotencyTtlSeconds: number;

  constructor(deps: SendWakeUpDependencies) {
    this.userPreferencesProvider = deps.userPreferencesProvider;
    this.musicProvider = deps.musicProvider;
    this.trackSelectionStrategy = deps.trackSelectionStrategy;
    this.notificationRegistry = deps.notificationRegistry;
    this.clock = deps.clock;
    this.logger = deps.logger;
    this.idempotencyStore = deps.idempotencyStore;
    this.timeZone = deps.timeZone;
    this.locale = deps.locale;
    this.idempotencyTtlSeconds = deps.idempotencyTtlSeconds;
  }

  public async sendWakeUp(
    userId: string,
    dayOfWeek: DayOfWeek | string,
    weather: Weather | string,
  ): Promise<WakeUpResult> {
    const validated = this.validateInputs(userId, dayOfWeek, weather);

    this.logger.info('Received wake-up request', {
      userId: validated.userId,
      dayOfWeek: validated.dayOfWeek,
      weather: validated.weather,
    });

    const todayDate = this.clock.todayDateString(this.timeZone);
    const idempotencyKey = `wakeup:${validated.userId}:${todayDate}`;

    const cachedResult = await this.idempotencyStore.get(idempotencyKey);
    if (cachedResult) {
      this.logger.info('Wake-up already processed today, returning cached result', {
        idempotencyKey,
        result: cachedResult,
      });
      return cachedResult;
    }

    const preferences = await this.userPreferencesProvider.getUserPreferences(validated.userId);
    if (!preferences) {
      this.logger.warn('User not found for wake-up execution', { userId: validated.userId });
      throw new UserNotFoundError(validated.userId);
    }

    let degraded = false;
    const selection = this.trackSelectionStrategy.selectTrack(
      preferences,
      validated.weather,
      validated.dayOfWeek,
    );

    if (!selection.isWeatherCovered) {
      this.logger.info('Weather not covered in user preferences, using user fallback track', {
        userId: validated.userId,
        weather: validated.weather,
        fallbackQuery: selection.query,
      });
      degraded = true;
    }

    const track = await this.resolveTrackWithCascade(selection.query, preferences.fallbackTrack);
    if (track.isFallbackCascade) {
      degraded = true;
    }

    const messageText = this.clock.formatWakeUpMessage(
      validated.dayOfWeek,
      validated.weather,
      this.timeZone,
      this.locale,
    );

    const notificationPayload: NotificationPayload = {
      userId: validated.userId,
      track: track.resolvedTrack,
      dayOfWeek: validated.dayOfWeek,
      weather: validated.weather,
      messageText,
    };

    const notificationDelivery = await this.dispatchNotificationWithFallback(
      preferences.preferredChannel,
      preferences.fallbackChannel,
      notificationPayload,
    );

    if (notificationDelivery.degraded) {
      degraded = true;
    }

    const finalResult: WakeUpResult = {
      track: track.resolvedTrack,
      channelUsed: notificationDelivery.channelUsed,
      degraded,
    };

    await this.idempotencyStore.save(idempotencyKey, finalResult, this.idempotencyTtlSeconds);

    this.logger.info('Wake-up process completed successfully', {
      userId: validated.userId,
      channelUsed: finalResult.channelUsed,
      degraded: finalResult.degraded,
      track: finalResult.track,
    });

    return finalResult;
  }

  private validateInputs(
    userId: unknown,
    dayOfWeek: unknown,
    weather: unknown,
  ): { userId: string; dayOfWeek: DayOfWeek; weather: Weather } {
    if (typeof userId !== 'string' || userId.trim().length === 0) {
      throw new ValidationError('userId must be a non-empty string', 'userId');
    }

    if (!isDayOfWeek(dayOfWeek)) {
      throw new ValidationError(
        `Invalid dayOfWeek: '${String(dayOfWeek)}'. Expected one of: ${Object.values(DayOfWeek).join(', ')}`,
        'dayOfWeek',
      );
    }

    if (!isWeather(weather)) {
      throw new ValidationError(
        `Invalid weather: '${String(weather)}'. Expected one of: ${Object.values(Weather).join(', ')}`,
        'weather',
      );
    }

    return {
      userId: userId.trim(),
      dayOfWeek,
      weather,
    };
  }

  private async resolveTrackWithCascade(
    primaryQuery: string,
    userFallbackQuery: string,
  ): Promise<{ resolvedTrack: Track; isFallbackCascade: boolean }> {
    try {
      const resolved = await this.musicProvider.resolveTrack(primaryQuery);
      return { resolvedTrack: resolved, isFallbackCascade: false };
    } catch (primaryError) {
      this.logger.warn('Failed to resolve primary track query, attempting user fallback', {
        primaryQuery,
        error: primaryError instanceof Error ? primaryError.message : String(primaryError),
      });

      if (primaryQuery !== userFallbackQuery && userFallbackQuery.trim().length > 0) {
        try {
          const fallbackResolved = await this.musicProvider.resolveTrack(userFallbackQuery);
          return { resolvedTrack: fallbackResolved, isFallbackCascade: true };
        } catch (fallbackError) {
          this.logger.warn('Failed to resolve user fallback track query as well', {
            userFallbackQuery,
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          });
        }
      }

      // If both fail, let's re-throw or if musicProvider chain didn't catch, fail.
      throw primaryError;
    }
  }

  private async dispatchNotificationWithFallback(
    preferredChannelType: string,
    fallbackChannelType: string | undefined,
    payload: NotificationPayload,
  ): Promise<{ channelUsed: string; degraded: boolean }> {
    const preferredChannel = this.notificationRegistry.getChannel(preferredChannelType);
    if (preferredChannel) {
      try {
        await preferredChannel.send(payload);
        return { channelUsed: preferredChannel.channelType, degraded: false };
      } catch (error) {
        this.logger.warn('Preferred notification channel failed, attempting alternative', {
          failedChannel: preferredChannelType,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      this.logger.warn('Preferred notification channel not registered', {
        channel: preferredChannelType,
      });
    }

    // Try explicit fallback channel if specified
    if (fallbackChannelType && fallbackChannelType !== preferredChannelType) {
      const fallbackChannel = this.notificationRegistry.getChannel(fallbackChannelType);
      if (fallbackChannel) {
        try {
          await fallbackChannel.send(payload);
          return { channelUsed: fallbackChannel.channelType, degraded: true };
        } catch (error) {
          this.logger.warn('Fallback notification channel failed too', {
            channel: fallbackChannelType,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // Try any other available registered channel
    const availableChannels = this.notificationRegistry.getAvailableChannels();
    for (const channel of availableChannels) {
      if (channel.channelType !== preferredChannelType && channel.channelType !== fallbackChannelType) {
        try {
          await channel.send(payload);
          this.logger.info('Notification delivered via alternative registered channel', {
            channelUsed: channel.channelType,
          });
          return { channelUsed: channel.channelType, degraded: true };
        } catch (error) {
          this.logger.warn('Alternative registered channel failed', {
            channel: channel.channelType,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // Reliable fallback: never silence. Log structured notification in degraded mode.
    this.logger.error('CRITICAL: All notification channels failed. Falling back to log notification', undefined, {
      userId: payload.userId,
      track: payload.track,
      message: payload.messageText,
    });

    return { channelUsed: 'LOG_FALLBACK', degraded: true };
  }
}
