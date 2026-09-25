import { recentPoints, type RequestPoint } from "./data";
import { CONTROL, element, select } from "./dom";
import type { MapHandle } from "./map";
import { matchesTone, STATUS_OPTIONS, statusPill } from "./status";
import { daysBefore } from "./time";
import { TOPICS } from "./topics";
import type { ServiceRequests } from "./types/serviceRequest";

/** Choices for the date filter, in days. */
const DAY_OPTIONS = [7, 15, 30, 60];
const DEFAULT_DAYS = 30;

const whole = new Intl.NumberFormat();
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
  /** Puts `requests` on the map, colored by topic with `colorOf`. `now` is a California timestamp. */
  showRequests: (requests: ServiceRequests, now: string, colorOf: (topic: string) => string) => void;
}

/**
 * Fills the panel `el` with the map, filters for status, topic, and date, and a table of the
 * requests in whichever bubble or dot was clicked. Shows `el` right away; the map library loads
 * separately (it's large) and the panel hides again if it fails.
 */
export const renderMapPanel = (el: HTMLElement, signal: AbortSignal): MapPanel => {
  const count = element("p", "text-xs text-muted", "Loading requests…");
  count.setAttribute("aria-live", "polite");
  const heading = element("div", "mb-3 flex items-baseline justify-between gap-3");
  heading.append(element("h2", "text-lg font-semibold", "Lake Merritt"), count);

  const statusFilter = select("Status", STATUS_OPTIONS);
  const topicFilter = select("Topic", [["", "All topics"], ...TOPICS.map((t): [string, string] => [t, t])]);
  const daysFilter = select(
    "Opened in",
    DAY_OPTIONS.map((days): [string, string] => [String(days), `Last ${String(days)} days`]),
  );
  daysFilter.value = String(DEFAULT_DAYS);
  const filters = element("div", "grid grid-cols-1 gap-2 sm:grid-cols-3 lg:col-start-2 lg:row-start-1 lg:grid-cols-1");
  filters.append(statusFilter, topicFilter, daysFilter);

  const container = element("div", "h-96 overflow-hidden rounded lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:h-full");

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
  let now = "";
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

  const mapReady: Promise<MapHandle | undefined> = import("./map")
    .then(({ renderMap }) => renderMap(container, pick, signal))
    .catch((err: unknown) => {
      console.error("Map failed to load", err);
      el.hidden = true;
      return undefined;
    });

  const update = () => {
    if (!now) return; // no requests yet
    const since = daysBefore(now, Number(daysFilter.value));
    shown = all.filter(
      ({ request, topic }) =>
        request.datetimeinit >= since &&
        matchesTone(request.status, statusFilter.value) &&
        (!topicFilter.value || topic === topicFilter.value),
    );
    count.textContent = `${plural(shown.length, "request")} with a location`;
    pick([]); // the old pick may include requests the new filters hide
    const points = shown.map(({ lng, lat, topic }) => ({ lng, lat, color: colorOf(topic) }));
    void mapReady.then((map) => map?.showPoints(points));
  };
  for (const filter of [statusFilter, topicFilter, daysFilter]) filter.addEventListener("change", update);

  return {
    showRequests: (requests, today, topicColor) => {
      [now, colorOf] = [today, topicColor];
      all = recentPoints(requests, daysBefore(now, Math.max(...DAY_OPTIONS)));
      update();
    },
  };
};
