import type { BarSeriesOption, EChartsOption } from "echarts";
import { BarChart } from "echarts/charts";
import { DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { ALL_OTHERS, type StackedCounts, type WeeklyCounts } from "./data";
import { cssVar, element } from "./dom";
import { isPartialWeek } from "./time";

// LegendComponent stays registered even though the legend is hidden: the page's shared
// HTML legend toggles series through its actions (see chartLegend.ts).
echarts.use([BarChart, DataZoomComponent, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

// Colors come from the Tailwind theme in styles.css, so the palette lives in one place.
const TEXT = cssVar("--color-ink");
const MUTED = cssVar("--color-muted");
const BORDER = cssVar("--color-line");
const PANEL = cssVar("--color-panel");
const OTHERS_COLOR = cssVar("--color-series-others");

/** --color-series-1, --color-series-2, … read in order until one is missing. */
const SERIES_COLORS: string[] = [];
for (;;) {
  const color = cssVar(`--color-series-${String(SERIES_COLORS.length + 1)}`);
  if (!color) break;
  SERIES_COLORS.push(color);
}

/** The color ECharts gives the series at `index`; "All others" is always gray. */
export const seriesColor = (name: string, index: number): string =>
  name === ALL_OTHERS ? OTHERS_COLOR : (SERIES_COLORS[index % SERIES_COLORS.length] ?? MUTED);

/** "#rrggbb" plus an alpha, as rgba() for the canvas. */
const withAlpha = (hex: string, alpha: number) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(alpha)})`;
};

/** The initial zoom: from the bar at index `zoomStart` through the last one. */
const zoomRange = (periods: string[], zoomStart: number) => ({
  startValue: Math.max(0, zoomStart),
  endValue: Math.max(0, periods.length - 1),
});

/**
 * Layout and styling shared by every chart: category x-axis, value y-axis, and a quiet zoom
 * slider. The chart opens zoomed in from the bar at `zoomStart` (an index) through the last one.
 */
const baseOption = (periods: string[], yAxisName: string, zoomStart = 0): EChartsOption => ({
  backgroundColor: "transparent",
  color: SERIES_COLORS,
  textStyle: { color: TEXT },
  legend: { show: false },
  grid: { left: 48, right: 16, top: 32, bottom: 64 },
  xAxis: {
    type: "category",
    data: periods,
    boundaryGap: true,
    axisLine: { lineStyle: { color: BORDER } },
    axisLabel: { color: MUTED },
  },
  yAxis: {
    type: "value",
    name: yAxisName,
    nameTextStyle: { color: MUTED },
    axisLine: { show: false },
    splitLine: { lineStyle: { color: BORDER } },
    axisLabel: { color: MUTED },
  },
  dataZoom: [
    { type: "inside", ...zoomRange(periods, zoomStart) },
    {
      type: "slider",
      ...zoomRange(periods, zoomStart),
      bottom: 8,
      height: 24,
      borderColor: BORDER,
      backgroundColor: "transparent",
      fillerColor: withAlpha(MUTED, 0.08),
      dataBackground: { lineStyle: { color: BORDER }, areaStyle: { color: BORDER, opacity: 0.6 } },
      selectedDataBackground: { lineStyle: { color: MUTED }, areaStyle: { color: MUTED, opacity: 0.25 } },
      handleStyle: { color: PANEL, borderColor: MUTED },
      moveHandleStyle: { color: BORDER },
      emphasis: { handleStyle: { borderColor: TEXT }, moveHandleStyle: { color: MUTED } },
      textStyle: { color: MUTED },
    },
  ],
});

const whole = new Intl.NumberFormat();
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);

interface StackedBarChart {
  /** Axis label for each bar. */
  labels: string[];
  series: StackedCounts["series"];
  /** Tooltip heading for the bar at `index`; defaults to its axis label. */
  tooltipTitle?: (index: number) => string;
  /** Index of the first bar shown at load; earlier ones are reachable by zooming out. */
  zoomStart?: number;
}

/** Stacked bars, one series per value. The tooltip lists the series in that bar and their total. */
export const stackedBarOption = ({
  labels,
  series,
  tooltipTitle = (index) => labels[index] ?? "",
  zoomStart,
}: StackedBarChart): EChartsOption => ({
  ...baseOption(labels, "Requests", zoomStart),
  tooltip: {
    trigger: "axis",
    axisPointer: { type: "shadow" },
    formatter: (params) => {
      const points = (Array.isArray(params) ? params : [params]).filter((p) => Number(p.value) > 0);
      const index = (Array.isArray(params) ? params[0] : params)?.dataIndex;
      if (index === undefined) return "";
      const lines = points.map(
        (p) =>
          `${typeof p.marker === "string" ? p.marker : ""}${escapeHtml(p.seriesName ?? "")}: <b>${whole.format(Number(p.value))}</b>`,
      );
      const total = points.reduce((sum, p) => sum + Number(p.value), 0);
      return [escapeHtml(tooltipTitle(index)), ...lines, `Total: <b>${whole.format(total)}</b>`].join("<br/>");
    },
  },
  series: series.map(
    ({ name, data }): BarSeriesOption => ({
      name,
      type: "bar",
      stack: "total",
      barCategoryGap: "15%",
      // A thin panel-colored outline separates stacked segments with similar colors.
      itemStyle: { borderColor: PANEL, borderWidth: 0.25, ...(name === ALL_OTHERS && { color: OTHERS_COLOR }) },
      emphasis: { focus: "series" },
      data,
    }),
  ),
});

const dayMonth = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const formatDay = (isoDate: string) => dayMonth.format(new Date(`${isoDate}T00:00:00Z`));

/**
 * Stacked bars per week, labeled by each week's first day; the tooltip shows its dates and flags
 * partial weeks. Opens zoomed in to the weeks ending on or after `zoomFrom` (an ISO date), if given.
 */
export const weeklyStackedOption = ({ weeks, series }: WeeklyCounts, zoomFrom?: string): EChartsOption =>
  stackedBarOption({
    labels: weeks.map(({ start }) => formatDay(start)),
    series,
    zoomStart: zoomFrom ? weeks.findIndex(({ end }) => end >= zoomFrom) : 0,
    tooltipTitle: (index) => {
      const week = weeks[index];
      if (!week) return "";
      return `${formatDay(week.start)} – ${formatDay(week.end)}${isPartialWeek(week) ? " (partial week)" : ""}`;
    },
  });

export type Chart = ReturnType<typeof echarts.init>;

// Heroicons-style outline icons (static markup, safe to insert).
const ICON_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="size-5" aria-hidden="true"';
const EXPAND_ICON = `<svg ${ICON_ATTRS}><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"/></svg>`;
const CLOSE_ICON = `<svg ${ICON_ATTRS}><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>`;

/** Classes that pin a panel over the whole window, above a dimmed page. */
const FULL_SCREEN = ["fixed", "inset-0", "z-50", "flex", "flex-col", "sm:inset-4", "shadow-[0_0_0_100vmax_rgb(0_0_0/0.45)]"];

let nextChartId = 0;

/** A display-only legend for full screen, where the page's shared legend is hidden behind the overlay. */
const fullScreenLegend = (option: EChartsOption) => {
  const names = (Array.isArray(option.series) ? option.series : []).map(({ name }) => String(name));
  const list = element("ul", "mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted");
  list.setAttribute("aria-label", "Topics");
  list.append(
    ...names.map((name, index) => {
      const swatch = element("span", "size-3 shrink-0 rounded-sm");
      swatch.style.backgroundColor = seriesColor(name, index);
      const item = element("li", "flex items-center gap-1.5");
      item.dataset.name = name;
      item.append(swatch, name);
      return item;
    }),
  );
  return list;
};

/**
 * Fills the panel `el` with a `title` heading, a full-screen toggle, and a chart of `option`;
 * shows it and keeps the chart sized to its container. Full screen adds a legend (faded for
 * topics hidden with the page legend); Esc or the close button returns it. The chart is
 * disposed when `signal` aborts.
 */
export const renderChart = (el: HTMLElement, title: string, option: EChartsOption, signal: AbortSignal): Chart => {
  const heading = element("h2", "text-lg font-semibold", title);
  heading.id = `chart-title-${String(nextChartId++)}`;
  const toggle = element("button", "-m-1.5 rounded-md p-1.5 text-muted hover:bg-page hover:text-ink");
  toggle.type = "button";
  const header = element("div", "flex items-start justify-between gap-3");
  header.append(heading, toggle);
  const legend = fullScreenLegend(option);
  const canvas = element("div", "h-[480px]");
  el.replaceChildren(header, legend, canvas);
  el.hidden = false; // ECharts measures the element on init, so it must be visible first.
  const chart = echarts.init(canvas);
  chart.setOption(option);

  let fullScreen = false;
  const setFullScreen = (on: boolean) => {
    fullScreen = on;
    for (const name of FULL_SCREEN) el.classList.toggle(name, on);
    canvas.classList.toggle("h-[480px]", !on);
    canvas.classList.toggle("min-h-0", on);
    canvas.classList.toggle("flex-1", on);
    document.body.classList.toggle("overflow-hidden", on); // no page scrolling behind it
    if (on) {
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-modal", "true");
      el.setAttribute("aria-labelledby", heading.id);
    } else {
      for (const attr of ["role", "aria-modal", "aria-labelledby"]) el.removeAttribute(attr);
    }
    toggle.innerHTML = on ? CLOSE_ICON : EXPAND_ICON;
    toggle.setAttribute("aria-label", on ? "Exit full screen" : "Show chart full screen");
    toggle.title = on ? "Exit full screen (Esc)" : "Full screen";
    legend.hidden = !on;
    if (on) {
      const [legendState] = [chart.getOption().legend].flat() as { selected?: Record<string, boolean> }[];
      for (const item of legend.querySelectorAll("li")) {
        item.classList.toggle("opacity-40", legendState?.selected?.[item.dataset.name ?? ""] === false);
      }
    }
  };
  setFullScreen(false);
  // After a switch, keep keyboard focus on the button, which stays in the top right corner.
  const switchTo = (on: boolean) => {
    setFullScreen(on);
    toggle.focus();
  };
  toggle.addEventListener("click", () => {
    switchTo(!fullScreen);
  });
  const onKeydown = (event: KeyboardEvent) => {
    if (fullScreen && event.key === "Escape") switchTo(false);
  };
  document.addEventListener("keydown", onKeydown);

  const observer = new ResizeObserver(() => {
    chart.resize();
  });
  observer.observe(canvas);

  signal.addEventListener(
    "abort",
    () => {
      document.removeEventListener("keydown", onKeydown);
      if (fullScreen) setFullScreen(false);
      observer.disconnect();
      chart.dispose();
    },
    { once: true },
  );
  return chart;
};
