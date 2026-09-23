import { element } from "./dom";
import { daysBetween, isTimestamp } from "./time";
import { type Topic, TOPICS, topicOf } from "./topics";
import type { RequestStatus, ServiceRequest } from "./types/serviceRequest";

/** Status categories: each has a name (for the Status filter) and a pill color. */
const TONES = {
  done: { label: "Resolved", pill: "bg-emerald-100 text-emerald-800" },
  active: { label: "In progress", pill: "bg-sky-100 text-sky-800" },
  waiting: { label: "Waiting", pill: "bg-amber-100 text-amber-800" },
  ended: { label: "Ended without a fix", pill: "bg-stone-200 text-stone-700" },
};
type Tone = keyof typeof TONES;

const STATUSES: Record<RequestStatus, { label: string; tone: Tone }> = {
  CLOSED: { label: "Closed", tone: "done" },
  OPEN: { label: "Open", tone: "active" },
  WOCREATE: { label: "Work order", tone: "active" },
  PENDING: { label: "Pending", tone: "waiting" },
  "WAITING ON CUSTOMER": { label: "Waiting on customer", tone: "waiting" },
  REFERRED: { label: "Referred", tone: "ended" },
  UNFUNDED: { label: "Unfunded", tone: "ended" },
  CANCEL: { label: "Canceled", tone: "ended" },
  "EVALUATED - NO FURTHER ACTION": { label: "No action", tone: "ended" },
  "GONE ON ARRIVAL": { label: "Gone on arrival", tone: "ended" },
};

const isKnownStatus = (status: string): status is RequestStatus => Object.hasOwn(STATUSES, status);

/** Statuses missing from STATUSES (the city adds new ones) show as-is, in gray. */
const statusInfo = (status: string) =>
  isKnownStatus(status) ? STATUSES[status] : { label: status, tone: "ended" as const };

const statusPill = (status: string) => {
  const { label, tone } = statusInfo(status);
  return element("span", `justify-self-start self-start wide:self-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone].pill}`, label);
};

const opened = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC", // timestamps are California wall-clock time; show them unchanged
});
const days = (n: number) => `${String(n)} ${n === 1 ? "day" : "days"}`;

/** Wide screens: one line per request with these columns. The header and every row share them. */
// Description and Address share the leftover width; Address keeps at least 13rem so it truncates less.
const COLUMNS = "wide:grid-cols-[9rem_5.5rem_12rem_minmax(0,1.2fr)_minmax(13rem,1fr)_8rem_7.5rem] wide:items-center";
/** Narrower: status above the text on phones, beside it from `sm` up. */
const ROW = `grid grid-cols-1 gap-x-3 gap-y-1 px-4 py-2 sm:grid-cols-[9rem_minmax(0,1fr)] ${COLUMNS}`;
const HEADERS = ["Status", "Ticket #", "Topic", "Description", "Address", "Opened", "Duration"];

/** A cell that shows `text` cut off with "…" on wide screens, with the full text on hover. */
const truncated = (className: string, text: string) => {
  const cell = element("span", `${className} wide:truncate`, text);
  cell.title = text;
  return cell;
};

/** A request with the values the filters need, worked out once. */
interface Entry {
  request: ServiceRequest;
  topic: Topic;
  /** Lowercased ticket #, topic, description, and address, for the quick search. */
  searchText: string;
}

const row = ({ request, topic }: Entry, now: string) => {
  const closed = isTimestamp(request.datetimeclosed) ? request.datetimeclosed : undefined;
  const duration = closed
    ? `closed in ${days(daysBetween(request.datetimeinit, closed))}`
    : `open ${days(daysBetween(request.datetimeinit, now))}`;
  const address = request.probaddress && request.probaddress !== "ZZ" ? request.probaddress : "No address";
  // Skip the description when it just repeats the topic (e.g. "Homeless Encampment").
  const description = request.description && request.description !== topic ? request.description : "";

  // On wide screens `contents` dissolves these wrappers, so each part becomes its own column;
  // the " | " and " • " separators only show in the stacked layout.
  const title = element("p", "min-w-0 text-sm wide:contents");
  title.append(
    element("span", "text-muted tabular-nums", `#${request.requestid}`),
    element("span", "wide:hidden", " "),
    truncated("font-semibold", topic),
    element("span", "wide:hidden", description && " | "),
    truncated("text-muted", description),
  );
  const details = element("p", "min-w-0 text-xs text-muted sm:col-start-2 wide:contents wide:text-sm");
  details.append(
    truncated("", address),
    element("span", "wide:hidden", " • "),
    element("span", "", opened.format(Date.parse(`${request.datetimeinit}Z`))),
    element("span", "wide:hidden", " • "),
    element("span", "", duration),
  );

  const item = element("li", ROW);
  item.append(statusPill(request.status), title, details);
  return item;
};

