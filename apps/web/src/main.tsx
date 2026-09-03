import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import EmbedApp from "./EmbedApp.js";
import { isEmbedded } from "./features/embed/useEmbedBridge.js";
import "./index.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root element missing from index.html");

const Root = isEmbedded() ? EmbedApp : App;

createRoot(container).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
