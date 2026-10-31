import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/App";
import { seedDemoLedger } from "@/demo/seed";
import "@fontsource-variable/inter";
import "@fontsource-variable/newsreader";
import "@/styles.css";

const root = createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <main className="loading-screen" aria-busy="true">
    <div className="brand-mark">WL</div>
    <p>Preparing the demo workspace…</p>
  </main>,
);

seedDemoLedger()
  .catch(() => undefined) // The app still opens; it shows its own setup state
  .finally(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
