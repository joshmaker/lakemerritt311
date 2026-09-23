import { element } from "./dom";

export interface BarTableRow {
  label: string;
  /** Bar fill, from 0 to 1. */
  share: number;
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
   * If set, rows past this many hide, and a fade covers the table's bottom, while an
   * ancestor with the `group` class has a `data-collapsed` attribute.
   */
  previewRows?: number;
}

/** A small bar filled to `share`. Hidden from screen readers: the value columns carry the numbers. */
const bar = (share: number, className = "") => {
  const track = element("div", `h-2 overflow-hidden rounded-full bg-series-1/20 ${className}`);
  track.setAttribute("aria-hidden", "true");
  const fill = element("div", "h-full rounded-full bg-series-1");
  fill.style.width = `${String(share * 100)}%`;
  track.append(fill);
  return track;
};

/**
 * Fills `el` with a titled table, one row per item: label, bar, then value columns.
 * Each row is one line on wider screens; on phones the bar moves under the label.
 * Replaces any earlier content and shows `el`.
 */
export const renderBarTable = (
  el: HTMLElement,
  { title, subtitle, labelHeader, valueHeaders, rows, previewRows }: BarTable,
): void => {
  const heading = element("div", "mb-2 flex items-baseline justify-between gap-3");
  heading.append(element("h2", "text-lg font-semibold", title), element("p", "text-xs text-muted", subtitle));

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
    ...rows.map(({ label, share, values }, index) => {
      const labelCell = element("th", "py-1 pr-2 text-left font-medium sm:pr-3 sm:whitespace-nowrap", label);
      labelCell.scope = "row";
      labelCell.append(bar(share, "mt-1 sm:hidden"));
      const barCell = element("td", "hidden w-full py-1 sm:table-cell");
      barCell.append(bar(share));

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
  if (previewRows !== undefined && rows.length > previewRows) {
    // Fades the last visible rows into the card, hinting there's more below.
    const fade = element("div", "pointer-events-none absolute inset-x-0 bottom-0 hidden h-20 rounded-b-md bg-linear-to-t from-panel to-transparent group-data-collapsed:block");
    fade.setAttribute("aria-hidden", "true");
    el.append(fade);
  }
  el.hidden = false;
};
