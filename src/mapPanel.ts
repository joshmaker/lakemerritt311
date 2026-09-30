import { earliestDay, locatedRequests, type RequestPoint } from "./data";
import { cardHeader, CONTROL, element, select } from "./dom";
import type { MapHandle } from "./map";
import { matchesTone, STATUS_OPTIONS, statusPill } from "./status";
import { daysBefore } from "./time";
import { TOPICS } from "./topics";
import type { ServiceRequests } from "./types/serviceRequest";

/** Resolves once `el` is within a screen's height of the viewport. Never resolves if `signal` aborts first. */
const nearViewport = (el: Element, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some(({ isIntersecting }) => isIntersecting)) return;
        observer.disconnect();
        resolve();
      },
      { rootMargin: "100% 0px" },
    );
    observer.observe(el);
    signal.addEventListener("abort", () => {
      observer.disconnect();
    }, { once: true });
  });

/** The date range starts out this many days long, ending on the latest date. */
const DEFAULT_DAYS = 30;

const whole = new Intl.NumberFormat();
const longDay = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" });
/** An ISO date ("2026-09-23") as text, e.g. "Sep 23, 2026". */
const formatDay = (day: string) => longDay.format(Date.parse(`${day}T00:00:00Z`));
const openedDay = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const plural = (n: number, word: string) => `${whole.format(n)} ${word}${n === 1 ? "" : "s"}`;

/** One row of the table of picked requests. */
const pickedRow = ({ request, topic }: RequestPoint) => {
  const address = request.probaddress && request.probaddress !== "ZZ" ? request.probaddress : "No address";
  // Skip the description when it just repeats the topic (e.g. "Homeless Encampment").
  const description = request.description && request.description !== topic ? request.description : "";
  const detail = [description, address].filter(Boolean).join(" · ");

  const about = element("td", "px-2 py-1.5");
  about.append(element("p", "font-medium", topic), element("p", "line-clamp-2 text-muted", detail));
  about.title = `#${request.requestid} · ${topic}\n${detail}`;
  const status = element("td", "py-1.5 pr-2 text-right");
  status.append(statusPill(request.status, "inline-block leading-tight"));

  const row = element("tr", "align-top");
  row.append(element("td", "py-1.5 pl-2 whitespace-nowrap text-muted tabular-nums", openedDay.format(Date.parse(`${request.datetimeinit}Z`))), about, status);
  return row;
};

export interface MapPanel {
  /**
   * Puts `requests` on the map, colored by topic with `colorOf`. `latestDay` is the last date the
   * date filter allows (an ISO date): when the data was last updated. The first allowed date is
   * the oldest request's.
   */
  showRequests: (requests: ServiceRequests, latestDay: string, colorOf: (topic: string) => string) => void;
}

/**
 * Fills the panel `el` with the map, filters for status, topic, and date, and a table of the
 * requests in whichever bubble or dot was clicked. Shows `el` right away; the map library loads
 * separately (it's large), once the map nears the viewport, and the panel hides again if it fails.
 */
