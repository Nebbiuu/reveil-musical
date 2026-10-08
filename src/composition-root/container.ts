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

export interface ApplicationContainer {
  readonly config: AppConfig;
  readonly clock: IClock;
  readonly logger: ILogger;
  readonly idGenerator: IIdGenerator;
  readonly cache: ICache;
  readonly idempotencyStore: IIdempotencyStore;
  readonly httpClient: IHttpClient;
  readonly userPreferencesProvider: IUserPreferencesProvider;
  readonly musicProviderChain: IMusicProvider;
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

/**
 * Composition Root: The single place where object lifecycles are managed and dependencies are wired.
 * - Singletons: Config, Cache, IdempotencyStore, CircuitBreakers, RateLimiters.
 * - Constructor injection exclusively (no DI framework, no reflection, no global state).
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

  // 6. User Preferences Provider
  const userPreferencesProvider =
    overrides.userPreferencesProvider ?? InMemoryUserPreferencesProvider.createDefaultSeed();

  // 7. Track Selection Strategy
  const trackSelectionStrategy =
    overrides.trackSelectionStrategy ?? new DefaultTrackSelectionStrategy();

  // 8. Application Facade / Use Case
  const sendWakeUpUseCase = new SendWakeUpUseCase({
    userPreferencesProvider,
    musicProvider: musicProviderChain,
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
