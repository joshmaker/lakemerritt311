/**
 * Problem types, derived from a request's description rather than its reqcategory (the
 * assigned team). Each topic maps to the description pattern that identifies it.
 *
 * Checked in order; the first match wins, so more specific rules come first
 * (e.g. "Graffiti in a Park" is Graffiti, not Building Maintenance, and
 * "Parks - Irrigation" is an Irrigation Issue, not Landscape Maintenance).
 * Anything unmatched is "Other". To add a topic, add an entry here.
 */
const RULES = {
  "Homeless Encampment": /homeless encampment/i,
  Graffiti: /graffiti/i,
  "Human Waste": /human waste/i,
  "Animal and Insect Control": /animal and insect|vector control|\bpests?\b/i,
  "Storm Drain": /storm (drain|inlet)|watershed/i,
  "Litter & Illegal Dumping": /illegal dumping|litter|street cleaning|community bag pick up/i,
  "Irrigation Issue": /irrigation/i,
  "Tree Maintenance": /^trees? /i,
  "Landscape Maintenance": /landscape|mowing|weed abatement/i,
  Parking: /parking|abandoned (auto|vehicle)/i,
  "Sidewalk Maintenance": /sidewalk - damage|sidewalk \(report|pathway|curb & gutter/i,
  "Building Maintenance": /^city bldg - |^park - |park maintenance|necklace of lights|board up/i,
} satisfies Record<string, RegExp>;

export type Topic = keyof typeof RULES | "Other";

// Object.entries types keys as plain strings; RULES' keys are exactly the topics.
const ORDERED_RULES = Object.entries(RULES) as [Topic, RegExp][];

/** Every topic, in rule order, with "Other" last. */
export const TOPICS: readonly Topic[] = [...ORDERED_RULES.map(([topic]) => topic), "Other"];

/** The topic for a request's description; "Other" if no rule matches or it's missing. */
export const topicOf = (description: string | undefined): Topic =>
  ORDERED_RULES.find(([, pattern]) => pattern.test(description ?? ""))?.[0] ?? "Other";
