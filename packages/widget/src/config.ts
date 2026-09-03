export interface WidgetConfig {
  /** Origin serving the embedded app. Derived from the script's own src. */
  origin: string;
  /** Accent colour applied inside the frame, for white-labelling. */
  brand?: string;
  brandHi?: string;
  /** Launcher position on the host page. */
  side: "left" | "right";
  label: string;
  /** Open on load, for demo pages that want the panel already visible. */
  autoOpen: boolean;
}

const DEFAULTS = {
  side: "right" as const,
  label: "Chat with us",
  autoOpen: false,
};

/**
 * Reads configuration from the script tag's data-* attributes.
 *
 * The origin is taken from the script's own src rather than an attribute, so a
 * host page cannot be tricked into pointing the frame somewhere else, and so
 * there is one less thing for an integrator to get wrong.
 */
export function readConfig(script: HTMLScriptElement): WidgetConfig {
  const data = script.dataset;
  const side = data.side === "left" ? "left" : DEFAULTS.side;

  return {
    origin: new URL(script.src, window.location.href).origin,
    brand: data.brand,
    brandHi: data.brandHi,
    side,
    label: data.label ?? DEFAULTS.label,
    autoOpen: data.autoOpen === "true",
  };
}

/** The script element that loaded this bundle, resolved at execution time. */
export function currentScript(): HTMLScriptElement | null {
  if (document.currentScript instanceof HTMLScriptElement) return document.currentScript;
  // Fallback for async/defer edge cases where currentScript is already null.
  const scripts = document.querySelectorAll<HTMLScriptElement>('script[src*="widget.js"]');
  return scripts[scripts.length - 1] ?? null;
}
