import { IUserPreferencesProvider } from '../../domain/ports/IUserPreferencesProvider.js';
import { UserPreferences } from '../../domain/models/UserPreferences.js';
import { Weather } from '../../domain/models/Weather.js';
import { NotificationChannelType } from '../../domain/models/NotificationChannelType.js';

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

  public static createDefaultSeed(): InMemoryUserPreferencesProvider {
    return new InMemoryUserPreferencesProvider([
      {
        userId: 'user-alice',
        trackByWeather: {
          [Weather.SOLEIL]: 'Walking on Sunshine',
          [Weather.PLUIE]: 'Purple Rain',
          [Weather.NEIGE]: 'Cold as Ice',
          [Weather.NUAGEUX]: 'Cloudbusting',
        },
        fallbackTrack: 'Here Comes The Sun',
        preferredChannel: NotificationChannelType.EMAIL,
        fallbackChannel: NotificationChannelType.SMS,
      },
      {
        userId: 'user-bob-partial-weather',
        // Weather NEIGE and NUAGEUX deliberately omitted to test fallback
        trackByWeather: {
          [Weather.SOLEIL]: 'Good Day Sunshine',
        },
        fallbackTrack: 'Stand By Me',
        preferredChannel: NotificationChannelType.SMS,
        fallbackChannel: NotificationChannelType.PUSH,
      },
      {
        userId: 'user-charlie-push',
        trackByWeather: {
          [Weather.SOLEIL]: 'Mr Blue Sky',
          [Weather.PLUIE]: 'Set Fire to the Rain',
          [Weather.NEIGE]: 'Snow (Hey Oh)',
          [Weather.NUAGEUX]: 'Get Lucky',
        },
        fallbackTrack: 'Bohemian Rhapsody',
        preferredChannel: NotificationChannelType.PUSH,
      },
    ]);
  }
}
