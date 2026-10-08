import { describe, it, expect, beforeEach } from 'vitest';
import { FakeHttpClient } from '../fakes/FakeHttpClient.js';
import { SilentLogger } from '../fakes/SilentLogger.js';
import { ItunesMusicAdapter } from '../../src/infrastructure/music/ItunesMusicAdapter.js';
import { MusicBrainzMusicAdapter } from '../../src/infrastructure/music/MusicBrainzMusicAdapter.js';
import { MusicProviderError } from '../../src/domain/errors/DomainErrors.js';

describe('Music Adapters & Strict Boundary / Zero Leak Tests', () => {
  let fakeHttp: FakeHttpClient;
  let logger: SilentLogger;

  beforeEach(() => {
    fakeHttp = new FakeHttpClient();
    logger = new SilentLogger();
  });

  describe('ItunesMusicAdapter', () => {
    it('should successfully parse iTunes response into domain Track', async () => {
      fakeHttp.onGet('itunes.apple.com', () => ({
        status: 200,
        statusText: 'OK',
        data: {
          resultCount: 1,
          results: [
            {
              wrapperType: 'track',
              kind: 'song',
              artistName: 'Queen',
              trackName: 'Don\'t Stop Me Now',
              trackViewUrl: 'https://music.apple.com/us/album/dont-stop-me-now/1440806775?i=1440806950',
              previewUrl: 'https://audio-ssl.itunes.apple.com/preview.m4a',
              collectionName: 'Jazz',
              trackPrice: 1.29,
            },
          ],
        },
      }));

      const adapter = new ItunesMusicAdapter(fakeHttp, logger);
      const track = await adapter.resolveTrack('Queen Don\'t Stop Me Now');

      expect(track).toEqual({
        title: 'Don\'t Stop Me Now',
        artist: 'Queen',
      });
    });

    it('STRICT BOUNDARY TEST: trackViewUrl and internal iTunes fields must NEVER leak into domain Track', async () => {
      const sensitiveUrl = 'https://music.apple.com/secret-track-view-url-token';
      fakeHttp.onGet('itunes.apple.com', () => ({
        status: 200,
        statusText: 'OK',
        data: {
          resultCount: 1,
          results: [
            {
              artistName: 'Daft Punk',
              trackName: 'Get Lucky',
              trackViewUrl: sensitiveUrl,
              collectionId: 99999,
              previewUrl: 'https://preview.apple.com/test',
              isStreamable: true,
            },
          ],
        },
      }));

      const adapter = new ItunesMusicAdapter(fakeHttp, logger);
      const track = await adapter.resolveTrack('Get Lucky');

      // Direct property existence check
      expect(track).not.toHaveProperty('trackViewUrl');
      expect(track).not.toHaveProperty('collectionId');
      expect(track).not.toHaveProperty('previewUrl');
      expect(track).not.toHaveProperty('isStreamable');

      // Type inspection & enumeration check
      const keys = Object.keys(track);
      expect(keys).toEqual(['title', 'artist']);

      // Ensure serialized JSON contains zero vendor metadata
      const serialized = JSON.stringify(track);
      expect(serialized).not.toContain(sensitiveUrl);
      expect(serialized).not.toContain('previewUrl');
      expect(serialized).not.toContain('collectionId');
    });

    it('should throw MusicProviderError when iTunes returns 0 results', async () => {
      fakeHttp.onGet('itunes.apple.com', () => ({
        status: 200,
        statusText: 'OK',
        data: {
          resultCount: 0,
          results: [],
        },
      }));

      const adapter = new ItunesMusicAdapter(fakeHttp, logger);
      await expect(adapter.resolveTrack('UnknownNonExistentTrack12345')).rejects.toThrowError(
        MusicProviderError,
      );
    });

    it('should throw MusicProviderError on network or HTTP error', async () => {
      fakeHttp.onGet('itunes.apple.com', () => {
        throw new Error('Network failure / connection reset');
      });

      const adapter = new ItunesMusicAdapter(fakeHttp, logger);
      await expect(adapter.resolveTrack('Any Track')).rejects.toThrowError(MusicProviderError);
    });
  });

  describe('MusicBrainzMusicAdapter', () => {
    const userAgent = 'MusicalWakeUpApp/1.0.0 ( contact@mycompany.org )';

    it('should send the configured User-Agent header in HTTP request', async () => {
      fakeHttp.onGet('musicbrainz.org', () => ({
        status: 200,
        statusText: 'OK',
        data: {
          recordings: [
            {
              id: 'mb-1',
              title: 'Feeling Good',
              'artist-credit': [{ name: 'Nina Simone' }],
            },
          ],
        },
      }));

      const adapter = new MusicBrainzMusicAdapter(fakeHttp, logger, userAgent);
      await adapter.resolveTrack('Nina Simone Feeling Good');

      expect(fakeHttp.requestHistory.length).toBe(1);
      const request = fakeHttp.requestHistory[0];
      expect(request?.options?.headers?.['User-Agent']).toBe(userAgent);
    });

    it('STRICT BOUNDARY TEST: MusicBrainz recordings/artist-credit fields must never leak into Track', async () => {
      fakeHttp.onGet('musicbrainz.org', () => ({
        status: 200,
        statusText: 'OK',
        data: {
          recordings: [
            {
              id: 'mb-uuid-999',
              title: 'Feeling Good',
              'artist-credit': [{ name: 'Nina Simone' }],
            },
          ],
        },
      }));

      const adapter = new MusicBrainzMusicAdapter(fakeHttp, logger, userAgent);
      const track = await adapter.resolveTrack('Feeling Good');

      expect(track).toEqual({
        title: 'Feeling Good',
        artist: 'Nina Simone',
      });
      expect(track).not.toHaveProperty('artist-credit');
      expect(track).not.toHaveProperty('recordings');
      expect(track).not.toHaveProperty('id');
      expect(Object.keys(track)).toEqual(['title', 'artist']);
    });

    it('should throw MusicProviderError when MusicBrainz has no matching recording', async () => {
      fakeHttp.onGet('musicbrainz.org', () => ({
        status: 200,
        statusText: 'OK',
        data: {
          recordings: [],
        },
      }));

      const adapter = new MusicBrainzMusicAdapter(fakeHttp, logger, userAgent);
      await expect(adapter.resolveTrack('Nonexistent Song')).rejects.toThrowError(
        MusicProviderError,
      );
    });
  });
});
