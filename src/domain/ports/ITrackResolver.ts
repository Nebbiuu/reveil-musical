import { TrackResolution } from '../models/TrackResolution.js';

export interface ITrackResolver {
  resolve(query: string): Promise<TrackResolution>;
}