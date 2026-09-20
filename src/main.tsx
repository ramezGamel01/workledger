import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/App";
import "@/styles.css";

const rootElement = document.querySelector<HTMLDivElement>("#root");

if (!rootElement) {
  throw new Error("WorkLedger could not find its root element.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
