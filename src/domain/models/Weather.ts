export const Weather = {
  SOLEIL: 'SOLEIL',
  PLUIE: 'PLUIE',
  NEIGE: 'NEIGE',
  NUAGEUX: 'NUAGEUX',
} as const;

export type Weather = (typeof Weather)[keyof typeof Weather];

export const isWeather = (value: unknown): value is Weather => {
  return typeof value === 'string' && Object.values(Weather).includes(value as Weather);
};
