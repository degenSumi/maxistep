/**
 * The postMessage contract between a host page's launcher and the embedded
 * application. Shared by both sides so a rename breaks the build rather than
 * the widget.
 *
 * Versioned because host pages cache the loader script independently of the
 * application deploy; the two can drift by days.
 */
export const PROTOCOL_VERSION = 1;

/** Host page → embedded app. */
export type HostMessage =
  | { channel: "maxistep"; version: number; type: "host:init"; theme?: EmbedTheme }
  | { channel: "maxistep"; version: number; type: "host:open" }
  | { channel: "maxistep"; version: number; type: "host:close" };

/** Embedded app → host page. */
export type AppMessage =
  | { channel: "maxistep"; version: number; type: "app:ready" }
  | { channel: "maxistep"; version: number; type: "app:close" };

export interface EmbedTheme {
  brand?: string;
  brandHi?: string;
}

export function isMaxiStepMessage(data: unknown): data is { channel: "maxistep"; version: number; type: string } {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { channel?: unknown }).channel === "maxistep" &&
    typeof (data as { type?: unknown }).type === "string"
  );
}
