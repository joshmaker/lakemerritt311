import { groupSort, median, rollup } from "d3-array";
import { topicOf } from "./topics";
import { daysBefore, daysBetween, isTimestamp, monthKey, monthsSpanning } from "./time";
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

/** Fields that can split the monthly counts into series. "topic" is derived from the description (see topics.ts). */
export type ChartField = "reqcategory" | "topic";

const fieldValue = (row: ServiceRequest, field: ChartField): string => {
  if (field === "topic") {
    // The "Other" topic is already a catch-all, so it shares the "All others" series.
    const topic = topicOf(row.description);
    return topic === "Other" ? ALL_OTHERS : topic;
  }
  return row[field];
};

export interface MonthlyCounts {
  /** "YYYY-MM" keys, one per month with no gaps. */
  periods: string[];
  series: { name: string; data: number[] }[];
}

/**
 * Requests opened per month, split by `field`. The `topN` most common values
 * each get a series; the rest are summed into one "All others" series.
 */
export const monthlyCounts = (rows: ServiceRequests, field: ChartField, topN: number): MonthlyCounts => {
  const opened = rows.flatMap((row) => {
    if (!isTimestamp(row.datetimeinit) || row.datetimeinit < START_DATE) return [];
    const value = fieldValue(row, field);
    return value ? [{ month: monthKey(row.datetimeinit), value }] : [];
  });

  const ranked = groupSort(opened, (group) => -group.length, (d) => d.value).filter((v) => v !== ALL_OTHERS);
  const top = new Set(ranked.slice(0, topN));
  const hasOthers = ranked.length > topN || opened.some((d) => d.value === ALL_OTHERS);
  const names = hasOthers ? [...top, ALL_OTHERS] : [...top];
  const counts = rollup(
    opened,
    (group) => group.length,
    (d) => (top.has(d.value) ? d.value : ALL_OTHERS),
    (d) => d.month,
  );

  const periods = monthsSpanning(opened.map((d) => d.month));
  return {
    periods,
    series: names.map((name) => ({ name, data: periods.map((month) => counts.get(name)?.get(month) ?? 0) })),
  };
};

export interface MonthlyResolution {
  /** "YYYY-MM" keys, one per month with no gaps. */
  periods: string[];
  /** Median days from open to close; null for months with no closures. */
  medianDays: (number | null)[];
  /** How many closed requests each month's median covers. */
  closedCounts: number[];
}

/**
 * Median time to close CLOSED requests, grouped by the month they closed.
 * Grouping by close month instead of open month avoids a false dip in recent
 * months, where only the quickly closed requests have closed so far.
 */
export const monthlyMedianResolution = (rows: ServiceRequests): MonthlyResolution => {
  const closed = rows.flatMap(({ status, datetimeinit, datetimeclosed }) => {
    if (status !== "CLOSED" || !isTimestamp(datetimeinit) || !isTimestamp(datetimeclosed)) return [];
    if (datetimeclosed < START_DATE) return [];
    const days = daysBetween(datetimeinit, datetimeclosed);
    // Negative (closed before opened) or NaN (impossible date) means a bad record.
    return days >= 0 ? [{ month: monthKey(datetimeclosed), days }] : [];
  });

  const byMonth = rollup(
    closed,
    (group) => ({ median: median(group, (d) => d.days), count: group.length }),
    (d) => d.month,
  );

  const periods = monthsSpanning(byMonth.keys());
  return {
    periods,
    medianDays: periods.map((month) => byMonth.get(month)?.median ?? null),
    closedCounts: periods.map((month) => byMonth.get(month)?.count ?? 0),
  };
};

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
  const lastDays = (days: number) => {
    const start = daysBefore(now, days);
    return (timestamp: string | undefined) => isTimestamp(timestamp) && timestamp >= start && timestamp <= now;
  };
  const last30 = lastDays(30);
  const last7 = lastDays(7);
  return {
    opened30: rows.filter((row) => last30(row.datetimeinit)).length,
    opened7: rows.filter((row) => last7(row.datetimeinit)).length,
    closed7: rows.filter((row) => row.status === "CLOSED" && last7(row.datetimeclosed)).length,
  };
};
