import { IMusicProvider } from '../../domain/ports/IMusicProvider.js';
import { ITrackResolver } from '../../domain/ports/ITrackResolver.js';
import { Track } from '../../domain/models/Track.js';
import { TrackResolution } from '../../domain/models/TrackResolution.js';
import { MusicProviderError } from '../../domain/errors/DomainErrors.js';
import { ILogger } from '../../domain/ports/ILogger.js';

export class MusicProviderChain implements IMusicProvider, ITrackResolver {
  public readonly providerName = 'MusicProviderChain';

  constructor(
    private readonly providers: readonly IMusicProvider[],
    private readonly logger: ILogger,
  ) {
    if (providers.length === 0) {
      throw new Error('MusicProviderChain requires at least one music provider in chain');
    }
  }

  public async resolve(query: string): Promise<TrackResolution> {
    const errors: Array<{ provider: string; error: string }> = [];

    for (let index = 0; index < this.providers.length; index++) {
      const provider = this.providers[index] as IMusicProvider;
      try {
        this.logger.debug(`Attempting resolution with provider: ${provider.providerName}`, { query });
        const track = await provider.resolveTrack(query);
        this.logger.info(`Track successfully resolved by ${provider.providerName}`, { query, track });
        return { track, providerName: provider.providerName, degraded: index > 0 };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Provider ${provider.providerName} failed, falling back to next provider`, {
          provider: provider.providerName,
          query,
          error: message,
        });
        errors.push({ provider: provider.providerName, error: message });
      }
    }

    throw new MusicProviderError(
      `All music providers in chain failed for query '${query}': ${JSON.stringify(errors)}`,
      this.providerName,
    );
  }

  public async resolveTrack(query: string): Promise<Track> {
    return (await this.resolve(query)).track;
  }
}