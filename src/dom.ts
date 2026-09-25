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
