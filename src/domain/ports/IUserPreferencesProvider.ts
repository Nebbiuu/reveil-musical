import { UserPreferences } from '../models/UserPreferences.js';

export interface IUserPreferencesProvider {
  getUserPreferences(userId: string): Promise<UserPreferences | null>;
}
