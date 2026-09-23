import { groupSort, rollup } from "d3-array";
import { TOPICS, type Topic, topicOf } from "./topics";
import {
  daysBefore,
  isTimestamp,
  monthKey,
  monthsSpanning,
  startOfYear,
  type Week,
  weeksBetween,
  weekStart,
  yearsBefore,
} from "./time";
import type { ServiceRequest, ServiceRequests } from "./types/serviceRequest";

/** Charts start here. ISO timestamps sort as strings, so compare them directly. */
const START_DATE = "2018-01-01";

/** Name of the series that sums every value outside the top N. */
export const ALL_OTHERS = "All others";

const TEST_DESCRIPTIONS = new Set(["test template", "This is a test subject. Ignore this ticket."]);

/** Fetches the 311 export and drops test tickets. */
export const loadRequests = async (url: string, signal?: AbortSignal): Promise<ServiceRequests> => {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${String(res.status)}`);
  const json: unknown = await res.json();
  if (!Array.isArray(json)) throw new Error(`Expected a JSON array from ${url}`);
  return (json as ServiceRequests).filter((row) => !TEST_DESCRIPTIONS.has(row.description));
};

/** Fields that can split the counts into series. "topic" is derived from the description (see topics.ts). */
export type ChartField = "reqcategory" | "topic";

const fieldValue = (row: ServiceRequest, field: ChartField): string => {
  if (field === "topic") {
    // The "Other" topic is already a catch-all, so it shares the "All others" series.
    const topic = topicOf(row.description);
    return topic === "Other" ? ALL_OTHERS : topic;
  }
  return row[field];
};

export interface StackedCounts {
  /** One key per bar, in order ("YYYY-MM" months or week-start dates). */
  periods: string[];
  series: { name: string; data: number[] }[];
}

/**
 * Which values get their own series: a number means the N most common, in order;
 * a list names them explicitly (e.g. another chart's series, so colors match).
 */
export type SeriesChoice = number | readonly string[];

/**
 * Counts `items` per period and value. The chosen values each get a series; the
 * rest are summed into one "All others" series, which comes last.
 */
const stackedCounts = (
  items: { period: string; value: string }[],
  periods: string[],
  choice: SeriesChoice,
): StackedCounts => {
  const candidates =
    typeof choice === "number" ? groupSort(items, (group) => -group.length, (d) => d.value) : choice;
  const named = candidates.filter((value) => value !== ALL_OTHERS);
  const top = new Set(typeof choice === "number" ? named.slice(0, choice) : named);
  const names = items.some((d) => !top.has(d.value)) ? [...top, ALL_OTHERS] : [...top];
  const counts = rollup(
    items,
    (group) => group.length,
    (d) => (top.has(d.value) ? d.value : ALL_OTHERS),
    (d) => d.period,
  );
  return {
    periods,
    series: names.map((name) => ({ name, data: periods.map((period) => counts.get(name)?.get(period) ?? 0) })),
  };
};

/** Requests opened per month since START_DATE, split by `field` into the chosen values plus "All others". */
export const monthlyCounts = (rows: ServiceRequests, field: ChartField, choice: SeriesChoice): StackedCounts => {
  const items = rows.flatMap((row) => {
    if (!isTimestamp(row.datetimeinit) || row.datetimeinit < START_DATE) return [];
    const value = fieldValue(row, field);
    return value ? [{ period: monthKey(row.datetimeinit), value }] : [];
  });
  return stackedCounts(items, monthsSpanning(items.map((d) => d.period)), choice);
};

/** An inclusive range of timestamps; ISO strings compare chronologically. */
type Range = readonly [start: string, end: string];

const within = (timestamp: string | undefined, [start, end]: Range) =>
  isTimestamp(timestamp) && timestamp >= start && timestamp <= end;

export interface RecentActivity {
  /** Requests opened in the last 30 days. */
  opened30: number;
  /** Requests opened in the last 7 days. */
  opened7: number;
  /** CLOSED requests closed in the last 7 days. */
  closed7: number;
}

/**
 * Request counts over rolling windows ending at `now` (a California timestamp).
 * "Closed" counts only CLOSED requests, matching the resolution chart.
 */
export const recentActivity = (rows: ServiceRequests, now: string): RecentActivity => {
  const last30: Range = [daysBefore(now, 30), now];
  const last7: Range = [daysBefore(now, 7), now];
  return {
    opened30: rows.filter((row) => within(row.datetimeinit, last30)).length,
    opened7: rows.filter((row) => within(row.datetimeinit, last7)).length,
    closed7: rows.filter((row) => row.status === "CLOSED" && within(row.datetimeclosed, last7)).length,
  };
};

/** A count for a period, and for the same dates one year earlier. */
export interface YearOverYear {
  current: number;
  lastYear: number;
}

export interface TopicSummary {
  topic: Topic;
  /** Requests opened since January 1. */
  openedYtd: YearOverYear;
  /** How many of this year's opened requests are now CLOSED. */
  resolvedYtd: number;
}

/** Per-topic requests opened and resolved this year, with opened compared to the same dates last year. */
export const topicSummaries = (rows: ServiceRequests, now: string): TopicSummary[] => {
  const ytd: Range = [startOfYear(now), now];
  const ytdBefore: Range = [yearsBefore(ytd[0], 1), yearsBefore(now, 1)];

  const summaries = new Map<Topic, TopicSummary>(
    TOPICS.map((topic) => [
      topic,
      {
        topic,
        openedYtd: { current: 0, lastYear: 0 },
        resolvedYtd: 0,
      },
    ]),
  );

  for (const row of rows) {
    const summary = summaries.get(topicOf(row.description));
    if (!summary) continue;
    if (within(row.datetimeinit, ytd)) {
      summary.openedYtd.current++;
      if (row.status === "CLOSED") summary.resolvedYtd++;
    }
    if (within(row.datetimeinit, ytdBefore)) summary.openedYtd.lastYear++;
  }
  return [...summaries.values()];
};

export interface WeeklyCounts extends StackedCounts {
  /** The weeks behind `periods`, with the dates each one covers. */
  weeks: Week[];
}

/**
 * Requests opened per Sunday-start week from January 1 through `now` (a California
 * timestamp), split by `field` into the chosen values plus "All others".
 */
export const weeklyCounts = (rows: ServiceRequests, now: string, field: ChartField, choice: SeriesChoice): WeeklyCounts => {
  const thisYear: Range = [startOfYear(now), now];
  const items = rows.flatMap((row) => {
    if (!within(row.datetimeinit, thisYear)) return [];
    const value = fieldValue(row, field);
    return value ? [{ period: weekStart(row.datetimeinit), value }] : [];
  });
  const weeks = weeksBetween(...thisYear);
  return { weeks, ...stackedCounts(items, weeks.map(({ key }) => key), choice) };
};

/** Requests with a valid open time, newest first. */
export const newestFirst = (rows: ServiceRequests): ServiceRequests =>
  rows
    .filter((row) => isTimestamp(row.datetimeinit))
    .toSorted((a, b) => (a.datetimeinit < b.datetimeinit ? 1 : a.datetimeinit > b.datetimeinit ? -1 : 0));
