import { type TimeInterval, utcDay, utcMonth, utcSunday, utcYear } from "d3-time";
import { dateOf, isoDate } from "./time";

// A time-lapse steps through a date range one calendar period at a time: days, weeks, months,
// quarters, or years, whichever keeps the run short. Nothing here touches the page.

/** An inclusive range of ISO dates ("2026-09-23"). */
export interface DateRange {
  start: string;
  end: string;
}

/** One step of the time-lapse: a calendar period, cut to the range, with a label anyone can read. */
export interface Frame extends DateRange {
  /** e.g. "Sep 23", "Sep 8 – 14", "March 2024", "Jan – Mar 2024", "2024". */
  label: string;
}

/** Seconds per frame for each speed. */
export const SPEEDS = { slow: 2, normal: 1, fast: 0.5 } as const;
export type Speed = keyof typeof SPEEDS;

/** The most frames a run has, so it takes about 15 s at normal speed; the unit grows to fit. */
const MAX_FRAMES = 15;

const utc = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" });
const dayFormat = utc({ month: "short", day: "numeric" });
const dayOfMonth = utc({ day: "numeric" });
const monthFormat = utc({ month: "long", year: "numeric" });
const shortMonth = utc({ month: "short" });
const yearFormat = utc({ year: "numeric" });

interface Unit {
  interval: TimeInterval;
  label: (start: Date, end: Date) => string;
}

/** The periods to try, smallest first. */
const UNITS: Unit[] = [
  { interval: utcDay, label: (start) => dayFormat.format(start) },
  {
    interval: utcSunday,
    // "Sep 8 – 14", or "Aug 31 – Sep 6" across months.
    label: (start, end) =>
      `${dayFormat.format(start)} – ${(start.getUTCMonth() === end.getUTCMonth() ? dayOfMonth : dayFormat).format(end)}`,
  },
  { interval: utcMonth, label: (start) => monthFormat.format(start) },
  {
    interval: utcMonth.every(3) ?? utcMonth,
    label: (start, end) => `${shortMonth.format(start)} – ${shortMonth.format(end)} ${yearFormat.format(end)}`,
  },
  { interval: utcYear, label: (start) => yearFormat.format(start) },
];

/** `range` split into `unit`'s calendar periods, the first and last cut to the range. */
const periods = ({ start, end }: DateRange, { interval, label }: Unit): Frame[] => {
  const last = utcDay.offset(dateOf(end), 1);
  // Start of each period that overlaps the range; the first begins at the range's start.
  const starts = [dateOf(start), ...interval.range(utcDay.offset(dateOf(start), 1), last)];
  return starts.map((from, i) => {
    const next = starts[i + 1] ?? last;
    const to = utcDay.offset(next, -1);
    // Months, quarters, and years are named whole ("March 2024") even when the range cuts them;
    // weeks show the exact dates they cover.
    const periodStart = interval.floor(from);
    const periodEnd = utcDay.offset(interval.offset(periodStart, 1), -1);
    const exact = interval === utcSunday || interval === utcDay;
    return { start: isoDate(from), end: isoDate(to), label: exact ? label(from, to) : label(periodStart, periodEnd) };
  });
};

/**
 * The frames that animate `range`: the smallest calendar period that needs no more than
 * MAX_FRAMES of them (e.g. weeks for a month, months for a year, years for the whole history).
 */
export const planFrames = (range: DateRange): Frame[] => {
  let frames: Frame[] = [];
  for (const unit of UNITS) {
    frames = periods(range, unit);
    if (frames.length <= MAX_FRAMES) break;
  }
  return frames; // in years if nothing smaller fit
};

/** "idle": not started (the whole range shows). "ended": stopped on the last frame. */
export type PlayState = "idle" | "playing" | "paused" | "ended";

export interface Timelapse {
  state: () => PlayState;
  /** The frame on show, or undefined when idle. */
  index: () => number | undefined;
  /** Sets how many frames there are and returns to idle. */
  load: (count: number) => void;
  /** Sets the seconds per frame; takes effect from the next frame. */
  setSpeed: (seconds: number) => void;
  /** Plays from the frame on show, or from the start when idle or ended. */
  play: () => void;
  pause: () => void;
  /** Shows frame `index` and pauses there (e.g. while dragging the timeline). */
  seek: (index: number) => void;
  /** Back to idle: no frame, the whole range. */
  stop: () => void;
}

/**
 * Plays frames 0…count-1, one per tick, and stops on the last. `onChange` hears every change of
 * state or frame. Timers are dropped when `signal` aborts.
 */
export const createTimelapse = (onChange: (state: PlayState, index: number | undefined) => void, signal: AbortSignal): Timelapse => {
  let state: PlayState = "idle";
  let index: number | undefined;
  let count = 0;
  let tickMs: number = SPEEDS.normal * 1000;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const set = (nextState: PlayState, nextIndex: number | undefined) => {
    clearTimeout(timer);
    [state, index] = [nextState, nextIndex];
    onChange(state, index);
    if (state === "playing") timer = setTimeout(advance, tickMs);
  };
  const advance = () => {
    const next = (index ?? -1) + 1;
    if (next < count) set("playing", next);
    else set("ended", count - 1);
  };
  signal.addEventListener("abort", () => {
    clearTimeout(timer);
  }, { once: true });

  return {
    state: () => state,
    index: () => index,
    load: (n) => {
      count = n;
      set("idle", undefined);
    },
    setSpeed: (seconds) => {
      tickMs = seconds * 1000;
    },
    play: () => {
      if (count < 2 || state === "playing") return;
      set("playing", state === "paused" && index !== undefined ? index : 0);
    },
    pause: () => {
      if (state === "playing") set("paused", index);
    },
    seek: (i) => {
      if (count === 0) return;
      set("paused", Math.min(Math.max(i, 0), count - 1));
    },
    stop: () => {
      set("idle", undefined);
    },
  };
};
