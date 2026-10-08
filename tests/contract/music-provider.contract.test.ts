import { describe, it, expect, beforeEach } from 'vitest';
import { IMusicProvider } from '../../src/domain/ports/IMusicProvider.js';
import { FakeHttpClient } from '../fakes/FakeHttpClient.js';
import { FakeClock } from '../fakes/FakeClock.js';
import { SilentLogger } from '../fakes/SilentLogger.js';
import { InMemoryCache } from '../../src/infrastructure/system/InMemoryCache.js';
import { ItunesMusicAdapter } from '../../src/infrastructure/music/ItunesMusicAdapter.js';
import { MusicBrainzMusicAdapter } from '../../src/infrastructure/music/MusicBrainzMusicAdapter.js';
import { LocalFallbackMusicAdapter } from '../../src/infrastructure/music/LocalFallbackMusicAdapter.js';
import { CachedMusicProviderDecorator } from '../../src/infrastructure/music/CachedMusicProviderDecorator.js';
import { ResilientMusicProviderDecorator } from '../../src/infrastructure/music/ResilientMusicProviderDecorator.js';
import { MusicProviderChain } from '../../src/infrastructure/music/MusicProviderChain.js';
import { MusicProviderError } from '../../src/domain/errors/DomainErrors.js';

interface ProviderFactory {
  name: string;
  create: () => { provider: IMusicProvider; validQuery: string };
}

describe('MusicProvider Contract Tests', () => {
  let fakeHttp: FakeHttpClient;
  let logger: SilentLogger;
  let clock: FakeClock;
  let cache: InMemoryCache;

  beforeEach(() => {
    fakeHttp = new FakeHttpClient();
    logger = new SilentLogger();
    clock = new FakeClock();
    cache = new InMemoryCache(clock);

    // Setup HTTP mocks for external providers
    fakeHttp.onGet('itunes.apple.com', () => ({
      status: 200,
      statusText: 'OK',
      data: {
        resultCount: 1,
        results: [
          {
            trackName: 'Here Comes the Sun',
            artistName: 'The Beatles',
            trackViewUrl: 'https://music.apple.com/hidden-url',
          },
        ],
      },
    }));

    fakeHttp.onGet('musicbrainz.org', () => ({
      status: 200,
      statusText: 'OK',
      data: {
        recordings: [
          {
            id: 'rec-123',
            title: 'Here Comes the Sun',
            'artist-credit': [{ name: 'The Beatles' }],
          },
        ],
      },
    }));
  });

  const factories: ProviderFactory[] = [
    {
      name: 'ItunesMusicAdapter',
      create: () => ({
        provider: new ItunesMusicAdapter(fakeHttp, logger),
        validQuery: 'The Beatles Here Comes The Sun',
      }),
    },
    {
      name: 'MusicBrainzMusicAdapter',
      create: () => ({
        provider: new MusicBrainzMusicAdapter(fakeHttp, logger, 'TestApp/1.0'),
        validQuery: 'The Beatles Here Comes The Sun',
      }),
    },
    {
      name: 'LocalFallbackMusicAdapter',
      create: () => ({
        provider: new LocalFallbackMusicAdapter(logger),
        validQuery: 'soleil',
      }),
    },
    {
      name: 'CachedMusicProviderDecorator',
      create: () => {
        const local = new LocalFallbackMusicAdapter(logger);
        return {
          provider: new CachedMusicProviderDecorator(local, cache, logger),
          validQuery: 'soleil',
        };
      },
    },
    {
      name: 'ResilientMusicProviderDecorator',
      create: () => {
        const local = new LocalFallbackMusicAdapter(logger);
        return {
          provider: new ResilientMusicProviderDecorator(local, {}, logger),
          validQuery: 'soleil',
        };
      },
    },
    {
      name: 'MusicProviderChain',
      create: () => {
        const local = new LocalFallbackMusicAdapter(logger);
        return {
          provider: new MusicProviderChain([local], logger),
          validQuery: 'soleil',
        };
      },
    },
  ];

  factories.forEach(({ name, create }) => {
    describe(`Contract implementation: ${name}`, () => {
      it('should expose a non-empty providerName', () => {
        const { provider } = create();
        expect(provider.providerName).toBeDefined();
        expect(provider.providerName.length).toBeGreaterThan(0);
      });

      it('should resolve a valid query to a domain Track with non-empty title and artist', async () => {
        const { provider, validQuery } = create();
        const track = await provider.resolveTrack(validQuery);

        expect(track).toBeDefined();
        expect(typeof track.title).toBe('string');
        expect(track.title.trim().length).toBeGreaterThan(0);
        expect(typeof track.artist).toBe('string');
        expect(track.artist.trim().length).toBeGreaterThan(0);
      });

      it('should strictly return ONLY Track { title, artist } without vendor leaks', async () => {
        const { provider, validQuery } = create();
        const track = await provider.resolveTrack(validQuery);

        const keys = Object.keys(track);
        expect(keys.sort()).toEqual(['artist', 'title'].sort());
        expect((track as Record<string, unknown>)['trackViewUrl']).toBeUndefined();
        expect((track as Record<string, unknown>)['artist-credit']).toBeUndefined();
        expect((track as Record<string, unknown>)['recordings']).toBeUndefined();
      });

      it('should reject or handle empty string query predictably', async () => {
        const { provider } = create();
        try {
          const track = await provider.resolveTrack('   ');
          expect(track).toBeDefined();
          expect(track.title.length).toBeGreaterThan(0);
        } catch (error) {
          expect(error).toBeInstanceOf(MusicProviderError);
        }
      });
    });
  });
});
