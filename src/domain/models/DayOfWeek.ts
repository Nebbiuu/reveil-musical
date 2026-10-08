export const DayOfWeek = {
  LUNDI: 'LUNDI',
  MARDI: 'MARDI',
  MERCREDI: 'MERCREDI',
  JEUDI: 'JEUDI',
  VENDREDI: 'VENDREDI',
  SAMEDI: 'SAMEDI',
  DIMANCHE: 'DIMANCHE',
} as const;

export type DayOfWeek = (typeof DayOfWeek)[keyof typeof DayOfWeek];

export const isDayOfWeek = (value: unknown): value is DayOfWeek => {
  return typeof value === 'string' && Object.values(DayOfWeek).includes(value as DayOfWeek);
};
