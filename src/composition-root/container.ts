import { IClock } from '../domain/ports/IClock.js';
import { ILogger } from '../domain/ports/ILogger.js';
import { IIdGenerator } from '../domain/ports/IIdGenerator.js';
import { ICache } from '../domain/ports/ICache.js';
import { IHttpClient } from '../domain/ports/IHttpClient.js';
import { IIdempotencyStore } from '../domain/ports/IIdempotencyStore.js';
import { IUserPreferencesProvider } from '../domain/ports/IUserPreferencesProvider.js';
import { IMusicProvider } from '../domain/ports/IMusicProvider.js';
import { ITrackSelectionStrategy } from '../domain/ports/ITrackSelectionStrategy.js';
import { INotificationChannel } from '../domain/ports/INotificationChannel.js';
import { DefaultTrackSelectionStrategy } from '../domain/strategies/DefaultTrackSelectionStrategy.js';
import { UserPreferences } from '../domain/models/UserPreferences.js';
import { Weather } from '../domain/models/Weather.js';
import { NotificationChannelType } from '../domain/models/NotificationChannelType.js';

import { SendWakeUpUseCase } from '../application/use-cases/SendWakeUpUseCase.js';
import { INotificationRegistry } from '../application/ports/INotificationRegistry.js';

import { AppConfig, RawConfigInput, parseAndValidateConfig } from '../infrastructure/config/AppConfig.js';
import { SystemClock } from '../infrastructure/system/SystemClock.js';
import { ConsoleLogger } from '../infrastructure/system/ConsoleLogger.js';
import { UuidGenerator } from '../infrastructure/system/UuidGenerator.js';
import { InMemoryCache } from '../infrastructure/system/InMemoryCache.js';
import { InMemoryIdempotencyStore } from '../infrastructure/system/InMemoryIdempotencyStore.js';
import { FetchHttpClient } from '../infrastructure/system/FetchHttpClient.js';
import { RateLimiter } from '../infrastructure/resilience/RateLimiter.js';
import { CircuitBreaker } from '../infrastructure/resilience/CircuitBreaker.js';
import { RetryPolicy } from '../infrastructure/resilience/RetryPolicy.js';

import { ItunesMusicAdapter } from '../infrastructure/music/ItunesMusicAdapter.js';
import { MusicBrainzMusicAdapter } from '../infrastructure/music/MusicBrainzMusicAdapter.js';
import { LocalFallbackMusicAdapter } from '../infrastructure/music/LocalFallbackMusicAdapter.js';
import { CachedMusicProviderDecorator } from '../infrastructure/music/CachedMusicProviderDecorator.js';
import { ResilientMusicProviderDecorator } from '../infrastructure/music/ResilientMusicProviderDecorator.js';
import { MusicProviderChain } from '../infrastructure/music/MusicProviderChain.js';

import { MockEmailService } from '../infrastructure/notification/MockEmailService.js';
import { MockSmsService } from '../infrastructure/notification/MockSmsService.js';
import { MockPushService } from '../infrastructure/notification/MockPushService.js';
import { EmailNotificationAdapter } from '../infrastructure/notification/EmailNotificationAdapter.js';
import { SmsNotificationAdapter } from '../infrastructure/notification/SmsNotificationAdapter.js';
import { PushNotificationAdapter } from '../infrastructure/notification/PushNotificationAdapter.js';
import { NotificationChannelRegistry } from '../infrastructure/notification/NotificationChannelRegistry.js';

import { InMemoryUserPreferencesProvider } from '../infrastructure/user/InMemoryUserPreferencesProvider.js';

import { ITrackResolver } from '../domain/ports/ITrackResolver.js';

