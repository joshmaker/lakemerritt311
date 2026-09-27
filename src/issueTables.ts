import { renderBarTable } from "./barTable";
import type { TopicSummary } from "./data";

const whole = new Intl.NumberFormat();
const signed = new Intl.NumberFormat(undefined, { signDisplay: "exceptZero" });
const percent = new Intl.NumberFormat(undefined, { style: "percent" });

/** Resolved (including gone on arrival) and referred, as shares of this year's requests. */
const handledShares = ({ openedYtd, resolvedYtd, referredYtd }: TopicSummary) =>
  openedYtd.current > 0 ? [resolvedYtd / openedYtd.current, referredYtd / openedYtd.current] : [0, 0];
const handledShare = (summary: TopicSummary) => handledShares(summary).reduce((a, b) => a + b);

/**
 * Topics by requests opened this year, with each one's share of all requests and the change from
 * last year. Returns a function that expands the table if it started collapsed.
 */
export const renderTopReportedIssues = (el: HTMLElement, summaries: TopicSummary[], year: number, previewRows?: number): (() => void) => {
  const total = summaries.reduce((sum, { openedYtd }) => sum + openedYtd.current, 0);
  return renderBarTable(el, {
    title: "Top Reported Issues",
    previewRows,
    subtitle: `So far in ${String(year)}`,
    labelHeader: "Issue",
    valueHeaders: ["Opened", "Share", `vs ${String(year - 1)}`],
    rows: summaries
      .toSorted((a, b) => b.openedYtd.current - a.openedYtd.current)
      .map(({ topic, openedYtd: { current, lastYear } }) => {
        const share = total > 0 ? current / total : 0;
        return {
          label: topic,
          shares: [share],
          values: [whole.format(current), percent.format(share), signed.format(current - lastYear)],
        };
      }),
  });
};

/**
 * Topics by the share of this year's requests that are now resolved (CLOSED or GONE ON ARRIVAL)
 * or referred to another agency, shown as two bar colors. Returns a function that expands the
 * table if it started collapsed.
 */
export const renderIssuesResolved = (el: HTMLElement, summaries: TopicSummary[], year: number, previewRows?: number): (() => void) =>
  renderBarTable(el, {
    title: "Issues Resolved",
    previewRows,
    subtitle: `Of requests opened in ${String(year)}`,
    labelHeader: "Issue",
    valueHeaders: ["Resolved", "%"],
    segments: [
      { label: "Resolved", color: "bg-series-1" },
      { label: "Referred", color: "bg-series-3" },
    ],
    rows: summaries
      .toSorted((a, b) => handledShare(b) - handledShare(a) || b.openedYtd.current - a.openedYtd.current)
      .map((summary) => ({
        label: summary.topic,
        shares: handledShares(summary),
        values: [
          `${whole.format(summary.resolvedYtd + summary.referredYtd)} of ${whole.format(summary.openedYtd.current)}`,
          summary.openedYtd.current > 0 ? percent.format(handledShare(summary)) : "–",
        ],
      })),
  });
