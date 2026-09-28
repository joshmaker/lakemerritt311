import { element } from "./dom";

export interface StatTile {
  label: string;
  value: string;
  caption: string;
  /** How the value compares to an earlier period, e.g. "▲ 12% vs prior 7 days". */
  change?: string;
}

/** Fills the `<dl>` `el` with one tile per stat, replacing any earlier tiles, and shows it. */
export const renderStatTiles = (el: HTMLElement, tiles: StatTile[]): void => {
  el.replaceChildren(
    ...tiles.map(({ label, value, caption, change }) => {
      const tile = element("div", "panel p-4");
      tile.append(
        element("dt", "text-xs font-medium tracking-wide text-muted uppercase", label),
        element("dd", "mt-2 font-display text-4xl font-semibold lining-nums", value),
        element("dd", "mt-0.5 text-xs text-muted", caption),
      );
      if (change) tile.append(element("dd", "mt-3 border-t border-line pt-2 text-xs text-muted tabular-nums", change));
      return tile;
    }),
  );
  el.hidden = false;
};
