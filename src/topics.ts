/** Problem types, derived from a request's description rather than its reqcategory (the assigned team). */
export const TOPICS = [
  "Homeless Encampment",
  "Storm Drain",
  "Graffiti",
  "Animal and Insect Control",
  "Human Waste",
  "Litter & Illegal Dumping",
  "Landscape Maintenance",
  "Irrigation Issue",
  "Tree Maintenance",
  "Building Maintenance",
  "Sidewalk Maintenance",
  "Parking",
  "Other",
] as const;

export type Topic = (typeof TOPICS)[number];

/**
 * Checked in order; the first match wins, so more specific rules come first
 * (e.g. "Graffiti in a Park" is Graffiti, not Building Maintenance, and
 * "Parks - Irrigation" is an Irrigation Issue, not Landscape Maintenance).
 * Anything unmatched is "Other".
 */
const RULES: [Topic, RegExp][] = [
  ["Homeless Encampment", /homeless encampment/i],
  ["Graffiti", /graffiti/i],
  ["Human Waste", /human waste/i],
  ["Animal and Insect Control", /animal and insect|vector control|\bpests?\b/i],
  ["Storm Drain", /storm (drain|inlet)|watershed/i],
  ["Litter & Illegal Dumping", /illegal dumping|litter|street cleaning|community bag pick up/i],
  ["Irrigation Issue", /irrigation/i],
  ["Tree Maintenance", /^trees? /i],
  ["Landscape Maintenance", /landscape|mowing|weed abatement/i],
  ["Parking", /parking|abandoned (auto|vehicle)/i],
  ["Sidewalk Maintenance", /sidewalk - damage|sidewalk \(report|pathway|curb & gutter/i],
  [
    "Building Maintenance",
    /^city bldg - |^park - |park maintenance|necklace of lights|board up/i,
  ],
];

/** The topic for a request's description; "Other" if no rule matches or it's missing. */
export const topicOf = (description: string | undefined): Topic =>
  RULES.find(([, pattern]) => pattern.test(description ?? ""))?.[0] ?? "Other";