export interface ApplicationContainer {
  readonly config: AppConfig;
  readonly clock: IClock;
  readonly logger: ILogger;
  readonly idGenerator: IIdGenerator;
  readonly cache: ICache;
  readonly idempotencyStore: IIdempotencyStore;
  readonly httpClient: IHttpClient;
  readonly userPreferencesProvider: IUserPreferencesProvider;
  readonly musicProviderChain: IMusicProvider & ITrackResolver;
  readonly trackSelectionStrategy: ITrackSelectionStrategy;
  readonly notificationRegistry: INotificationRegistry;
  readonly sendWakeUpUseCase: SendWakeUpUseCase;
}

export interface ContainerOverrides {
  readonly config?: RawConfigInput;
  readonly clock?: IClock;
  readonly logger?: ILogger;
  readonly idGenerator?: IIdGenerator;
  readonly cache?: ICache;
  readonly idempotencyStore?: IIdempotencyStore;
  readonly httpClient?: IHttpClient;
  readonly userPreferencesProvider?: IUserPreferencesProvider;
  readonly trackSelectionStrategy?: ITrackSelectionStrategy;
  readonly additionalChannels?: readonly INotificationChannel[];
  readonly customMusicProviders?: readonly IMusicProvider[];
  readonly itunesCircuitBreaker?: CircuitBreaker;
  readonly musicBrainzCircuitBreaker?: CircuitBreaker;
  readonly itunesRateLimiter?: RateLimiter;
}

/** Minimal shape of an environment map (compatible with process.env, injectable in tests). */
export type EnvironmentMap = Readonly<Record<string, string | undefined>>;

/**
 * Translates environment variables into the raw config object.
 * Pure function: it never touches process.env itself. Missing variables are simply omitted,
 * so defaults and validation stay the responsibility of parseAndValidateConfig.
 *
 * Variables: MUSIC_PROVIDERS_ORDER (csv), MUSICBRAINZ_USER_AGENT, ITUNES_RATE_LIMIT_MAX,
 * ITUNES_RATE_LIMIT_WINDOW_MS, CB_FAILURE_THRESHOLD, CB_RESET_TIMEOUT_MS, HTTP_TIMEOUT_MS,
 * CACHE_TTL_SECONDS, IDEMPOTENCY_TTL_SECONDS, TIME_ZONE, LOCALE, LOG_LEVEL.
 */
export function readRawConfigFromEnv(env: EnvironmentMap): RawConfigInput {
  const raw: Record<string, unknown> = {};

  const text = (key: string, target: string): void => {
    const value = env[key];
    if (value !== undefined && value.trim() !== '') {
      raw[target] = value.trim();
    }
  };
  const num = (key: string, target: string): void => {
    const value = env[key];
    if (value !== undefined && value.trim() !== '') {
      raw[target] = Number(value); // NaN is rejected by the validation
    }
  };

  const order = env.MUSIC_PROVIDERS_ORDER;
  if (order !== undefined && order.trim() !== '') {
    raw.musicProvidersOrder = order
      .split(',')
      .map((p) => p.trim().toLowerCase())
      .filter((p) => p.length > 0);
  }

  text('MUSICBRAINZ_USER_AGENT', 'musicBrainzUserAgent');
  num('ITUNES_RATE_LIMIT_MAX', 'itunesRateLimitMaxRequests');
  num('ITUNES_RATE_LIMIT_WINDOW_MS', 'itunesRateLimitWindowMs');
  num('CB_FAILURE_THRESHOLD', 'circuitBreakerFailureThreshold');
  num('CB_RESET_TIMEOUT_MS', 'circuitBreakerResetTimeoutMs');
  num('HTTP_TIMEOUT_MS', 'httpTimeoutMs');
  num('CACHE_TTL_SECONDS', 'cacheTtlSeconds');
  num('IDEMPOTENCY_TTL_SECONDS', 'idempotencyTtlSeconds');
  text('TIME_ZONE', 'timeZone');
  text('LOCALE', 'locale');
  text('LOG_LEVEL', 'logLevel');

  return raw as unknown as RawConfigInput;
}

