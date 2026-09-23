import { element } from "./dom";

/**
 * Fills `el` with one legend entry per series name, each a toggle button with its color
 * swatch. Clicking one calls `onToggle` and fades the entry while that series is hidden.
 */
export const renderChartLegend = (
  el: HTMLElement,
  items: { name: string; color: string }[],
  onToggle: (name: string) => void,
): void => {
  el.replaceChildren(
    ...items.map(({ name, color }) => {
      const swatch = element("span", "size-3 shrink-0 rounded-sm");
      swatch.style.backgroundColor = color;
      const button = element("button", "flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-panel aria-[pressed=false]:opacity-40");
      button.type = "button";
      button.setAttribute("aria-pressed", "true");
      button.append(swatch, name);
      button.addEventListener("click", () => {
        button.setAttribute("aria-pressed", String(button.getAttribute("aria-pressed") !== "true"));
        onToggle(name);
      });
      const item = element("li");
      item.append(button);
      return item;
    }),
  );
  el.hidden = false;
};
