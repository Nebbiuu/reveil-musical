import { IMusicProvider } from '../../domain/ports/IMusicProvider.js';
import { Track } from '../../domain/models/Track.js';
import { MusicProviderError } from '../../domain/errors/DomainErrors.js';
import { ILogger } from '../../domain/ports/ILogger.js';

export class MusicProviderChain implements IMusicProvider {
  public readonly providerName = 'MusicProviderChain';

  constructor(
    private readonly providers: readonly IMusicProvider[],
    private readonly logger: ILogger,
  ) {
    if (providers.length === 0) {
      throw new Error('MusicProviderChain requires at least one music provider in chain');
    }
  }

  public async resolveTrack(query: string): Promise<Track> {
    const errors: Array<{ provider: string; error: string }> = [];

    for (const provider of this.providers) {
      try {
        this.logger.debug(`Attempting resolution with provider: ${provider.providerName}`, { query });
        const result = await provider.resolveTrack(query);
        this.logger.info(`Track successfully resolved by ${provider.providerName}`, {
          query,
          track: result,
        });
        return result;
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
}