/** Demo users used by the default in-memory preferences provider. */
function buildDefaultUserPreferences(): readonly UserPreferences[] {
  return [
    {
      userId: 'user-alice',
      trackByWeather: {
        [Weather.SOLEIL]: 'Walking on Sunshine',
        [Weather.PLUIE]: 'Purple Rain',
        [Weather.NEIGE]: 'Cold as Ice',
        [Weather.NUAGEUX]: 'Cloudbusting',
      },
      fallbackTrack: 'Here Comes The Sun',
      preferredChannel: NotificationChannelType.EMAIL,
      fallbackChannel: NotificationChannelType.SMS,
    },
    {
      userId: 'user-bob-partial-weather',
      // NEIGE and NUAGEUX deliberately omitted to exercise the user fallback track
      trackByWeather: {
        [Weather.SOLEIL]: 'Good Day Sunshine',
      },
      fallbackTrack: 'Stand By Me',
      preferredChannel: NotificationChannelType.SMS,
      fallbackChannel: NotificationChannelType.PUSH,
    },
    {
      userId: 'user-charlie-push',
      trackByWeather: {
        [Weather.SOLEIL]: 'Mr Blue Sky',
        [Weather.PLUIE]: 'Set Fire to the Rain',
        [Weather.NEIGE]: 'Snow (Hey Oh)',
        [Weather.NUAGEUX]: 'Get Lucky',
      },
      fallbackTrack: 'Bohemian Rhapsody',
      preferredChannel: NotificationChannelType.PUSH,
    },
  ];
}

/**
 * Production entry point: the only place in the codebase that reads process.env.
 * Tests should call buildApplicationContainer(overrides) directly.
 */
export function buildApplicationContainerFromEnv(
  overrides: Omit<ContainerOverrides, 'config'> = {},
): ApplicationContainer {
  return buildApplicationContainer({
    ...overrides,
    config: readRawConfigFromEnv(process.env),
  });
}

/**
 * Composition Root: the single place where object lifecycles are managed and dependencies are wired.
 * - Singletons: Config, Cache, IdempotencyStore, CircuitBreakers, RateLimiters.
 * - Constructor injection exclusively (no DI framework, no reflection, no global state).
 * - Every concrete implementation is instantiated here and nowhere else.
 */
