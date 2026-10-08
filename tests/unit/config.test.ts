import { describe, it, expect } from 'vitest';
import { parseAndValidateConfig } from '../../src/infrastructure/config/AppConfig.js';

describe('AppConfig Parsing and Validation Tests', () => {
  it('should apply safe defaults when empty raw config is provided', () => {
    const config = parseAndValidateConfig({});

    expect(config.timeZone).toBe('Europe/Paris');
    expect(config.locale).toBe('fr-FR');
    expect(config.musicProvidersOrder).toEqual(['itunes', 'musicbrainz', 'local']);
    expect(config.itunesRateLimitMaxRequests).toBe(20);
    expect(config.itunesRateLimitWindowMs).toBe(60000);
    expect(config.circuitBreakerFailureThreshold).toBe(3);
    expect(config.cacheTtlSeconds).toBe(3600);
    expect(config.logLevel).toBe('INFO');
  });

  it('should accept custom provider order without recompilation', () => {
    const config = parseAndValidateConfig({
      musicProvidersOrder: 'musicbrainz, local',
    });

    expect(config.musicProvidersOrder).toEqual(['musicbrainz', 'local']);
  });

  it('should throw an error on invalid timezone', () => {
    expect(() => parseAndValidateConfig({ timeZone: 'Invalid/City_Nowhere' })).toThrowError(
      /Invalid timeZone/,
    );
  });

  it('should throw an error on invalid music provider', () => {
    expect(() =>
      parseAndValidateConfig({ musicProvidersOrder: ['spotify', 'local'] }),
    ).toThrowError(/Invalid music provider/);
  });

  it('should throw an error on non-positive rate limit or thresholds', () => {
    expect(() =>
      parseAndValidateConfig({ itunesRateLimitMaxRequests: -5 }),
    ).toThrowError(/itunesRateLimitMaxRequests/);

    expect(() =>
      parseAndValidateConfig({ circuitBreakerFailureThreshold: 0 }),
    ).toThrowError(/circuitBreakerFailureThreshold/);
  });
});
