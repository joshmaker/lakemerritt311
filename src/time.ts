import { extent } from "d3-array";
import { utcMonth } from "d3-time";

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
 * Days from `from` to `to`, reading both as UTC so the result doesn't depend on
 * the viewer's timezone. Spans across a DST change are off by an hour.
 * NaN if either timestamp is an impossible date (e.g. month 13).
 */
export const daysBetween = (from: string, to: string): number =>
  (Date.parse(`${to}Z`) - Date.parse(`${from}Z`)) / MS_PER_DAY;

/**
 * The current time in California, in the dataset's format without milliseconds
 * ("2026-09-23T08:45:12"). The Swedish locale formats dates as ISO-like
 * "YYYY-MM-DD HH:MM:SS", so only the space needs replacing.
 */
export const californiaNow = (): string =>
  new Date().toLocaleString("sv-SE", { timeZone: "America/Los_Angeles" }).replace(" ", "T");

/** The timestamp `days` days before `timestamp`, reading it as UTC like `daysBetween`. */
export const daysBefore = (timestamp: string, days: number): string =>
  new Date(Date.parse(`${timestamp}Z`) - days * MS_PER_DAY).toISOString().slice(0, 19);
