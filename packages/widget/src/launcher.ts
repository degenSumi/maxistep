import type { WidgetConfig } from "./config.js";
import { FONT, Z_INDEX, applyStyles } from "./styles.js";

const MARK =
  '<svg viewBox="0 0 24 24" width="25" height="25" aria-hidden="true">' +
  '<path fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round" ' +
  'd="M12 3.6c4.8 0 8.4 3.2 8.4 7.3 0 4-3.6 7.3-8.4 7.3-.9 0-1.8-.1-2.6-.3L5 20.4l1-3.5c-1.9-1.4-3-3.3-3-5.4 0-4.1 3.6-7.3 8.4-7.3z"/>' +
  '<circle cx="8.6" cy="11" r="1.15" fill="currentColor"/>' +
  '<circle cx="12" cy="11" r="1.15" fill="currentColor"/>' +
  '<circle cx="15.4" cy="11" r="1.15" fill="currentColor"/></svg>';

const CLOSE =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
  '<path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/></svg>';

/** Shown once per tab. Nagging on every page view is how a launcher gets ignored. */
const NUDGE_KEY = "maxistep:nudge-dismissed";

function nudgeAlreadySeen(): boolean {
  try {
    return sessionStorage.getItem(NUDGE_KEY) === "1";
  } catch {
    // Private mode, or a host page that blocks storage. Not a reason to fail.
    return false;
  }
}

function rememberNudge() {
  try {
    sessionStorage.setItem(NUDGE_KEY, "1");
  } catch {
    /* nothing to do */
  }
}

/**
 * The launcher lives in the host page rather than inside the frame. An iframe
 * cannot paint outside its own box, so a framed launcher would need a
 * full-viewport transparent frame swallowing the host page's clicks.
 */
export function createLauncher(config: WidgetConfig, onToggle: () => void) {
  const brand = config.brand ?? "#f97316";
  const brandHi = config.brandHi ?? "#fb923c";

  // Wraps the button, the pulse ring and the nudge, so the whole cluster is
  // positioned once and removed together.
  const root = document.createElement("div");
  applyStyles(root, {
    position: "fixed",
    bottom: "20px",
    [config.side]: "20px",
    zIndex: String(Z_INDEX),
    display: "flex",
    alignItems: "center",
    flexDirection: config.side === "right" ? "row" : "row-reverse",
    gap: "10px",
    font: FONT,
  } as Partial<CSSStyleDeclaration>);

  // --- the nudge -----------------------------------------------------------
  const nudge = document.createElement("button");
  nudge.type = "button";
  nudge.innerHTML =
    `<span style="display:block;font-weight:600;font-size:13px;color:#0f172a;letter-spacing:-.01em">${config.label}</span>` +
    `<span style="display:block;margin-top:2px;font-size:11.5px;color:#64748b">Sizing, orders, returns — ask away</span>`;
  applyStyles(nudge, {
    display: "none",
    maxWidth: "220px",
    textAlign: config.side === "right" ? "right" : "left",
    padding: "10px 13px",
    border: "1px solid rgba(15,23,42,.09)",
    borderRadius: "13px",
    background: "#fff",
    boxShadow: "0 10px 30px -8px rgba(15,23,42,.28)",
    cursor: "pointer",
    font: FONT,
  } as Partial<CSSStyleDeclaration>);

  // --- the button, with a pulse ring behind it ----------------------------
  const shell = document.createElement("div");
  applyStyles(shell, { position: "relative", width: "58px", height: "58px" });

  const ring = document.createElement("span");
  applyStyles(ring, {
    position: "absolute",
    inset: "0",
    borderRadius: "999px",
    background: brand,
    opacity: "0.55",
    pointerEvents: "none",
  } as Partial<CSSStyleDeclaration>);

  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", config.label);
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-haspopup", "dialog");
  button.innerHTML = MARK;
  applyStyles(button, {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "58px",
    height: "58px",
    padding: "0",
    border: "none",
    borderRadius: "999px",
    background: `linear-gradient(135deg, ${brandHi}, ${brand})`,
    color: "#fff",
    cursor: "pointer",
    boxShadow: "0 10px 30px -6px rgba(0,0,0,.42)",
    font: FONT,
    transition: "transform .18s ease, box-shadow .18s ease",
  } as Partial<CSSStyleDeclaration>);

  // A small unread-style dot: the cheapest signal that there is something here.
  const dot = document.createElement("span");
  applyStyles(dot, {
    position: "absolute",
    top: "0px",
    right: "0px",
    width: "15px",
    height: "15px",
    borderRadius: "999px",
    background: "#ef4444",
    border: "2.5px solid #fff",
    pointerEvents: "none",
  } as Partial<CSSStyleDeclaration>);

  shell.append(ring, button, dot);
  root.append(nudge, shell);

  // Web Animations rather than keyframes: injecting a stylesheet into the host
  // page is the one thing this widget is built never to do.
  const pulse = ring.animate(
    [
      { transform: "scale(1)", opacity: 0.5 },
      { transform: "scale(1.65)", opacity: 0 },
    ],
    { duration: 2000, iterations: Infinity, easing: "ease-out" },
  );

  let dismissed = nudgeAlreadySeen();
  let timer: ReturnType<typeof setTimeout> | undefined;

  function hideNudge(remember: boolean) {
    nudge.style.display = "none";
    if (remember) {
      dismissed = true;
      rememberNudge();
    }
    if (timer) clearTimeout(timer);
  }

  function showNudge() {
    if (dismissed) return;
    nudge.style.display = "block";
    nudge.animate(
      [
        { opacity: 0, transform: "translateY(6px) scale(.96)" },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ],
      { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
    // Long enough to read, short enough not to sit on the page forever.
    timer = setTimeout(() => hideNudge(false), 12_000);
  }

  if (!dismissed) timer = setTimeout(showNudge, 2600);

  nudge.addEventListener("click", () => {
    hideNudge(true);
    onToggle();
  });

  button.addEventListener("mouseenter", () => {
    button.style.transform = "translateY(-2px) scale(1.04)";
  });
  button.addEventListener("mouseleave", () => {
    button.style.transform = "translateY(0) scale(1)";
  });
  button.addEventListener("click", () => {
    hideNudge(true);
    onToggle();
  });

  return {
    element: root,
    setOpen(open: boolean) {
      button.setAttribute("aria-expanded", String(open));
      button.innerHTML = open ? CLOSE : MARK;
      // Once it is open the attention-grabbing is done and becomes noise.
      if (open) {
        hideNudge(true);
        pulse.cancel();
        dot.style.display = "none";
        ring.style.display = "none";
      }
    },
  };
}
