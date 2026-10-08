import { describe, it, expect, beforeEach } from 'vitest';
import { buildApplicationContainer, ApplicationContainer } from '../../src/composition-root/container.js';
import { FakeHttpClient } from '../fakes/FakeHttpClient.js';
import { FakeClock } from '../fakes/FakeClock.js';
import { SilentLogger } from '../fakes/SilentLogger.js';
import { DayOfWeek } from '../../src/domain/models/DayOfWeek.js';
import { Weather } from '../../src/domain/models/Weather.js';

describe('End-to-End sendWakeUp Pipeline Tests (with Fakes, zero real network)', () => {
  let fakeHttp: FakeHttpClient;
  let fakeClock: FakeClock;
  let logger: SilentLogger;
  let container: ApplicationContainer;

  beforeEach(() => {
    fakeHttp = new FakeHttpClient();
    fakeClock = new FakeClock('2026-10-08T06:30:00.000Z');
    logger = new SilentLogger();

    // Mock iTunes API route
    fakeHttp.onGet('itunes.apple.com', () => ({
      status: 200,
      statusText: 'OK',
      data: {
        resultCount: 1,
        results: [
          {
            trackName: 'Walking on Sunshine',
            artistName: 'Katrina and the Waves',
            trackViewUrl: 'https://music.apple.com/hidden-url',
          },
        ],
      },
    }));

    // Mock MusicBrainz API route
    fakeHttp.onGet('musicbrainz.org', () => ({
      status: 200,
      statusText: 'OK',
      data: {
        recordings: [
          {
            id: 'rec-001',
            title: 'Good Day Sunshine',
            'artist-credit': [{ name: 'The Beatles' }],
          },
        ],
      },
    }));

    container = buildApplicationContainer({
      httpClient: fakeHttp,
      clock: fakeClock,
      logger,
      config: {
        timeZone: 'Europe/Paris',
        locale: 'fr-FR',
        musicProvidersOrder: ['itunes', 'musicbrainz', 'local'],
      },
    });
  });

  it('NOMINAL FLOW: user-alice wakes up on SOLEIL -> resolves via iTunes -> sends EMAIL -> non-degraded', async () => {
    const result = await container.sendWakeUpUseCase.sendWakeUp('user-alice', DayOfWeek.JEUDI, Weather.SOLEIL);

    expect(result).toEqual({
      track: {
        title: 'Walking on Sunshine',
        artist: 'Katrina and the Waves',
      },
      channelUsed: 'EMAIL',
      degraded: false,
    });
  });

  it('DEGRADED WEATHER FLOW: user-bob-partial-weather wakes up on PLUIE -> weather not covered -> fallback track -> degraded', async () => {
    // user-bob-partial-weather only has SOLEIL covered in default seed
    const result = await container.sendWakeUpUseCase.sendWakeUp(
      'user-bob-partial-weather',
      DayOfWeek.JEUDI,
      Weather.PLUIE,
    );

    expect(result.degraded).toBe(true);
    expect(result.channelUsed).toBe('SMS'); // Bob's preferred channel
    expect(result.track).toBeDefined();
  });

  it('IDEMPOTENCE FLOW: calling twice on same day returns exact same result without duplicate HTTP requests', async () => {
    const initialHttpCount = fakeHttp.requestHistory.length;

    const res1 = await container.sendWakeUpUseCase.sendWakeUp('user-alice', DayOfWeek.JEUDI, Weather.SOLEIL);
    const countAfterFirst = fakeHttp.requestHistory.length;
    expect(countAfterFirst).toBeGreaterThan(initialHttpCount);

    const res2 = await container.sendWakeUpUseCase.sendWakeUp('user-alice', DayOfWeek.JEUDI, Weather.SOLEIL);
    const countAfterSecond = fakeHttp.requestHistory.length;

    // No new HTTP requests made because of idempotency store hit
    expect(countAfterSecond).toBe(countAfterFirst);
    expect(res2).toEqual(res1);
  });

  it('MUSIC PROVIDER RESILIENCE: when iTunes fails, cascades to MusicBrainz', async () => {
    // Override fakeHttp to fail on iTunes but succeed on MusicBrainz
    fakeHttp.onGet('itunes.apple.com', () => {
      throw new Error('iTunes 503 Service Unavailable');
    });

    const result = await container.sendWakeUpUseCase.sendWakeUp(
      'user-bob-partial-weather',
      DayOfWeek.VENDREDI,
      Weather.SOLEIL,
    );

    expect(result.track).toEqual({
      title: 'Good Day Sunshine',
      artist: 'The Beatles',
    });
    expect(result.channelUsed).toBe('SMS');
  });

  it('FULL MUSIC CATASTROPHE: when iTunes and MusicBrainz both fail, cascades to LocalFallback', async () => {
    fakeHttp.onGet('itunes.apple.com', () => {
      throw new Error('iTunes 500 error');
    });
    fakeHttp.onGet('musicbrainz.org', () => {
      throw new Error('MusicBrainz 500 error');
    });

    const result = await container.sendWakeUpUseCase.sendWakeUp(
      'user-charlie-push',
      DayOfWeek.SAMEDI,
      Weather.SOLEIL,
    );

    // LocalFallback resolves 'soleil' keyword to 'Here Comes The Sun'
    expect(result.track).toBeDefined();
    expect(result.track.artist).toBeDefined();
    expect(result.channelUsed).toBe('PUSH');
  });
});
