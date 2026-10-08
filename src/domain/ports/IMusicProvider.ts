import { Track } from '../models/Track.js';

export interface IMusicProvider {
  readonly providerName: string;
  resolveTrack(query: string): Promise<Track>;
}
