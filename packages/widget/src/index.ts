import { PROTOCOL_VERSION, isMaxiStepMessage } from "@repo/shared/embed";
import { currentScript, readConfig } from "./config.js";
import { createLauncher } from "./launcher.js";
import { createPanel } from "./panel.js";

function boot() {
  const script = currentScript();
  if (!script) return;

  // Two copies of the tag on one page would otherwise mean two launchers.
  if (window.__maxistepWidget) return;
  window.__maxistepWidget = true;

  const config = readConfig(script);
  const panel = createPanel(config);

  let open = false;

  const launcher = createLauncher(config, () => setOpen(!open));

  function setOpen(next: boolean) {
    open = next;
    if (open) panel.mount();
    panel.setOpen(open);
    launcher.setOpen(open);
  }

  window.addEventListener("message", (event) => {
    // Only the frame we created may drive the launcher.
    if (event.origin !== config.origin) return;
    if (event.source !== panel.element.contentWindow) return;
    if (!isMaxiStepMessage(event.data) || event.data.version !== PROTOCOL_VERSION) return;

    if (event.data.type === "app:ready") panel.sendInit();
    if (event.data.type === "app:close") setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && open) setOpen(false);
  });

  window.addEventListener("resize", () => {
    if (open) panel.layout();
  });

  document.body.append(panel.element, launcher.element);

  if (config.autoOpen) setOpen(true);

  window.MaxiStep = {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
  };
}

declare global {
  interface Window {
    __maxistepWidget?: boolean;
    MaxiStep?: { open: () => void; close: () => void; toggle: () => void };
  }
}

// The script may be loaded in <head> with defer, or injected after load.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
