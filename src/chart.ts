import type { BarSeriesOption, EChartsOption } from "echarts";
import { BarChart } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { ALL_OTHERS, type MonthlyCounts, type MonthlyResolution } from "./data";

echarts.use([
  BarChart,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer,
]);

// Colors come from the Tailwind theme in styles.css, so the palette lives in one place.
const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
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

interface BaseOptions {
  title: string;
  periods: string[];
  yAxisName: string;
  /** Show a legend, moving the plot area down to make room. */
  legend?: boolean;
  /** Center categories between axis ticks, as bars need. */
  bars?: boolean;
}

/** Layout and styling shared by every chart: title, month x-axis, value y-axis, zoom slider. */
const baseOption = ({ title, periods, yAxisName, legend = false, bars = false }: BaseOptions): EChartsOption => ({
  backgroundColor: "transparent",
  color: SERIES_COLORS,
  textStyle: { color: TEXT },
  title: {
    text: title,
    left: 16,
    top: 12,
    textStyle: { fontSize: 14, fontWeight: 600, color: TEXT },
  },
  legend: {
    show: legend,
    type: "scroll",
    top: 44,
    textStyle: { color: MUTED, fontSize: 11 },
  },
  grid: { left: 56, right: 24, top: legend ? 100 : 60, bottom: 70 },
  xAxis: {
    type: "category",
    data: periods,
    boundaryGap: bars,
    axisLine: { lineStyle: { color: BORDER } },
    axisLabel: { color: MUTED },
  },
  yAxis: {
    type: "value",
    name: yAxisName,
    axisLine: { show: false },
    splitLine: { lineStyle: { color: BORDER } },
    axisLabel: { color: MUTED },
  },
  dataZoom: [
    { type: "inside" },
    { type: "slider", bottom: 16, textStyle: { color: MUTED } },
  ],
});

/** Stacked monthly bars, one series per value. */
export const stackedBarOption = (title: string, { periods, series }: MonthlyCounts): EChartsOption => ({
  ...baseOption({ title, periods, yAxisName: "Requests", legend: true, bars: true }),
  tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
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

const oneDecimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

/** A bar per month for the median; months with no closures have no bar. */
export const medianResolutionOption = (
  title: string,
  { periods, medianDays, closedCounts }: MonthlyResolution,
): EChartsOption => ({
  ...baseOption({ title, periods, yAxisName: "Days", bars: true }),
  tooltip: {
    trigger: "axis",
    axisPointer: { type: "shadow" },
    formatter: (params) => {
      const point = Array.isArray(params) ? params[0] : params;
      if (!point) return "";
      const days = medianDays[point.dataIndex];
      const count = closedCounts[point.dataIndex] ?? 0;
      const median = days == null ? "No closures" : `${oneDecimal.format(days)} days`;
      return `${point.name}<br/>Median: <b>${median}</b><br/>Closed requests: ${count.toLocaleString()}`;
    },
  },
  series: [{ name: "Median resolution time", type: "bar", barCategoryGap: "15%", data: medianDays }],
});

/**
 * Shows `el` and renders `option` into it, resizing with the container.
 * The chart is disposed when `signal` aborts.
 */
export const renderChart = (el: HTMLElement, option: EChartsOption, signal: AbortSignal): void => {
  el.hidden = false; // ECharts measures the element on init, so it must be visible first.
  const chart = echarts.init(el);
  chart.setOption(option);

  const observer = new ResizeObserver(() => {
    chart.resize();
  });
  observer.observe(el);

  signal.addEventListener(
    "abort",
    () => {
      observer.disconnect();
      chart.dispose();
    },
    { once: true },
  );
};
