export interface IClock {
  now(): Date;
  todayDateString(timeZone: string): string;
  formatWakeUpMessage(dayOfWeek: string, weather: string, timeZone: string, locale: string): string;
}
