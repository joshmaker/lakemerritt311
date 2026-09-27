import type { EChartsOption } from "echarts";
import { PieChart } from "echarts/charts";
import { LegendComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { escapeHtml } from "./chart";
import type { TopicSummary } from "./data";
import { cssVar, element } from "./dom";

// LegendComponent is registered for its actions: the HTML legend hides slices through it.
echarts.use([PieChart, LegendComponent, TooltipComponent, CanvasRenderer]);

const whole = new Intl.NumberFormat();
const signed = new Intl.NumberFormat(undefined, { signDisplay: "exceptZero" });
const percent = new Intl.NumberFormat(undefined, { style: "percent" });

/** Legend rows past the preview hide while the tray's Issues Resolved table is collapsed (lg+ only). */
const COLLAPSIBLE = "lg:group-has-[[data-collapsed]]/issues:hidden";

/**
 * Fills `el` with a donut of this year's requests by topic (largest first, colored by `colorOf`)
 * beside a legend with each topic's count and change from the same dates last year. Each
 * slice's tooltip adds its share. Clicking a topic in the legend hides or shows its slice, and the
 * total and shares then count only the topics shown.
 *
 * Side by side with Issues Resolved (lg+), the card takes that table's height rather than setting
 * its own, the donut grows to fill it, and legend rows past `previewRows` hide while that table is
 * collapsed. Shows `el`; the chart is disposed when `signal` aborts.
 */
export const renderTopReportedIssues = (
  el: HTMLElement,
  summaries: TopicSummary[],
  year: number,
  colorOf: (topic: string) => string,
  previewRows: number,
  signal: AbortSignal,
): void => {
  const rows = summaries
    .filter(({ openedYtd }) => openedYtd.current > 0)
    .toSorted((a, b) => b.openedYtd.current - a.openedYtd.current)
    .map(({ topic, openedYtd: { current, lastYear } }) => ({ topic, current, lastYear, color: colorOf(topic) }));
  const hidden = new Set<string>();
  const shownTotal = () => rows.reduce((sum, { topic, current }) => sum + (hidden.has(topic) ? 0 : current), 0);
  const share = (count: number) => {
    const total = shownTotal();
    return percent.format(total > 0 ? count / total : 0);
  };

  const heading = element("div", "mb-2 flex items-baseline justify-between gap-3");
  heading.append(
    element("h2", "text-lg font-semibold", "Top Reported Issues"),
    element("p", "text-xs text-muted", `So far in ${String(year)}`),
  );

  // The donut, with the total of the topics shown in its hole.
  const canvas = element("div", "absolute inset-0");
  const totalText = element("span", "text-xl font-semibold tabular-nums", whole.format(shownTotal()));
  const hole = element("div", "pointer-events-none absolute inset-0 flex flex-col items-center justify-center");
  hole.append(totalText, element("span", "text-xs text-muted", "requests"));
  const donut = element("div", "relative h-52 w-full shrink-0 sm:h-56 sm:w-2/5 lg:h-auto lg:w-1/3");
  donut.append(canvas, hole);

  // The legend, as a small table.
  const headerRow = element("tr", "text-muted");
  headerRow.append(
    ...["Issue", "Opened", `vs ${String(year - 1)}`].map((label, index) =>
      element("th", `pb-1 font-normal whitespace-nowrap ${index === 0 ? "text-left" : "pl-2 text-right"}`, label),
    ),
  );
  const head = element("thead");
  head.append(headerRow);
  const body = element("tbody");
  const legendRows = rows.map(({ topic, current, lastYear, color }, index) => {
    const swatch = element("span", "size-2 shrink-0 rounded-full");
    swatch.style.backgroundColor = color;
    // A toggle, like the bar charts' legend: pressed while the slice shows.
    const toggle = element("button", "-mx-1 flex w-[calc(100%+0.5rem)] items-center gap-1.5 rounded px-1 text-left font-medium hover:bg-page");
    toggle.type = "button";
    toggle.title = `${topic}: click to hide or show`;
    toggle.setAttribute("aria-pressed", "true");
    toggle.append(swatch, element("span", "truncate", topic));
    toggle.addEventListener("click", () => {
      if (!hidden.delete(topic)) hidden.add(topic);
      toggle.setAttribute("aria-pressed", String(!hidden.has(topic)));
      totalText.textContent = whole.format(shownTotal());
      chart.dispatchAction({ type: "legendToggleSelect", name: topic });
    });
    const name = element("th", "w-full max-w-0 py-0.5 font-normal");
    name.scope = "row";
    name.append(toggle);
    // Faded while its slice is hidden.
    const row = element("tr", `has-[[aria-pressed=false]]:opacity-40 ${index >= previewRows ? COLLAPSIBLE : ""}`);
    row.dataset.topic = topic;
    row.append(
      name,
      ...[whole.format(current), signed.format(current - lastYear)].map((value) =>
        element("td", "py-0.5 pl-2 text-right tabular-nums whitespace-nowrap", value),
      ),
    );
    body.append(row);
    return row;
  });
  const hiddenCount = rows.length - previewRows;
  if (hiddenCount > 0) {
    const more = element("td", "pt-0.5 text-muted", `+ ${String(hiddenCount)} more`);
    more.colSpan = 3;
    const moreRow = element("tr", "hidden lg:group-has-[[data-collapsed]]/issues:table-row");
    moreRow.append(more);
    body.append(moreRow);
  }
  const legend = element("table", "min-w-0 flex-1 self-center text-xs");
  legend.append(head, body);

  // Phones: donut above the legend. Wider: side by side. On lg+ the size containment keeps the
  // body's content from adding to the card's height, so the card matches Issues Resolved.
  const content = element("div", "flex flex-col gap-4 sm:flex-row sm:items-center lg:min-h-0 lg:flex-1 lg:items-stretch lg:[contain:size]");
  content.append(donut, legend);
  el.classList.add("lg:flex", "lg:flex-col");
  el.replaceChildren(heading, content);
  el.hidden = false; // ECharts measures the container on creation, so it must be visible first.

  const option: EChartsOption = {
    legend: { show: false },
    tooltip: {
      trigger: "item",
      formatter: (params) => {
        const row = rows[(Array.isArray(params) ? params[0] : params)?.dataIndex ?? -1];
        if (!row) return "";
        return [
          `<b>${escapeHtml(row.topic)}</b>`,
          `${whole.format(row.current)} opened · ${share(row.current)}`,
          `${signed.format(row.current - row.lastYear)} vs ${String(year - 1)}`,
        ].join("<br/>");
      },
    },
    series: [
      {
        type: "pie",
        radius: ["58%", "92%"],
        label: { show: false },
        // A thin panel-colored gap between slices.
        itemStyle: { borderColor: cssVar("--color-panel"), borderWidth: 1.5 },
        emphasis: { scaleSize: 4 },
        data: rows.map(({ topic, current, color }) => ({ name: topic, value: current, itemStyle: { color } })),
      },
    ],
  };
  const chart = echarts.init(canvas);
  chart.setOption(option);

  // Hovering a legend row highlights its slice.
  for (const row of legendRows) {
    row.addEventListener("mouseenter", () => {
      chart.dispatchAction({ type: "highlight", name: row.dataset.topic });
    });
    row.addEventListener("mouseleave", () => {
      chart.dispatchAction({ type: "downplay", name: row.dataset.topic });
    });
  }

  const observer = new ResizeObserver(() => {
    chart.resize();
  });
  observer.observe(canvas);
  signal.addEventListener(
    "abort",
    () => {
      observer.disconnect();
      chart.dispose();
    },
    { once: true },
  );
};