export function buildApplicationContainer(overrides: ContainerOverrides = {}): ApplicationContainer {
  // 1. Config (validated once at startup)
  const config = parseAndValidateConfig(overrides.config ?? {});

  // 2. Fundamental System Singletons
  const clock = overrides.clock ?? new SystemClock();
  const logger = overrides.logger ?? new ConsoleLogger(config.logLevel);
  const idGenerator = overrides.idGenerator ?? new UuidGenerator();
  const cache = overrides.cache ?? new InMemoryCache(clock);
  const idempotencyStore = overrides.idempotencyStore ?? new InMemoryIdempotencyStore(cache);
  const httpClient = overrides.httpClient ?? new FetchHttpClient(config.httpTimeoutMs);

  // 3. Resilience Singletons (stateful per service across invocations)
  const itunesRateLimiter =
    overrides.itunesRateLimiter ??
    new RateLimiter(
      'iTunes',
      {
        maxRequests: config.itunesRateLimitMaxRequests,
        windowMs: config.itunesRateLimitWindowMs,
      },
      clock,
    );

  const itunesCircuitBreaker =
    overrides.itunesCircuitBreaker ??
    new CircuitBreaker(
      'iTunes',
      {
        failureThreshold: config.circuitBreakerFailureThreshold,
        resetTimeoutMs: config.circuitBreakerResetTimeoutMs,
      },
      clock,
      logger,
    );

  const musicBrainzCircuitBreaker =
    overrides.musicBrainzCircuitBreaker ??
    new CircuitBreaker(
      'MusicBrainz',
      {
        failureThreshold: config.circuitBreakerFailureThreshold,
        resetTimeoutMs: config.circuitBreakerResetTimeoutMs,
      },
      clock,
      logger,
    );

  // 4. Music Provider Chain Assembly
  let providers: readonly IMusicProvider[];

  if (overrides.customMusicProviders && overrides.customMusicProviders.length > 0) {
    providers = overrides.customMusicProviders;
  } else {
    const providerList: IMusicProvider[] = [];

    for (const providerKey of config.musicProvidersOrder) {
      if (providerKey === 'itunes') {
        const itunesRaw = new ItunesMusicAdapter(httpClient, logger);
        const itunesResilient = new ResilientMusicProviderDecorator(
          itunesRaw,
          {
            rateLimiter: itunesRateLimiter,
            circuitBreaker: itunesCircuitBreaker,
            retryPolicy: new RetryPolicy('iTunesSearch', { maxRetries: 2, initialDelayMs: 100 }, logger),
          },
          logger,
        );
        const itunesCached = new CachedMusicProviderDecorator(
          itunesResilient,
          cache,
          logger,
          config.cacheTtlSeconds,
        );
        providerList.push(itunesCached);
      } else if (providerKey === 'musicbrainz') {
        const mbRaw = new MusicBrainzMusicAdapter(httpClient, logger, config.musicBrainzUserAgent);
        const mbResilient = new ResilientMusicProviderDecorator(
          mbRaw,
          {
            circuitBreaker: musicBrainzCircuitBreaker,
            retryPolicy: new RetryPolicy('MusicBrainzSearch', { maxRetries: 2, initialDelayMs: 200 }, logger),
          },
          logger,
        );
        const mbCached = new CachedMusicProviderDecorator(
          mbResilient,
          cache,
          logger,
          config.cacheTtlSeconds,
        );
        providerList.push(mbCached);
      } else if (providerKey === 'local') {
        const localAdapter = new LocalFallbackMusicAdapter(logger);
        providerList.push(localAdapter);
      }
    }

    providers = Object.freeze(providerList);
  }

  const musicProviderChain = new MusicProviderChain(providers, logger);

  // 5. Notification Services, Adapters, and Registry (OCP)
  const emailService = new MockEmailService(logger, idGenerator);
  const smsService = new MockSmsService(logger, idGenerator);
  const pushService = new MockPushService(logger, idGenerator);

  const emailAdapter = new EmailNotificationAdapter(emailService);
  const smsAdapter = new SmsNotificationAdapter(smsService);
  const pushAdapter = new PushNotificationAdapter(pushService);

  const initialChannels: INotificationChannel[] = [emailAdapter, smsAdapter, pushAdapter];
  if (overrides.additionalChannels) {
    initialChannels.push(...overrides.additionalChannels);
  }

  const notificationRegistry = new NotificationChannelRegistry(initialChannels, logger);

  // 6. User Preferences Provider (demo data is defined here, not in the infrastructure class)
  const userPreferencesProvider =
    overrides.userPreferencesProvider ??
    new InMemoryUserPreferencesProvider(buildDefaultUserPreferences());

  // 7. Track Selection Strategy
  const trackSelectionStrategy =
    overrides.trackSelectionStrategy ?? new DefaultTrackSelectionStrategy();

  // 8. Application Facade / Use Case
  const sendWakeUpUseCase = new SendWakeUpUseCase({
    userPreferencesProvider,
    trackResolver: musicProviderChain,
    trackSelectionStrategy,
    notificationRegistry,
    clock,
    logger,
    idempotencyStore,
    timeZone: config.timeZone,
    locale: config.locale,
    idempotencyTtlSeconds: config.idempotencyTtlSeconds,
  });

  return Object.freeze({
    config,
    clock,
    logger,
    idGenerator,
    cache,
    idempotencyStore,
    httpClient,
    userPreferencesProvider,
    musicProviderChain,
    trackSelectionStrategy,
    notificationRegistry,
    sendWakeUpUseCase,
  });
}