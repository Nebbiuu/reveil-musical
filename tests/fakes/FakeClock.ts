import { IClock } from '../../src/domain/ports/IClock.js';

export class FakeClock implements IClock {
  private currentTime: Date;

  constructor(initialIsoString: string = '2026-10-08T08:00:00.000Z') {
    this.currentTime = new Date(initialIsoString);
  }

  public now(): Date {
    return new Date(this.currentTime.getTime());
  }

  public advanceMs(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }

  public advanceSeconds(seconds: number): void {
    this.advanceMs(seconds * 1000);
  }

  public setDate(date: Date): void {
    this.currentTime = new Date(date.getTime());
  }

  public todayDateString(timeZone: string): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(this.currentTime);
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
    const formattedTime = timeFormatter.format(this.currentTime);
    return `[${formattedTime} - ${timeZone}] Bonjour ! En ce ${dayOfWeek}, le temps est : ${weather}. Bon réveil !`;
  }
}
