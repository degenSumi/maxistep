import { PROTOCOL_VERSION, type HostMessage } from "@repo/shared/embed";
import type { WidgetConfig } from "./config.js";
import { Z_INDEX, applyStyles, isMobile } from "./styles.js";

/**
 * Owns the iframe. The frame is created on first open rather than at page load,
 * so a host page that never opens the widget pays for the loader only.
 */
export function createPanel(config: WidgetConfig) {
  const frame = document.createElement("iframe");
  let mounted = false;

  frame.title = "MaxiStep support chat";
  frame.setAttribute("aria-hidden", "true");
  // Same-origin to its own server, cross-origin to the host: the host page can
  // neither read this DOM nor reach its storage.
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups");
  frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  frame.allow = "clipboard-write";

  applyStyles(frame, {
    position: "fixed",
    zIndex: String(Z_INDEX - 1),
    border: "none",
    borderRadius: "16px",
    background: "#0b0f16",
    boxShadow: "0 24px 70px -18px rgba(0,0,0,.65)",
    opacity: "0",
    pointerEvents: "none",
    transform: "translateY(8px) scale(.98)",
    transformOrigin: config.side === "left" ? "left bottom" : "right bottom",
    transition: "opacity .18s ease, transform .18s ease",
  } as Partial<CSSStyleDeclaration>);

  function layout() {
    if (isMobile()) {
      // A 380px panel on a 360px phone is a horizontal scrollbar, so it takes
      // the whole viewport instead.
      applyStyles(frame, {
        inset: "0",
        width: "100%",
        height: "100%",
        borderRadius: "0",
      } as Partial<CSSStyleDeclaration>);
      return;
    }

    applyStyles(frame, {
      inset: "auto",
      bottom: "88px",
      [config.side]: "20px",
      width: "min(400px, calc(100vw - 40px))",
      height: "min(640px, calc(100vh - 120px))",
      borderRadius: "16px",
    } as Partial<CSSStyleDeclaration>);
  }

  function post(message: HostMessage) {
    // Targeted at the app's own origin, never "*".
    frame.contentWindow?.postMessage(message, config.origin);
  }

  return {
    element: frame,

    mount() {
      if (mounted) return;
      mounted = true;
      const url = new URL("/", config.origin);
      url.searchParams.set("embed", "1");
      frame.src = url.toString();
    },

    layout,

    setOpen(open: boolean) {
      layout();
      frame.setAttribute("aria-hidden", String(!open));
      applyStyles(frame, {
        opacity: open ? "1" : "0",
        pointerEvents: open ? "auto" : "none",
        transform: open ? "translateY(0) scale(1)" : "translateY(8px) scale(.98)",
      } as Partial<CSSStyleDeclaration>);
    },

    /** Sent once the frame reports itself ready — earlier would be dropped. */
    sendInit() {
      post({
        channel: "maxistep",
        version: PROTOCOL_VERSION,
        type: "host:init",
        theme: { brand: config.brand, brandHi: config.brandHi },
      });
    },
  };
}
