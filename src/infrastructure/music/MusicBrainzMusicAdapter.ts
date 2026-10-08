import { IMusicProvider } from '../../domain/ports/IMusicProvider.js';
import { Track } from '../../domain/models/Track.js';
import { MusicProviderError } from '../../domain/errors/DomainErrors.js';
import { IHttpClient } from '../../domain/ports/IHttpClient.js';
import { ILogger } from '../../domain/ports/ILogger.js';

interface MusicBrainzArtistCredit {
  readonly name?: string;
}

interface MusicBrainzRecordingItem {
  readonly id?: string;
  readonly title?: string;
  readonly 'artist-credit'?: readonly MusicBrainzArtistCredit[];
}

interface MusicBrainzSearchResponse {
  readonly recordings?: readonly MusicBrainzRecordingItem[];
}

export class MusicBrainzMusicAdapter implements IMusicProvider {
  public readonly providerName = 'MusicBrainz';
  private readonly baseUrl: string;
  private readonly userAgent: string;

  constructor(
    private readonly httpClient: IHttpClient,
    private readonly logger: ILogger,
    userAgent: string,
    baseUrl: string = 'https://musicbrainz.org/ws/2/recording',
  ) {
    this.userAgent = userAgent;
    this.baseUrl = baseUrl;
  }

  public async resolveTrack(query: string): Promise<Track> {
    const trimmed = query.trim();
    if (!trimmed) {
      throw new MusicProviderError('Empty query provided to MusicBrainz provider', this.providerName);
    }

    const url = `${this.baseUrl}?query=${encodeURIComponent(trimmed)}&fmt=json`;
    this.logger.debug('Querying MusicBrainz recording API', { query: trimmed, userAgent: this.userAgent });

    try {
      const response = await this.httpClient.get<MusicBrainzSearchResponse>(url, {
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/json',
        },
      });

      const recordings = response.data?.recordings ?? [];
      const candidate = recordings.find(
        (rec) =>
          rec.title &&
          rec.title.trim().length > 0 &&
          rec['artist-credit'] &&
          rec['artist-credit'].length > 0 &&
          rec['artist-credit'][0]?.name,
      );

      if (!candidate || !candidate.title || !candidate['artist-credit']?.[0]?.name) {
        throw new MusicProviderError(
          `No recording matching '${trimmed}' found on MusicBrainz`,
          this.providerName,
        );
      }

      const artistName = candidate['artist-credit'][0].name.trim();
      const title = candidate.title.trim();

      return Object.freeze({
        title,
        artist: artistName,
      });
    } catch (error) {
      if (error instanceof MusicProviderError) {
        throw error;
      }
      this.logger.warn('MusicBrainz API call failed', {
        query: trimmed,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new MusicProviderError(
        `Failed to resolve track from MusicBrainz: ${error instanceof Error ? error.message : String(error)}`,
        this.providerName,
        error,
      );
    }
  }
}
