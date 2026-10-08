import { Track } from './Track.js';

export interface TrackResolution {
  readonly track: Track;
  readonly providerName: string;
  /** true when the track was not served by the first (preferred) provider of the chain. */
  readonly degraded: boolean;
}