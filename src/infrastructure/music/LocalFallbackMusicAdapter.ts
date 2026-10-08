import { IMusicProvider } from '../../domain/ports/IMusicProvider.js';
import { Track } from '../../domain/models/Track.js';
import { ILogger } from '../../domain/ports/ILogger.js';

export interface LocalFallbackTrackItem {
  readonly keywords: readonly string[];
  readonly track: Track;
}

export class LocalFallbackMusicAdapter implements IMusicProvider {
  public readonly providerName = 'LocalFallback';

  private static readonly DEFAULT_FALLBACK: Track = Object.freeze({
    title: 'Morning Mood (Peer Gynt Suite)',
    artist: 'Edvard Grieg',
  });

  private static readonly CATALOG: readonly LocalFallbackTrackItem[] = Object.freeze([
    {
      keywords: ['soleil', 'sun', 'sunny', 'bright', 'summer'],
      track: Object.freeze({ title: 'Here Comes The Sun', artist: 'The Beatles' }),
    },
    {
      keywords: ['pluie', 'rain', 'rainy', 'water'],
      track: Object.freeze({ title: 'Singin\' In The Rain', artist: 'Gene Kelly' }),
    },
    {
      keywords: ['neige', 'snow', 'snowy', 'cold', 'winter'],
      track: Object.freeze({ title: 'Winter Wonderland', artist: 'Dean Martin' }),
    },
    {
      keywords: ['nuageux', 'cloud', 'cloudy', 'overcast'],
      track: Object.freeze({ title: 'Riders On The Storm', artist: 'The Doors' }),
    },
    {
      keywords: ['morning', 'reveil', 'wake', 'up'],
      track: Object.freeze({ title: 'Lovely Day', artist: 'Bill Withers' }),
    },
  ]);

  constructor(private readonly logger: ILogger) {}

  public async resolveTrack(query: string): Promise<Track> {
    const normalized = query.toLowerCase().trim();
    this.logger.debug('Resolving track from local fallback catalog', { query: normalized });

    for (const item of LocalFallbackMusicAdapter.CATALOG) {
      if (
        item.keywords.some((kw) => normalized.includes(kw)) ||
        normalized.includes(item.track.title.toLowerCase()) ||
        normalized.includes(item.track.artist.toLowerCase())
      ) {
        return item.track;
      }
    }

    // Reliable guarantee: if query does not match any keyword, return default classical morning song
    return LocalFallbackMusicAdapter.DEFAULT_FALLBACK;
  }
}
