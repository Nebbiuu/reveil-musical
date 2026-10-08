import { IMusicProvider } from '../../domain/ports/IMusicProvider.js';
import { Track } from '../../domain/models/Track.js';
import { MusicProviderError } from '../../domain/errors/DomainErrors.js';
import { IHttpClient } from '../../domain/ports/IHttpClient.js';
import { ILogger } from '../../domain/ports/ILogger.js';

interface ItunesItemResponse {
  readonly trackName?: string;
  readonly artistName?: string;
  readonly trackViewUrl?: string;
  readonly kind?: string;
}

interface ItunesSearchResponse {
  readonly resultCount: number;
  readonly results: readonly ItunesItemResponse[];
}

export class ItunesMusicAdapter implements IMusicProvider {
  public readonly providerName = 'iTunes';
  private readonly baseUrl: string;

  constructor(
    private readonly httpClient: IHttpClient,
    private readonly logger: ILogger,
    baseUrl: string = 'https://itunes.apple.com/search',
  ) {
    this.baseUrl = baseUrl;
  }

  public async resolveTrack(query: string): Promise<Track> {
    const trimmed = query.trim();
    if (!trimmed) {
      throw new MusicProviderError('Empty query provided to iTunes provider', this.providerName);
    }

    const url = `${this.baseUrl}?term=${encodeURIComponent(trimmed)}&media=music&limit=5`;
    this.logger.debug('Querying iTunes search API', { query: trimmed });

    try {
      const response = await this.httpClient.get<ItunesSearchResponse>(url);
      const results = response.data?.results ?? [];

      const candidate = results.find(
        (item) => item.trackName && item.artistName && item.trackName.trim().length > 0,
      );

      if (!candidate || !candidate.trackName || !candidate.artistName) {
        throw new MusicProviderError(
          `No track matching '${trimmed}' found on iTunes`,
          this.providerName,
        );
      }

      // CRITICAL SECURITY / BOUNDARY CONSTRAINT:
      // candidate.trackViewUrl is an iTunes internal property and MUST NOT leak outside this adapter.
      // We return ONLY the pure domain Track DTO { title, artist }.
      return Object.freeze({
        title: candidate.trackName.trim(),
        artist: candidate.artistName.trim(),
      });
    } catch (error) {
      if (error instanceof MusicProviderError) {
        throw error;
      }
      this.logger.warn('iTunes API call failed', {
        query: trimmed,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new MusicProviderError(
        `Failed to resolve track from iTunes: ${error instanceof Error ? error.message : String(error)}`,
        this.providerName,
        error,
      );
    }
  }
}
