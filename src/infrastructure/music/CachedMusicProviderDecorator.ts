import { IMusicProvider } from '../../domain/ports/IMusicProvider.js';
import { Track } from '../../domain/models/Track.js';
import { ICache } from '../../domain/ports/ICache.js';
import { ILogger } from '../../domain/ports/ILogger.js';

export class CachedMusicProviderDecorator implements IMusicProvider {
  public readonly providerName: string;

  constructor(
    private readonly inner: IMusicProvider,
    private readonly cache: ICache,
    private readonly logger: ILogger,
    private readonly ttlSeconds: number = 3600,
  ) {
    this.providerName = `${inner.providerName}:Cached`;
  }

  public async resolveTrack(query: string): Promise<Track> {
    const cacheKey = `track:${this.inner.providerName}:${query.toLowerCase().trim()}`;
    const cached = await this.cache.get<Track>(cacheKey);

    if (cached) {
      this.logger.debug('Cache hit for music resolution', {
        provider: this.inner.providerName,
        query,
        track: cached,
      });
      return cached;
    }

    this.logger.debug('Cache miss for music resolution, delegating to inner provider', {
      provider: this.inner.providerName,
      query,
    });

    const resolved = await this.inner.resolveTrack(query);
    await this.cache.set(cacheKey, resolved, this.ttlSeconds);
    return resolved;
  }
}
