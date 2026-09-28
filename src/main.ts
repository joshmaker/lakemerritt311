import type { EChartsOption } from "echarts";
import { renderChart, seriesColor, stackedBarOption, weeklyStackedOption } from "./chart";
import { renderChartLegend } from "./chartLegend";
import { ALL_OTHERS, loadRequests, monthlyCounts, newestFirst, recentActivity, topicSummaries, weeklyCounts } from "./data";
import { element } from "./dom";
import { renderIssuesResolved } from "./issueTables";
import { renderMapPanel } from "./mapPanel";
import { renderRecentRequests } from "./recentRequests";
import { renderStatTiles } from "./statTiles";
import { renderTopReportedIssues } from "./topReported";
import { californiaNow, californiaTime, monthsBefore } from "./time";
// Importing the URL has Vite copy the data into builds under a content-hashed name (so browsers
// can cache it), matching the preload link in index.html. Run `npm run fetch-data` first.
import DATA_URL from "../data/api/311.json?url";

/** Values past the top N of a field are summed into one "All others" series. */
const TOP_N = 12;
/** Each issue table shows this many rows until "See all" is clicked. */
const ISSUES_PREVIEW_ROWS = 6;
/** How much of each chart shows before zooming out. */
const MONTHLY_ZOOM_MONTHS = 24;
const WEEKLY_ZOOM_MONTHS = 5;
/** Warn that the data is stale when the city's last update is older than this. */
const STALE_AFTER_MS = 30 * 60 * 60 * 1000;
/** Recent Requests shows this many at a time. */
const RECENT_PAGE_SIZE = 50;

const oneDecimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat();
/** e.g. "Sep 24, 2026, 6:17 AM PDT": California time, since the data is about Oakland. */
const shortDay = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
const percentChange = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 0 });
/** e.g. "▲ 12% vs prior 7 days"; nothing when there's no earlier count to compare with. */
const change = (current: number, earlier: number, versus: string) => {
  if (earlier === 0) return undefined;
  const ratio = (current - earlier) / earlier;
  if (Math.round(ratio * 100) === 0) return `No change vs ${versus}`;
  return `${ratio > 0 ? "▲" : "▼"} ${percentChange.format(Math.abs(ratio))} vs ${versus}`;
};
const updatedDay = new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeZone: "America/Los_Angeles" });
const updatedTime = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Los_Angeles",
  timeZoneName: "short",
});

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

// The map starts loading right away, in parallel with the 311 data; its dots are added once the
// data is in (see below). If the map fails, the rest of the page still works.
const mapPanel = renderMapPanel(getElement("map"), lifetime.signal);

const statusEl = getElement("status");
const show = (id: string, title: string, option: EChartsOption) =>
  renderChart(getElement(id), title, option, lifetime.signal);

try {
  // Charts draw text on canvas once, so wait for the page font too (it loads alongside the data).
  // If the font can't load, carry on with the fallback.
  const [requests] = await Promise.all([
    loadRequests(DATA_URL, lifetime.signal),
    document.fonts.load('1em "Inter Variable"').catch(() => []),
  ]);
  statusEl.hidden = true;
  // When the city last uploaded data. Staleness is checked in the viewer's browser, since the
  // page can stay deployed long after its build.
  const updated = __DATA_UPDATED_AT__ ? new Date(__DATA_UPDATED_AT__) : undefined;
  const isStale = updated !== undefined && Date.now() - updated.getTime() > STALE_AFTER_MS;
  if (updated) {
    const asOf = getElement("data-as-of");
    asOf.textContent = `Data as of ${updatedTime.format(updated)}`;
    asOf.hidden = isStale; // the warning gives the same date
    if (isStale) {
      const stale = getElement("stale-data");
      stale.replaceChildren(
        element("strong", "font-semibold", `Oakland's 311 data feed hasn't been updated since ${updatedDay.format(updated)}.`),
        " Updates will appear here once the city uploads fresh data.",
      );
      stale.hidden = false;
    }
  }

  const now = californiaNow();
  // The tiles' windows end now, or at the city's last upload while the feed is stale, so days
  // with no data yet don't read as quiet days.
  const recent = recentActivity(requests, isStale ? californiaTime(updated) : now);
  const period = (days: number) =>
    isStale ? `${String(days)} days to ${shortDay.format(updated)}` : `Last ${String(days)} days`;
  renderStatTiles(getElement("stats"), [
    {
      label: "Requests / Day",
      value: oneDecimal.format(recent.opened30.current / 30),
      caption: `Average, ${period(30).replace(/^Last/, "last")}`,
      change: change(recent.opened30.current, recent.opened30.lastYear, "same days last year"),
    },
    {
      label: "Requests",
      value: whole.format(recent.opened30.current),
      caption: period(30),
      change: change(recent.opened30.current, recent.opened30.previous, "prior 30 days"),
    },
    {
      label: "Opened",
      value: whole.format(recent.opened7.current),
      caption: period(7),
      change: change(recent.opened7.current, recent.opened7.previous, "prior 7 days"),
    },
    {
      label: "Closed",
      value: whole.format(recent.closed7.current),
      caption: period(7),
      change: change(recent.closed7.current, recent.closed7.previous, "prior 7 days"),
    },
  ]);

  // Each topic keeps one color everywhere: its series color in the charts, used by the donut and map too.
  const monthly = monthlyCounts(requests, "topic", TOP_N);
  const topics = monthly.series.map(({ name }) => name);
  // Topics outside the charts' series share "All others".
  const colorOf = (topic: string) => {
    const index = topics.indexOf(topic === "Other" ? ALL_OTHERS : topic);
    return index === -1 ? seriesColor(ALL_OTHERS, 0) : seriesColor(topics[index] ?? ALL_OTHERS, index);
  };

  const summaries = topicSummaries(requests, now);
  const year = Number(now.slice(0, 4));
  getElement("issues").hidden = false; // the tray; shown first so the donut can measure its card
  // Issues Resolved first: side by side, the donut's card takes its height from that table.
  renderIssuesResolved(getElement("issues-resolved"), summaries, year, ISSUES_PREVIEW_ROWS);
  renderTopReportedIssues(getElement("top-issues"), summaries, year, colorOf, ISSUES_PREVIEW_ROWS, lifetime.signal);
  getElement("charts").hidden = false; // the tray holding both charts and their legend
  const charts = [
    show(
      "chart-category",
      "Requests per month",
      stackedBarOption({
        labels: monthly.periods,
        series: monthly.series,
        zoomStart: monthly.periods.length - MONTHLY_ZOOM_MONTHS,
      }),
    ),
    show(
      "chart-weekly",
      `Requests per week, ${String(year)}`,
      // Same series, in the same order, as the monthly chart, so each topic keeps its color.
      weeklyStackedOption(weeklyCounts(requests, now, "topic", topics), monthsBefore(now, WEEKLY_ZOOM_MONTHS)),
    ),
  ];
  mapPanel.showRequests(requests, now, colorOf);

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
    // Hide the cards still showing their loading placeholders (see index.html), and their groups.
    for (const placeholder of document.querySelectorAll("[data-skeleton]")) {
      const card = placeholder.parentElement?.closest<HTMLElement>("#stats, #issues, #charts, #recent-requests");
      if (card) card.hidden = true;
    }
    statusEl.textContent = `Error loading data: ${err instanceof Error ? err.message : String(err)}`;
    statusEl.classList.remove("sr-only");
    statusEl.hidden = false;
    console.error(err);
  }
}
