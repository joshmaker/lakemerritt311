import { earliestDay, locatedRequests, type RequestPoint } from "./data";
import { cardHeader, CONTROL, element, select } from "./dom";
import type { MapHandle } from "./map";
import { matchesTone, STATUS_OPTIONS, statusPill } from "./status";
import { HEAT_COLORS } from "./heat";
import { daysBefore } from "./time";
import { createTimelapse, type Frame, planFrames, type PlayState, type Speed, SPEEDS } from "./timelapse";
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

/**
 * How brightly each request glows on the heatmap, given the typical number per period: with more
 * requests each glows less, but not in proportion, so a quiet week (~30) and a busy year (~1,000)
 * both show clear hotspots without washing out. Tuned by eye on this data.
 */
const heatWeight = (typicalPerPeriod: number) => Math.min(1, 6.5 / Math.max(typicalPerPeriod, 1) ** 0.6);

// Static markup for the playback button's icons.
const ICON = 'viewBox="0 0 20 20" fill="currentColor" class="size-4" aria-hidden="true"';
const PLAY_ICON = `<svg ${ICON}><path d="M6.5 4.6v10.8a.6.6 0 0 0 .9.5l8.6-5.4a.6.6 0 0 0 0-1L7.4 4.1a.6.6 0 0 0-.9.5Z"/></svg>`;
const ICONS: Record<PlayState, string> = {
  idle: PLAY_ICON,
  playing: `<svg ${ICON}><rect x="5" y="4" width="3.6" height="12" rx="1"/><rect x="11.4" y="4" width="3.6" height="12" rx="1"/></svg>`,
  paused: PLAY_ICON,
  ended: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="size-4" aria-hidden="true"><path d="M4 10a6 6 0 1 0 1.8-4.3"/><path d="M4 3.5v3h3"/></svg>`,
};
/** The button's words for each state, and what it does. */
const BUTTON: Record<PlayState, [text: string, label: string]> = {
  idle: ["Play", "Play the requests over time"],
  playing: ["Pause", "Pause"],
  paused: ["Play", "Keep playing"],
  ended: ["Replay", "Play again from the start"],
};
const ANNOUNCE: Record<PlayState, string> = {
  idle: "Showing all dates",
  playing: "Playing over time",
  paused: "Paused",
  ended: "Finished",
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
 * Fills the panel `el` with the map, filters for status, topic, and date, a timeline that plays
 * the requests over time, and a table of the requests in whichever bubble or dot was clicked.
 * Shows `el` right away; the map library loads separately (it's large), once the map nears the
 * viewport, and the panel hides again if it fails.
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

  // The map, with a placeholder (the `skeleton` class) until the map library arrives.
  const container = element("div", "skeleton h-full w-full overflow-hidden rounded");
  // While a period is on show, a caption over the map names it.
  const captionLabel = element("p", "font-display text-lg font-semibold leading-tight lining-nums");
  const captionCount = element("p", "text-xs text-muted");
  const caption = element("div", "pointer-events-none absolute top-2 left-2 z-10 rounded-md border border-line bg-panel/90 px-3 py-1.5 shadow-sm");
  caption.setAttribute("aria-hidden", "true");
  caption.hidden = true;
  caption.append(captionLabel, captionCount);
  // The heatmap's key, shown while it's playing.
  const legendBar = element("span", "h-2 w-20 rounded-full");
  legendBar.style.background = `linear-gradient(to right, ${HEAT_COLORS.join(", ")})`;
  const legend = element("div", "pointer-events-none absolute bottom-2 left-2 z-10 flex items-center gap-2 rounded-md border border-line bg-panel/90 px-2 py-1 text-xs text-muted shadow-sm");
  legend.append("Fewer", legendBar, "More requests");
  legend.hidden = true;
  const mapArea = element("div", "relative h-96 lg:h-auto lg:min-h-0 lg:flex-1");
  mapArea.append(container, caption, legend);

  // The timeline under the map: play controls, then a bar per period (its height: how many
  // requests it had) that you can click or drag through.
  const playButton = element("button", `${CONTROL} flex shrink-0 items-center gap-1.5 font-medium hover:bg-page disabled:opacity-50 disabled:hover:bg-panel`);
  playButton.type = "button";
  const drawButton = (state: PlayState) => {
    const [text, label] = BUTTON[state];
    playButton.innerHTML = `${ICONS[state]}<span>${text}</span>`;
    playButton.setAttribute("aria-label", label);
  };
  drawButton("idle"); // disabled until the data and the map are ready (see refreshControls)
  const speedSelect = select("Speed", [["slow", "Slow"], ["normal", "Normal"], ["fast", "Fast"]], "w-28 shrink-0");
  speedSelect.value = "normal";
  const showAll = element("button", "ml-auto text-xs font-medium text-muted underline decoration-line underline-offset-2 hover:text-ink", "Show all dates");
  showAll.type = "button";
  showAll.hidden = true; // only while a period is on show
  const controls = element("div", "flex shrink-0 items-center gap-2");
  controls.append(playButton, speedSelect, showAll);

  const bars = element("div", "absolute inset-0 flex items-end gap-px");
  const marker = element("div", "pointer-events-none absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full bg-ink");
  const scrubber = element("input", "absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default");
  scrubber.type = "range";
  scrubber.min = "0";
  scrubber.step = "1";
  scrubber.setAttribute("aria-label", "Time period");
  const track = element("div", "relative col-span-2 h-10 rounded-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-series-1 has-[:focus-visible]:ring-offset-2 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:h-8");
  track.append(bars, marker, scrubber);
  // The first and last periods' names: under the bars on narrow screens; either side of them on
  // lg+, where the whole timeline fits one short row so the map keeps its height.
  const firstLabel = element("span", "whitespace-nowrap lg:col-start-1 lg:row-start-1");
  const lastLabel = element("span", "text-right whitespace-nowrap lg:col-start-3 lg:row-start-1");
  const trackGroup = element("div", "grid min-w-0 flex-1 grid-cols-2 items-center gap-x-2 gap-y-1 text-xs text-muted lg:grid-cols-[auto_minmax(0,1fr)_auto]");
  trackGroup.append(track, firstLabel, lastLabel);
  const timelineHint = element("p", "text-xs text-muted", "Pick a longer date range to play it over time.");
  timelineHint.hidden = true;
  const timeline = element("div", "flex flex-col gap-2 rounded-md border border-line px-3 py-2 lg:flex-row lg:items-center lg:gap-4");
  timeline.append(controls, trackGroup, timelineHint);

  const mapBox = element("div", "flex flex-col gap-2 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:min-h-0");
  mapBox.append(mapArea, timeline);
  // Announces when playback starts, pauses, or ends, but not each period.
  const announce = element("p", "sr-only");
  announce.setAttribute("role", "status");

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

  // Stacked: filters, map and timeline, then picked requests. On lg+: map and timeline on the
  // left, the rest on the right.
  const layout = element("div", "grid grid-cols-1 gap-3 lg:h-[540px] lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_minmax(0,1fr)]");
  layout.append(filters, mapBox, picked, announce);
  el.replaceChildren(heading, layout);
  el.hidden = false; // MapLibre measures its container on creation, so it must be visible first.

  let all: RequestPoint[] = [];
  let shown: RequestPoint[] = [];
  // The allowed dates, and the range now chosen (ISO dates; empty until the data arrives).
  let earliest = "";
  let latest = "";
  let start = "";
  let end = "";
  /** The time-lapse's periods over the chosen range, and how many requests each has (with the filters). */
  let frames: Frame[] = [];
  let frameCounts: number[] = [];
  let mapIsReady = false;
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

  /** True if the request passes the status and topic filters. */
  const matchesFilters = ({ request, topic }: RequestPoint) =>
    matchesTone(request.status, statusFilter.value) && (!topicFilter.value || topic === topicFilter.value);

  const player = createTimelapse((state, index) => {
    render(state, index);
  }, signal);

  /** Draws the map, caption, and timeline for the player's state and the period on show (if any). */
  function render(state: PlayState, index: number | undefined) {
    if (!latest) return; // no requests yet
    const frame = index === undefined ? undefined : frames[index];
    const { start: from, end: to } = frame ?? { start, end };
    shown = all.filter((point) => {
      const day = point.request.datetimeinit.slice(0, 10);
      return day >= from && day <= to && matchesFilters(point);
    });
    count.textContent = `${plural(shown.length, "request")} with a location`;
    count.setAttribute("aria-live", state === "playing" ? "off" : "polite"); // not every period
    pick([]); // the old pick may include requests that aren't on show now
    const points = shown.map(({ lng, lat, topic }) => ({ lng, lat, color: colorOf(topic) }));
    // A heatmap while it plays, so you can watch where requests move; bubbles (which you can
    // click) the rest of the time.
    const nonEmpty = frameCounts.filter((n) => n > 0);
    const typical = nonEmpty.length ? nonEmpty.reduce((a, b) => a + b, 0) / nonEmpty.length : 1;
    const heat = state === "playing" ? { weight: heatWeight(typical) } : undefined;
    void mapReady.then((map) => map?.showPoints(points, heat));

    caption.hidden = !frame;
    legend.hidden = !heat;
    if (frame) {
      captionLabel.textContent = frame.label;
      captionCount.textContent = plural(shown.length, "request");
    }

    drawButton(state);
    showAll.hidden = state === "idle";
    startInput.disabled = endInput.disabled = state === "playing";
    announce.textContent = ANNOUNCE[state];

    // The timeline: the period on show stands out; with none, every bar does.
    scrubber.value = String(index ?? 0);
    scrubber.setAttribute("aria-valuetext", frame?.label ?? "All dates");
    marker.hidden = !frame;
    if (index !== undefined) marker.style.left = `${String(((index + 0.5) / frames.length) * 100)}%`;
    bars.querySelectorAll("div").forEach((bar, i) => {
      bar.className = `flex-1 rounded-t-sm ${index === undefined ? "bg-series-1/60" : i === index ? "bg-series-1" : "bg-series-1/25"}`;
    });
  }
  const refresh = () => {
    render(player.state(), player.index());
  };

  /** Recounts each period's requests (with the filters) and redraws the bars. */
  const countFrames = () => {
    frameCounts = frames.map(() => 0);
    for (const point of all) {
      const day = point.request.datetimeinit.slice(0, 10);
      if (day < start || day > end || !matchesFilters(point)) continue;
      const i = frames.findIndex((frame) => day <= frame.end);
      if (i >= 0) frameCounts[i] = (frameCounts[i] ?? 0) + 1;
    }
    const most = Math.max(1, ...frameCounts);
    bars.replaceChildren(
      ...frameCounts.map((n, i) => {
        const bar = element("div");
        // Empty periods keep a sliver, so the timeline still shows every period.
        bar.style.height = `${String(Math.max(4, (n / most) * 100))}%`;
        bar.title = `${frames[i]?.label ?? ""}: ${plural(n, "request")}`;
        return bar;
      }),
    );
  };

  /** Splits the chosen range into periods and resets the timeline to show all dates. */
  const planTimeline = () => {
    // Stop at the last day with any request, so the run doesn't end on days the city hasn't
    // reported yet (they'd look like requests stopped).
    const lastWithData = all[0]?.request.datetimeinit.slice(0, 10) ?? end;
    const last = end < lastWithData ? end : lastWithData;
    frames = start <= last ? planFrames({ start, end: last }) : [];
    scrubber.max = String(Math.max(frames.length - 1, 0));
    firstLabel.textContent = frames[0]?.label ?? "";
    lastLabel.textContent = frames.at(-1)?.label ?? "";
    countFrames();
    player.load(frames.length);
    refreshControls();
  };
  /** Playback is on once there's data, a map, and more than one period to step through. */
  const refreshControls = () => {
    const playable = mapIsReady && frames.length > 1;
    playButton.disabled = scrubber.disabled = !playable;
    timelineHint.hidden = !latest || frames.length > 1;
  };

  playButton.addEventListener("click", () => {
    if (player.state() === "playing") player.pause();
    else player.play();
  });
  speedSelect.addEventListener("change", () => {
    player.setSpeed(SPEEDS[speedSelect.value as Speed]);
  });
  showAll.addEventListener("click", () => {
    player.stop();
  });
  // Clicking or dragging along the timeline (or its arrow keys) jumps to that period and pauses.
  scrubber.addEventListener("input", () => {
    player.seek(Number(scrubber.value));
  });
  for (const filter of [statusFilter, topicFilter]) {
    filter.addEventListener("change", () => {
      countFrames();
      refresh();
    });
  }
  void mapReady.then((map) => {
    mapIsReady = map !== undefined;
    refreshControls();
  });

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
      planTimeline(); // back to showing all dates, over the new range
    } else {
      dateError.textContent = `Pick dates from ${formatDay(earliest)} to ${formatDay(latest)}, with the start on or before the end.`;
    }
    syncDates();
  };
  startInput.addEventListener("change", changeDates);
  endInput.addEventListener("change", changeDates);
  refreshControls();

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
      planTimeline();
    },
  };
};
