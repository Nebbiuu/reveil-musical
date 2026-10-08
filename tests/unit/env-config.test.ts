import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildApplicationContainerFromEnv,
  readRawConfigFromEnv,
} from '../../src/composition-root/container.js';
import { parseAndValidateConfig } from '../../src/infrastructure/config/AppConfig.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('readRawConfigFromEnv', () => {
  it('returns an empty object when no variable is set (defaults apply later)', () => {
    expect(readRawConfigFromEnv({})).toEqual({});
  });

  it('ignores empty and whitespace-only values', () => {
    const raw = readRawConfigFromEnv({
      MUSIC_PROVIDERS_ORDER: '   ',
      MUSICBRAINZ_USER_AGENT: '',
      ITUNES_RATE_LIMIT_MAX: '  ',
      TIME_ZONE: undefined,
    });
    expect(raw).toEqual({});
  });

  it('parses the providers order: trims, lowercases, drops empty entries', () => {
    const raw = readRawConfigFromEnv({ MUSIC_PROVIDERS_ORDER: ' MusicBrainz, ,LOCAL ' });
    expect(raw).toMatchObject({ musicProvidersOrder: ['musicbrainz', 'local'] });
  });

  it('converts numeric variables and trims text variables', () => {
    const raw = readRawConfigFromEnv({
      ITUNES_RATE_LIMIT_MAX: '10',
      ITUNES_RATE_LIMIT_WINDOW_MS: '30000',
      CB_FAILURE_THRESHOLD: '3',
      CB_RESET_TIMEOUT_MS: '5000',
      HTTP_TIMEOUT_MS: '2000',
      CACHE_TTL_SECONDS: '60',
      IDEMPOTENCY_TTL_SECONDS: '120',
      MUSICBRAINZ_USER_AGENT: '  App/1.0 (a@b.fr) ',
      TIME_ZONE: 'Europe/Paris',
      LOCALE: 'fr-FR',
      LOG_LEVEL: 'INFO',
    });
    expect(raw).toMatchObject({
      itunesRateLimitMaxRequests: 10,
      itunesRateLimitWindowMs: 30000,
      circuitBreakerFailureThreshold: 3,
      circuitBreakerResetTimeoutMs: 5000,
      httpTimeoutMs: 2000,
      cacheTtlSeconds: 60,
      idempotencyTtlSeconds: 120,
      musicBrainzUserAgent: 'App/1.0 (a@b.fr)',
      timeZone: 'Europe/Paris',
      locale: 'fr-FR',
      logLevel: 'INFO',
    });
  });

  it('lets validation reject a non-numeric value', () => {
    const raw = readRawConfigFromEnv({ ITUNES_RATE_LIMIT_MAX: 'abc' });
    expect(() => parseAndValidateConfig(raw)).toThrow();
  });
});

describe('buildApplicationContainerFromEnv', () => {
  it('builds the container from process.env (provider order changed without recompiling)', () => {
    vi.stubEnv('MUSIC_PROVIDERS_ORDER', 'local');
    const container = buildApplicationContainerFromEnv();
    expect(container.config.musicProvidersOrder).toEqual(['local']);
  });

  it('seeds the demo users in the composition root', async () => {
    const container = buildApplicationContainerFromEnv();
    expect(await container.userPreferencesProvider.getUserPreferences('user-alice')).not.toBeNull();
    expect(await container.userPreferencesProvider.getUserPreferences('inconnu')).toBeNull();
  });
});