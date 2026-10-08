import { IUserPreferencesProvider } from '../../domain/ports/IUserPreferencesProvider.js';
import { UserPreferences } from '../../domain/models/UserPreferences.js';

export class InMemoryUserPreferencesProvider implements IUserPreferencesProvider {
  private readonly store = new Map<string, UserPreferences>();

  constructor(initialPreferences: readonly UserPreferences[] = []) {
    for (const pref of initialPreferences) {
      this.setUserPreferences(pref);
    }
  }

  public async getUserPreferences(userId: string): Promise<UserPreferences | null> {
    const found = this.store.get(userId);
    return found ? { ...found } : null;
  }

  public setUserPreferences(preferences: UserPreferences): void {
    this.store.set(preferences.userId, preferences);
  }
}