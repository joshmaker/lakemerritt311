import { element } from "./dom";

export interface StatTile {
  label: string;
  value: string;
  caption: string;
}

/** Fills the `<dl>` `el` with one tile per stat, replacing any earlier tiles, and shows it. */
export const renderStatTiles = (el: HTMLElement, tiles: StatTile[]): void => {
  el.replaceChildren(
    ...tiles.map(({ label, value, caption }) => {
      const tile = element("div", "panel p-4");
      tile.append(
        element("dt", "text-sm text-muted", label),
        element("dd", "mt-1 text-3xl font-semibold", value),
        element("dd", "mt-1 text-sm text-muted", caption),
      );
      return tile;
    }),
  );
  el.hidden = false;
};