const CONTROL = "rounded-md border border-line bg-panel px-2 py-1.5 text-sm";

const select = (label: string, options: [value: string, text: string][]) => {
  const el = element("select", CONTROL);
  el.setAttribute("aria-label", label);
  el.append(
    ...options.map(([value, text]) => {
      const option = element("option", "", text);
      option.value = value;
      return option;
    }),
  );
  return el;
};

const whole = new Intl.NumberFormat();

/**
 * Fills `el` with a filterable, table-like list of `requests` (newest first), showing
 * `pageSize` at a time with a button for more. Replaces any earlier content and shows `el`.
 */
export const renderRecentRequests = (el: HTMLElement, requests: ServiceRequest[], now: string, pageSize: number): void => {
  const entries: Entry[] = requests.map((request) => {
    const topic = topicOf(request.description);
    return { request, topic, searchText: [request.requestid, topic, request.description, request.probaddress].join(" ").toLowerCase() };
  });

  const search = element("input", `${CONTROL} min-w-0 flex-1 basis-56`);
  search.type = "search";
  search.placeholder = "Search ticket #, topic, description, address";
  search.setAttribute("aria-label", "Search requests");
  const statusFilter = select("Status", [
    ["", "All statuses"],
    ...Object.entries(TONES).map(([tone, { label }]): [string, string] => [tone, label]),
  ]);
  const topicFilter = select("Topic", [["", "All topics"], ...TOPICS.map((t): [string, string] => [t, t])]);
  const controls = element("div", "mb-3 flex flex-wrap gap-2 px-4");
  controls.append(search, statusFilter, topicFilter);

  const count = element("p", "text-xs text-muted");
  count.setAttribute("aria-live", "polite");
  const heading = element("div", "mb-2 flex items-baseline justify-between gap-3 px-4");
  heading.append(element("h2", "text-lg font-semibold", "Recent Requests"), count);

  const header = element("div", `hidden gap-x-3 border-b border-line px-4 pb-1 text-xs text-muted wide:grid ${COLUMNS}`);
  header.setAttribute("aria-hidden", "true");
  header.append(...HEADERS.map((label) => element("span", "", label)));

  const list = element("ul", "divide-y divide-line");
  const empty = element("p", "px-4 py-6 text-center text-sm text-muted", "No requests match these filters.");
  const more = element("button", `${CONTROL} mx-auto mt-3 block font-medium hover:bg-page`);
  more.type = "button";

  let shown = pageSize;
  const update = () => {
    const query = search.value.trim().toLowerCase();
    const matches = entries.filter(
      ({ request, topic, searchText }) =>
        (!statusFilter.value || statusInfo(request.status).tone === statusFilter.value) &&
        (!topicFilter.value || topic === topicFilter.value) &&
        (!query || searchText.includes(query)),
    );
    const visible = matches.slice(0, shown);
    list.replaceChildren(...visible.map((entry) => row(entry, now)));
    count.textContent = `Showing ${whole.format(visible.length)} of ${whole.format(matches.length)}`;
    empty.hidden = matches.length > 0;
    more.hidden = matches.length <= shown;
    const remaining = matches.length - shown;
    more.textContent = `Show ${whole.format(Math.min(pageSize, remaining))} more · ${whole.format(remaining)} left`;
  };
  // Changing a filter starts over at the first page.
  const refilter = () => {
    shown = pageSize;
    update();
  };
  search.addEventListener("input", refilter);
  statusFilter.addEventListener("change", refilter);
  topicFilter.addEventListener("change", refilter);
  more.addEventListener("click", () => {
    shown += pageSize;
    update();
  });

  update();
  el.replaceChildren(heading, controls, header, list, empty, more);
  el.hidden = false;
};
