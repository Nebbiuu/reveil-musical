import type { IMusicProvider } from '../../src/domain/ports/IMusicProvider.js';
import type { ITrackResolver } from '../../src/domain/ports/ITrackResolver.js';

/** Wraps a plain IMusicProvider fake into the ITrackResolver port expected by the use case. */
export function asTrackResolver(provider: IMusicProvider, degraded = false): ITrackResolver {
  return {
    resolve: async (query: string) => ({
      track: await provider.resolveTrack(query),
      providerName: provider.providerName,
      degraded,
    }),
  };
}