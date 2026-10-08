import { IClock } from '../../domain/ports/IClock.js';

export class SystemClock implements IClock {
  public now(): Date {
    return new Date();
  }

  public todayDateString(timeZone: string): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(this.now());
  }

  public formatWakeUpMessage(
    dayOfWeek: string,
    weather: string,
    timeZone: string,
    locale: string,
  ): string {
    const timeFormatter = new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
    });
    const currentTime = timeFormatter.format(this.now());

    return `[${currentTime} - ${timeZone}] Bonjour ! En ce ${dayOfWeek}, le temps est : ${weather}. Bon réveil !`;
  }
}
