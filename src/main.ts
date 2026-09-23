import type { EChartsOption } from "echarts";
import { renderChart, seriesColor, stackedBarOption, weeklyStackedOption } from "./chart";
import { renderChartLegend } from "./chartLegend";
import { loadRequests, monthlyCounts, newestFirst, recentActivity, topicSummaries, weeklyCounts } from "./data";
import { renderIssuesResolved, renderTopReportedIssues } from "./issueTables";
import { renderRecentRequests } from "./recentRequests";
import { renderStatTiles } from "./statTiles";
import { californiaNow, monthsBefore } from "./time";

const DATA_URL = "data/api/311.json";
/** Values past the top N of a field are summed into one "All others" series. */
const TOP_N = 12;
/** Each issue table shows this many rows until "See all" is clicked. */
const ISSUES_PREVIEW_ROWS = 6;
/** How much of each chart shows before zooming out. */
const MONTHLY_ZOOM_MONTHS = 24;
const WEEKLY_ZOOM_MONTHS = 5;
/** Recent Requests shows this many at a time. */
const RECENT_PAGE_SIZE = 50;

const oneDecimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat();

const getElement = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
};

// Aborting cancels a pending fetch and disposes the charts. In dev, Vite
// aborts before hot-swapping this module, so edits don't stack up charts.
const lifetime = new AbortController();
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => {
    lifetime.abort();
  });
}

const statusEl = getElement("status");
const show = (id: string, title: string, option: EChartsOption) =>
  renderChart(getElement(id), title, option, lifetime.signal);

try {
  const requests = await loadRequests(DATA_URL, lifetime.signal);
  statusEl.hidden = true;

  const now = californiaNow();
  const recent = recentActivity(requests, now);
  renderStatTiles(getElement("stats"), [
    { label: "311 Requests / Day", value: oneDecimal.format(recent.opened30 / 30), caption: "Average last 30 days" },
    { label: "311 Request Count", value: whole.format(recent.opened30), caption: "Total last 30 days" },
    { label: "311 Requests Opened", value: whole.format(recent.opened7), caption: "Total last 7 days" },
    { label: "311 Requests Closed", value: whole.format(recent.closed7), caption: "Total last 7 days" },
  ]);

  const summaries = topicSummaries(requests, now);
  const year = Number(now.slice(0, 4));
  const expanders = [
    renderTopReportedIssues(getElement("top-issues"), summaries, year, ISSUES_PREVIEW_ROWS),
    renderIssuesResolved(getElement("issues-resolved"), summaries, year, ISSUES_PREVIEW_ROWS),
  ];
  // Side by side, one shared button expands both tables (it hides itself once neither is collapsed).
  const expandBoth = getElement("issues-expand");
  expandBoth.textContent = `See all ${String(summaries.length)} issues`;
  expandBoth.addEventListener("click", () => {
    for (const expand of expanders) expand();
  });
  getElement("issues").hidden = false;

  const monthly = monthlyCounts(requests, "topic", TOP_N);
  const topics = monthly.series.map(({ name }) => name);
  getElement("charts").hidden = false; // the tray holding both charts and their legend
  const charts = [
    show(
      "chart-category",
      "311 Requests per Month by Category",
      stackedBarOption({
        labels: monthly.periods,
        series: monthly.series,
        zoomStart: monthly.periods.length - MONTHLY_ZOOM_MONTHS,
      }),
    ),
    show(
      "chart-weekly",
      `311 Requests per Week by Category, ${String(year)}`,
      // Same series, in the same order, as the monthly chart, so each topic keeps its color.
      weeklyStackedOption(weeklyCounts(requests, now, "topic", topics), monthsBefore(now, WEEKLY_ZOOM_MONTHS)),
    ),
  ];
  renderChartLegend(
    getElement("chart-legend"),
    topics.map((name, index) => ({ name, color: seriesColor(name, index) })),
    (name) => {
      for (const chart of charts) chart.dispatchAction({ type: "legendToggleSelect", name });
    },
  );

  renderRecentRequests(getElement("recent-requests"), newestFirst(requests), now, RECENT_PAGE_SIZE);
} catch (err) {
  if (!lifetime.signal.aborted) {
    statusEl.textContent = `Error loading data: ${err instanceof Error ? err.message : String(err)}`;
    statusEl.hidden = false;
    console.error(err);
  }
}
