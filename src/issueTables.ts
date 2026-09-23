import { renderBarTable } from "./barTable";
import type { TopicSummary } from "./data";

const whole = new Intl.NumberFormat();
const signed = new Intl.NumberFormat(undefined, { signDisplay: "exceptZero" });
const percent = new Intl.NumberFormat(undefined, { style: "percent" });

const resolvedShare = ({ openedYtd, resolvedYtd }: TopicSummary) =>
  openedYtd.current > 0 ? resolvedYtd / openedYtd.current : 0;

/** Topics by requests opened this year, with each one's share of all requests and the change from last year. */
export const renderTopReportedIssues = (el: HTMLElement, summaries: TopicSummary[], year: number): void => {
  const total = summaries.reduce((sum, { openedYtd }) => sum + openedYtd.current, 0);
  renderBarTable(el, {
    title: "Top Reported Issues",
    subtitle: `So far in ${String(year)}`,
    labelHeader: "Issue",
    valueHeaders: ["Opened", "Share", `vs ${String(year - 1)}`],
    rows: summaries
      .toSorted((a, b) => b.openedYtd.current - a.openedYtd.current)
      .map(({ topic, openedYtd: { current, lastYear } }) => {
        const share = total > 0 ? current / total : 0;
        return {
          label: topic,
          share,
          values: [whole.format(current), percent.format(share), signed.format(current - lastYear)],
        };
      }),
  });
};

/** Topics by the share of this year's requests that are now resolved (status CLOSED). */
export const renderIssuesResolved = (el: HTMLElement, summaries: TopicSummary[], year: number): void => {
  renderBarTable(el, {
    title: "Issues Resolved",
    subtitle: `Of requests opened in ${String(year)}`,
    labelHeader: "Issue",
    valueHeaders: ["Resolved", "%"],
    rows: summaries
      .toSorted((a, b) => resolvedShare(b) - resolvedShare(a) || b.openedYtd.current - a.openedYtd.current)
      .map((summary) => ({
        label: summary.topic,
        share: resolvedShare(summary),
        values: [
          `${whole.format(summary.resolvedYtd)} of ${whole.format(summary.openedYtd.current)}`,
          summary.openedYtd.current > 0 ? percent.format(resolvedShare(summary)) : "–",
        ],
      })),
  });
};
