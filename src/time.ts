import { extent } from "d3-array";
import { utcDay, utcMonth, utcSunday } from "d3-time";

// Dataset timestamps are ISO 8601 with no offset ("2026-09-21T15:45:14.000") in
// California time. `new Date()` would read them in the viewer's timezone, so we
// work on the strings where we can and otherwise read them as UTC, which gives
// the same answer for every viewer.

const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** True if `value` is a well-formed dataset timestamp. */
export const isTimestamp = (value: string | undefined): value is string =>
  value !== undefined && TIMESTAMP_RE.test(value);

/** "YYYY-MM" key for a timestamp or ISO date string. Sorts chronologically as a string. */
export const monthKey = (iso: string): string => iso.slice(0, 7);

/**
 * Every month key from the earliest to the latest in `months`, inclusive, so
 * months with no data still get a slot on the axis instead of being skipped.
 */
export const monthsSpanning = (months: Iterable<string>): string[] => {
  const [first, last] = extent(months);
  if (first === undefined) return []; // `extent` returns both or neither.
  const toDate = (month: string) => new Date(`${month}-01T00:00:00Z`);
  return utcMonth.range(toDate(first), utcMonth.offset(toDate(last), 1)).map((date) => monthKey(date.toISOString()));
};

/**
 * The current time in California, in the dataset's format without milliseconds
 * ("2026-09-23T08:45:12"). The Swedish locale formats dates as ISO-like
 * "YYYY-MM-DD HH:MM:SS", so only the space needs replacing.
 */
export const californiaNow = (): string =>
  new Date().toLocaleString("sv-SE", { timeZone: "America/Los_Angeles" }).replace(" ", "T");

/** The timestamp `days` days before `timestamp`, reading it as UTC (see the note at the top). */
export const daysBefore = (timestamp: string, days: number): string =>
  new Date(Date.parse(`${timestamp}Z`) - days * MS_PER_DAY).toISOString().slice(0, 19);

/**
 * The same wall-clock moment `years` years earlier, by editing the year digits.
 * Leaves Feb 29 as-is (e.g. "2027-02-29"); that's fine for string range bounds.
 */
export const yearsBefore = (timestamp: string, years: number): string =>
  `${String(Number(timestamp.slice(0, 4)) - years)}${timestamp.slice(4)}`;

/** January 1 of the timestamp's year, as an ISO date. */
export const startOfYear = (timestamp: string): string => `${timestamp.slice(0, 4)}-01-01`;

const dateOf = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/** The Sunday that starts the timestamp's week, as an ISO date ("2026-09-20"). */
export const weekStart = (timestamp: string): string => isoDate(utcSunday.floor(dateOf(timestamp)));

export interface Week {
  /** The week's Sunday, as an ISO date; matches `weekStart`. */
  key: string;
  /** First and last day covered, clipped to the requested range. */
  start: string;
  end: string;
}

/** Every Sunday-start week that overlaps `from` through `to` (ISO dates or timestamps), clipped to that range. */
export const weeksBetween = (from: string, to: string): Week[] => {
  const [first, last] = [from.slice(0, 10), to.slice(0, 10)];
  return utcSunday.range(utcSunday.floor(dateOf(first)), utcDay.offset(dateOf(last), 1)).map((sunday) => {
    const key = isoDate(sunday);
    const saturday = isoDate(utcDay.offset(sunday, 6));
    return { key, start: key < first ? first : key, end: saturday > last ? last : saturday };
  });
};

/** True if `week` covers fewer than all seven days (the first week of the year, or the current one). */
export const isPartialWeek = ({ key, start, end }: Week): boolean =>
  start !== key || isoDate(utcDay.offset(dateOf(key), 6)) !== end;

/** Whole days from `from` to `to`, reading both as UTC (see the note at the top). */
export const daysBetween = (from: string, to: string): number =>
  Math.floor((Date.parse(`${to}Z`) - Date.parse(`${from}Z`)) / MS_PER_DAY);

/** The ISO date `months` calendar months before `timestamp`'s date. */
export const monthsBefore = (timestamp: string, months: number): string =>
  isoDate(utcMonth.offset(dateOf(timestamp), -months));
