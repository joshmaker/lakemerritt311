import { element } from "./dom";
import type { RequestStatus } from "./types/serviceRequest";

/** Status categories: each has a name (for Status filters) and a pill color. */
export const TONES = {
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
export const statusInfo = (status: string) =>
  isKnownStatus(status) ? STATUSES[status] : { label: status, tone: "ended" as const };

/** Options for a Status filter: "All statuses", then each category. Values are tones. */
export const STATUS_OPTIONS: [value: string, text: string][] = [
  ["", "All statuses"],
  ...Object.entries(TONES).map(([tone, { label }]): [string, string] => [tone, label]),
];

/** True if `status` falls in the category a Status filter selected (`""` means all). */
export const matchesTone = (status: string, tone: string): boolean => !tone || statusInfo(status).tone === tone;

/** A colored pill with the status's label; `className` adds layout classes. */
export const statusPill = (status: string, className = "") => {
  const { label, tone } = statusInfo(status);
  return element("span", `rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone].pill} ${className}`, label);
};
