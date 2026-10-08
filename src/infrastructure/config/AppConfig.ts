export interface AppConfig {
  readonly timeZone: string;
  readonly locale: string;
  readonly musicProvidersOrder: readonly ('itunes' | 'musicbrainz' | 'local')[];
  readonly musicBrainzUserAgent: string;
  readonly itunesRateLimitMaxRequests: number;
  readonly itunesRateLimitWindowMs: number;
  readonly circuitBreakerFailureThreshold: number;
  readonly circuitBreakerResetTimeoutMs: number;
  readonly cacheTtlSeconds: number;
  readonly idempotencyTtlSeconds: number;
  readonly httpTimeoutMs: number;
  readonly logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
}

export interface RawConfigInput {
  readonly timeZone?: string;
  readonly locale?: string;
  readonly musicProvidersOrder?: string | readonly string[];
  readonly musicBrainzUserAgent?: string;
  readonly itunesRateLimitMaxRequests?: string | number;
  readonly itunesRateLimitWindowMs?: string | number;
  readonly circuitBreakerFailureThreshold?: string | number;
  readonly circuitBreakerResetTimeoutMs?: string | number;
  readonly cacheTtlSeconds?: string | number;
  readonly idempotencyTtlSeconds?: string | number;
  readonly httpTimeoutMs?: string | number;
  readonly logLevel?: string;
}

export function parseAndValidateConfig(raw: RawConfigInput): AppConfig {
  const timeZone = raw.timeZone?.trim() || 'Europe/Paris';
  try {
    // Validate timezone string validity
    Intl.DateTimeFormat(undefined, { timeZone });
  } catch {
    throw new Error(`Invalid timeZone configuration: '${timeZone}'`);
  }

  const locale = raw.locale?.trim() || 'fr-FR';

  let musicProvidersOrder: ('itunes' | 'musicbrainz' | 'local')[];
  if (Array.isArray(raw.musicProvidersOrder)) {
    musicProvidersOrder = raw.musicProvidersOrder as ('itunes' | 'musicbrainz' | 'local')[];
  } else if (typeof raw.musicProvidersOrder === 'string') {
    musicProvidersOrder = raw.musicProvidersOrder
      .split(',')
      .map((s) => s.trim().toLowerCase()) as ('itunes' | 'musicbrainz' | 'local')[];
  } else {
    musicProvidersOrder = ['itunes', 'musicbrainz', 'local'];
  }

  const validProviders = new Set(['itunes', 'musicbrainz', 'local']);
  for (const p of musicProvidersOrder) {
    if (!validProviders.has(p)) {
      throw new Error(`Invalid music provider in config: '${p}'. Allowed: itunes, musicbrainz, local`);
    }
  }

  if (musicProvidersOrder.length === 0) {
    throw new Error('musicProvidersOrder cannot be empty');
  }

  const musicBrainzUserAgent =
    raw.musicBrainzUserAgent?.trim() || 'MusicalWakeUp/1.0.0 ( contact@example.com )';
  if (!musicBrainzUserAgent) {
    throw new Error('musicBrainzUserAgent must be a non-empty string identifiable by MusicBrainz');
  }

  const itunesRateLimitMaxRequests = Number(raw.itunesRateLimitMaxRequests ?? 20);
  if (!Number.isInteger(itunesRateLimitMaxRequests) || itunesRateLimitMaxRequests <= 0) {
    throw new Error('itunesRateLimitMaxRequests must be a positive integer');
  }

  const itunesRateLimitWindowMs = Number(raw.itunesRateLimitWindowMs ?? 60000);
  if (!Number.isFinite(itunesRateLimitWindowMs) || itunesRateLimitWindowMs <= 0) {
    throw new Error('itunesRateLimitWindowMs must be a positive number');
  }

  const circuitBreakerFailureThreshold = Number(raw.circuitBreakerFailureThreshold ?? 3);
  if (!Number.isInteger(circuitBreakerFailureThreshold) || circuitBreakerFailureThreshold <= 0) {
    throw new Error('circuitBreakerFailureThreshold must be a positive integer');
  }

  const circuitBreakerResetTimeoutMs = Number(raw.circuitBreakerResetTimeoutMs ?? 10000);
  if (!Number.isFinite(circuitBreakerResetTimeoutMs) || circuitBreakerResetTimeoutMs <= 0) {
    throw new Error('circuitBreakerResetTimeoutMs must be a positive number');
  }

  const cacheTtlSeconds = Number(raw.cacheTtlSeconds ?? 3600);
  const idempotencyTtlSeconds = Number(raw.idempotencyTtlSeconds ?? 86400);
  const httpTimeoutMs = Number(raw.httpTimeoutMs ?? 5000);

  const rawLevel = raw.logLevel?.toUpperCase() ?? 'INFO';
  const validLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const;
  const logLevel = validLevels.find((l) => l === rawLevel) ?? 'INFO';

  return Object.freeze({
    timeZone,
    locale,
    musicProvidersOrder: Object.freeze(musicProvidersOrder),
    musicBrainzUserAgent,
    itunesRateLimitMaxRequests,
    itunesRateLimitWindowMs,
    circuitBreakerFailureThreshold,
    circuitBreakerResetTimeoutMs,
    cacheTtlSeconds,
    idempotencyTtlSeconds,
    httpTimeoutMs,
    logLevel,
  });
}
