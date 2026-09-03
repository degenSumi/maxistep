import { useCallback, useEffect } from "react";
import {
  PROTOCOL_VERSION,
  isMaxiStepMessage,
  type AppMessage,
  type EmbedTheme,
} from "@repo/shared/embed";

/** Query flag the loader appends when it mounts the iframe. */
export function isEmbedded(): boolean {
  return new URLSearchParams(window.location.search).has("embed");
}

function send(message: AppMessage) {
  // The opener is the only correct target and it is always the direct parent.
  // Never "*" — that would broadcast to any frame that happens to be listening.
  if (window.parent === window) return;
  window.parent.postMessage(message, "*");
}

/**
 * Wires the embedded app to its host page.
 *
 * Origin note: the host is by definition a third-party site, so its origin is
 * not knowable ahead of time and inbound messages are validated by shape rather
 * than by origin. Nothing here acts on host data beyond applying theme colours,
 * so the blast radius of a spoofed message is a restyled widget. Identity will
 * arrive as a signed token verified server-side, never trusted from this channel.
 */
export function useEmbedBridge(onClose: () => void) {
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isMaxiStepMessage(event.data)) return;
      if (event.data.version !== PROTOCOL_VERSION) return;
      if (event.data.type === "host:close") onClose();
      if (event.data.type === "host:init") {
        const theme = (event.data as { theme?: EmbedTheme }).theme;
        if (theme?.brand) document.documentElement.style.setProperty("--color-brand", theme.brand);
        if (theme?.brandHi) {
          document.documentElement.style.setProperty("--color-brand-hi", theme.brandHi);
          document.documentElement.style.setProperty("--color-brand-soft", theme.brandHi);
        }
      }
    };

    window.addEventListener("message", onMessage);
    send({ channel: "maxistep", version: PROTOCOL_VERSION, type: "app:ready" });
    return () => window.removeEventListener("message", onMessage);
  }, [onClose]);

  return useCallback(() => {
    send({ channel: "maxistep", version: PROTOCOL_VERSION, type: "app:close" });
  }, []);
}
