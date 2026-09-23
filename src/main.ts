import type { EChartsOption } from "echarts";
import { medianResolutionOption, renderChart, stackedBarOption } from "./chart";
import { loadRequests, monthlyCounts, monthlyMedianResolution, recentActivity } from "./data";
import { renderStatTiles } from "./statTiles";
import { californiaNow } from "./time";

const DATA_URL = "data/api/311.json";
/** Values past the top N of a field are summed into one "All others" series. */
const TOP_N = 12;

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
const show = (id: string, option: EChartsOption) => {
  renderChart(getElement(id), option, lifetime.signal);
};

try {
  const requests = await loadRequests(DATA_URL, lifetime.signal);
  statusEl.hidden = true;

  const recent = recentActivity(requests, californiaNow());
  renderStatTiles(getElement("stats"), [
    { label: "311 Requests / Day", value: oneDecimal.format(recent.opened30 / 30), caption: "Average last 30 days" },
    { label: "311 Request Count", value: whole.format(recent.opened30), caption: "Total last 30 days" },
    { label: "311 Requests Opened", value: whole.format(recent.opened7), caption: "Total last 7 days" },
    { label: "311 Requests Closed", value: whole.format(recent.closed7), caption: "Total last 7 days" },
  ]);

  show(
    "chart-category",
    stackedBarOption("311 Requests per Month by Category", monthlyCounts(requests, "topic", TOP_N)),
  );
  show(
    "chart-resolution",
    medianResolutionOption("Median Resolution Time of Closed Requests, by Month Closed", monthlyMedianResolution(requests)),
  );
} catch (err) {
  if (!lifetime.signal.aborted) {
    statusEl.textContent = `Error loading data: ${err instanceof Error ? err.message : String(err)}`;
    statusEl.hidden = false;
    console.error(err);
  }
}
