import { cardHeader, element } from "./dom";

export interface BarTableRow {
  label: string;
  /** Bar fill, from 0 to 1, per segment (see `segments`); segments stack left to right. */
  shares: number[];
  /** One entry per value column. */
  values: string[];
}

export interface BarTable {
  title: string;
  /** Short note beside the title, e.g. the time period. */
  subtitle: string;
  /** Header for the label column. */
  labelHeader: string;
  /** Headers for the value columns after the bar. */
  valueHeaders: string[];
  rows: BarTableRow[];
  /**
   * Names and colors (Tailwind background classes) of the bars' segments, in order. With more
   * than one, a legend shows beside the title. Defaults to one unnamed blue segment.
   */
  segments?: { label: string; color: string }[];
  /**
   * If set, the table starts collapsed: rows past this many hide, a fade covers its bottom,
   * and a "See all" pill on its bottom edge expands it.
   */
  previewRows?: number;
}

const DEFAULT_SEGMENTS = [{ label: "", color: "bg-series-1" }];

/**
 * A small bar with one fill per segment, side by side. Hidden from screen readers: the value
 * columns carry the numbers.
 */
const bar = (shares: number[], colors: string[], className = "") => {
  const track = element("div", `flex h-2 overflow-hidden rounded-full bg-series-1/20 ${className}`);
  track.setAttribute("aria-hidden", "true");
  track.append(
    ...shares.map((share, index) => {
      const fill = element("div", `h-full ${colors[index] ?? ""}`);
      fill.style.width = `${String(share * 100)}%`;
      return fill;
    }),
  );
  return track;
};

/**
 * Fills `el` with a titled table, one row per item: label, bar, then value columns.
 * Each row is one line on wider screens; on phones the bar moves under the label.
 * Replaces any earlier content and shows `el`. Returns a function that expands a
 * collapsed table (see `previewRows`); it does nothing otherwise.
 */
export const renderBarTable = (
  el: HTMLElement,
  { title, subtitle, labelHeader, valueHeaders, rows, segments = DEFAULT_SEGMENTS, previewRows }: BarTable,
): (() => void) => {
  const colors = segments.map(({ color }) => color);
  // With more than one segment, a key to their colors sits on the right of the header.
  const keys = element("p", "flex flex-wrap items-center gap-x-3 pt-1 text-xs text-muted");
  keys.append(
    ...segments.map(({ label, color }) => {
      const key = element("span", "inline-flex items-center gap-1", label);
      key.prepend(element("span", `inline-block size-2 rounded-full ${color}`));
      return key;
    }),
  );
  const { header: heading } = segments.length > 1 ? cardHeader(title, subtitle, keys) : cardHeader(title, subtitle);

  const barHeader = element("th", "hidden sm:table-cell");
  barHeader.setAttribute("aria-hidden", "true");
  const headerRow = element("tr", "border-b border-line text-xs text-muted");
  headerRow.append(
    element("th", "pb-1 text-left font-normal", labelHeader),
    barHeader,
    ...valueHeaders.map((header) => element("th", "pb-1 pl-2 text-right font-normal whitespace-nowrap sm:pl-3", header)),
  );
  const head = element("thead");
  head.append(headerRow);

  const body = element("tbody");
  body.append(
    ...rows.map(({ label, shares, values }, index) => {
      const labelCell = element("th", "py-1 pr-2 text-left font-medium sm:pr-3 sm:whitespace-nowrap", label);
      labelCell.scope = "row";
      labelCell.append(bar(shares, colors, "mt-1 sm:hidden"));
      const barCell = element("td", "hidden w-full py-1 sm:table-cell");
      barCell.append(bar(shares, colors));

      const row = element("tr", previewRows !== undefined && index >= previewRows ? "group-data-collapsed:hidden" : "");
      row.append(
        labelCell,
        barCell,
        ...values.map((value) => element("td", "py-1 pl-2 text-right tabular-nums whitespace-nowrap sm:pl-3", value)),
      );
      return row;
    }),
  );

  const table = element("table", "w-full text-sm");
  table.append(head, body);
  el.replaceChildren(heading, table);
  el.hidden = false;
  if (previewRows === undefined || rows.length <= previewRows) return () => undefined;

  // Collapsed: `el` is the `group` whose data-collapsed attribute hides the extra rows.
  el.classList.add("group");
  el.setAttribute("data-collapsed", "");
  // Fades the last visible rows into the card, hinting there's more below.
  const fade = element("div", "pointer-events-none absolute inset-x-0 bottom-0 hidden h-20 rounded-b-md bg-linear-to-t from-panel to-transparent group-data-collapsed:block");
  fade.setAttribute("aria-hidden", "true");
  // Straddles the card's bottom edge, over the faded rows, so it takes no space of its own.
  const seeAll = element(
    "button",
    "absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-line bg-panel px-3 py-0.5 text-xs font-medium shadow-sm hover:bg-page",
    `See all ${String(rows.length)}`,
  );
  seeAll.type = "button";
  const expand = () => {
    el.removeAttribute("data-collapsed");
    fade.remove();
    seeAll.remove();
  };
  seeAll.addEventListener("click", expand);
  el.append(fade, seeAll);
  return expand;
};
