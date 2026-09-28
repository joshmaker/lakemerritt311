/** Creates an element with the given classes and text. */
export const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = text;
  return el;
};

/** A CSS custom property's value on the page root, e.g. a Tailwind theme color like "--color-ink". */
export const cssVar = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Classes for form controls (search boxes, dropdowns, buttons), so they all match. */
export const CONTROL = "rounded-md border border-line bg-panel px-2 py-1.5 text-sm";

/** A dropdown with the given options; `label` names it for screen readers. */
export const select = (label: string, options: [value: string, text: string][], className = "") => {
  const el = element("select", `${CONTROL} ${className}`);
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

/**
 * A card's header, the same on every card: the title with a muted subtitle under it, and any
 * `extras` (a legend, a button) on the right. Returns the subtitle too, for text that changes.
 */
export const cardHeader = (title: string, subtitleText = "", ...extras: Node[]) => {
  const subtitle = element("p", "text-xs text-muted", subtitleText);
  const titles = element("div", "min-w-0");
  titles.append(element("h2", "text-lg font-semibold", title), subtitle);
  const header = element("div", "mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2");
  header.append(titles, ...extras);
  return { header, subtitle };
};
