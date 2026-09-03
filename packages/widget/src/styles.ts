/**
 * Every style is set inline. A host page's stylesheet cannot reach these, and
 * we never inject a stylesheet that could reach theirs.
 */
export const Z_INDEX = 2147483000;

export const FONT =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Helvetica Neue", sans-serif';

export function applyStyles(el: HTMLElement, styles: Partial<CSSStyleDeclaration>) {
  Object.assign(el.style, styles);
}

export const MOBILE_BREAKPOINT = 480;

export function isMobile(): boolean {
  return window.innerWidth <= MOBILE_BREAKPOINT;
}
