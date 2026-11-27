/** YYYY-MM-DD calendar arithmetic in UTC (no time-zone semantics). */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isoDate = (year: number, month: number, day: number): string => {
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.toISOString().slice(0, 10);
};

/** True for a real calendar date written as YYYY-MM-DD. */
export const isIsoDate = (value: string): boolean => {
  if (!ISO_DATE.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
};

export const addIsoDays = (date: string, delta: number): string =>
  isoDate(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)),
    Number(date.slice(8, 10)) + delta,
  );

/** 0 = Sunday … 6 = Saturday. */
export const isoWeekday = (date: string): number =>
  new Date(`${date}T00:00:00.000Z`).getUTCDay();