export const renderMapPanel = (el: HTMLElement, signal: AbortSignal): MapPanel => {
  const { header: heading, subtitle: count } = cardHeader("Lake Merritt", "Loading requests…");
  count.setAttribute("aria-live", "polite");

  const statusFilter = select("Status", STATUS_OPTIONS);
  const topicFilter = select("Topic", [["", "All topics"], ...TOPICS.map((t): [string, string] => [t, t])]);

  // The date range: two calendar pickers, off until the data arrives and tells us their limits.
  const dateField = (label: string) => {
    const input = element("input", `${CONTROL} min-w-0 w-full`);
    input.type = "date";
    input.disabled = true;
    const field = element("label", "grid gap-1 text-xs text-muted", label);
    field.append(input);
    return { field, input };
  };
  const { field: startField, input: startInput } = dateField("Opened from");
  const { field: endField, input: endInput } = dateField("to");
  const dateError = element("p", "text-xs text-red-700");
  dateError.setAttribute("role", "alert");
  dateError.hidden = true;
  const dates = element("div", "grid grid-cols-2 gap-2");
  dates.append(startField, endField);
  // Two columns of filters from sm up, so the dates take the full row; one column on lg+.
  const dateGroup = element("div", "space-y-1 sm:col-span-2 lg:col-span-1");
  dateGroup.append(dates, dateError);

  const filters = element("div", "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:col-start-2 lg:row-start-1 lg:grid-cols-1");
  filters.append(statusFilter, topicFilter, dateGroup);

  // A placeholder (the `skeleton` class) until the map library arrives.
  const container = element("div", "skeleton h-96 overflow-hidden rounded lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:h-full");

  // The table of picked requests. Beside the map on lg+, it fills the height the filters leave.
  const pickedTitle = element("p", "text-sm font-semibold");
  const clear = element("button", `${CONTROL} px-2 py-0.5 text-xs hover:bg-page`, "Clear");
  clear.type = "button";
  const pickedHeading = element("div", "flex items-center justify-between gap-2 border-b border-line px-2 py-1.5");
  pickedHeading.append(pickedTitle, clear);
  const tbody = element("tbody", "divide-y divide-line");
  const table = element("table", "w-full table-fixed text-xs");
  const columns = element("colgroup");
  columns.append(element("col", "w-14"), element("col"), element("col", "w-24"));
  table.append(columns, tbody);
  const tableScroll = element("div", "max-h-96 overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1");
  tableScroll.append(table);
  const hint = element("p", "p-3 text-sm text-muted", "Click a bubble or dot to list its requests here. Double-click to zoom in.");
  const picked = element("div", "flex min-h-0 flex-col rounded-md border border-line lg:col-start-2 lg:row-start-2");
  picked.append(hint, pickedHeading, tableScroll);

  // Stacked: filters, map, then picked requests. On lg+: map on the left, the rest on the right.
  const layout = element("div", "grid grid-cols-1 gap-3 lg:h-[480px] lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_minmax(0,1fr)]");
  layout.append(filters, container, picked);
  el.replaceChildren(heading, layout);
  el.hidden = false; // MapLibre measures its container on creation, so it must be visible first.

  let all: RequestPoint[] = [];
  let shown: RequestPoint[] = [];
  // The allowed dates, and the range now chosen (ISO dates; empty until the data arrives).
  let earliest = "";
  let latest = "";
  let start = "";
  let end = "";
  let colorOf: (topic: string) => string = () => "";

  /** Lists the given requests (indices into `shown`) in the table, or shows the hint if none. */
  const pick = (indices: number[]) => {
    const rows = indices.flatMap((i) => shown[i] ?? []).toSorted((a, b) => (a.request.datetimeinit < b.request.datetimeinit ? 1 : -1));
    hint.hidden = rows.length > 0;
    pickedHeading.hidden = tableScroll.hidden = rows.length === 0;
    // A bubble of requests that all share one spot never splits, however far you zoom, so say so.
    const oneSpot = rows.length > 1 && new Set(rows.map(({ lng, lat }) => `${String(lng)},${String(lat)}`)).size === 1;
    pickedTitle.textContent = `${plural(rows.length, "request")}${oneSpot ? ", all at one spot" : ""}`;
    tbody.replaceChildren(...rows.map(pickedRow));
    tableScroll.scrollTop = 0;
  };
  pick([]);
  clear.addEventListener("click", () => {
    pick([]);
  });

  // The map library is the page's biggest download, so fetch it only once the map is about to
  // scroll into view (right away on wide screens; far down the page on phones).
  const mapReady: Promise<MapHandle | undefined> = nearViewport(container, signal)
    .then(() => import("./map"))
    .then(({ renderMap }) => {
      container.classList.remove("skeleton");
      return renderMap(container, pick, signal);
    })
    .catch((err: unknown) => {
      console.error("Map failed to load", err);
      el.hidden = true;
      return undefined;
    });

  const update = () => {
    if (!latest) return; // no requests yet
    shown = all.filter(
      ({ request, topic }) =>
        request.datetimeinit.slice(0, 10) >= start &&
        request.datetimeinit.slice(0, 10) <= end &&
        matchesTone(request.status, statusFilter.value) &&
        (!topicFilter.value || topic === topicFilter.value),
    );
    count.textContent = `${plural(shown.length, "request")} with a location`;
    pick([]); // the old pick may include requests the new filters hide
    const points = shown.map(({ lng, lat, topic }) => ({ lng, lat, color: colorOf(topic) }));
    void mapReady.then((map) => map?.showPoints(points));
  };
  for (const filter of [statusFilter, topicFilter]) filter.addEventListener("change", update);

  /** Shows the chosen range in the pickers, and limits each to dates that keep the range valid (start before end). */
  const syncDates = () => {
    [startInput.value, endInput.value] = [start, end];
    [startInput.min, startInput.max] = [earliest, end];
    [endInput.min, endInput.max] = [start, latest];
  };
  // Typed dates can go past a picker's limits, so check them here: take a valid range, and put
  // the pickers back (with a note) otherwise.
  const changeDates = () => {
    const [newStart, newEnd] = [startInput.value, endInput.value];
    const valid = newStart >= earliest && newEnd <= latest && newStart <= newEnd; // "" fails the first two
    dateError.hidden = valid;
    if (valid) {
      [start, end] = [newStart, newEnd];
      update();
    } else {
      dateError.textContent = `Pick dates from ${formatDay(earliest)} to ${formatDay(latest)}, with the start on or before the end.`;
    }
    syncDates();
  };
  startInput.addEventListener("change", changeDates);
  endInput.addEventListener("change", changeDates);

  return {
    showRequests: (requests, latestDay, topicColor) => {
      colorOf = topicColor;
      all = locatedRequests(requests);
      latest = latestDay;
      earliest = earliestDay(requests) ?? latestDay;
      // The last DEFAULT_DAYS days up to the latest date, counting both ends.
      end = latest;
      start = daysBefore(`${latest}T00:00:00`, DEFAULT_DAYS - 1).slice(0, 10);
      if (start < earliest) start = earliest;
      startInput.disabled = endInput.disabled = false;
      syncDates();
      update();
    },
  };
};
