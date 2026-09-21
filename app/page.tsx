"use client";

import { useSyncExternalStore } from "react";

import { App } from "@/App";

export default function HomePage(): React.JSX.Element {
  const isClient = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  if (!isClient) {
    return (
      <main className="loading-screen" aria-busy="true">
        <div className="brand-mark">WL</div>
        <p>Opening your private workspace…</p>
      </main>
    );
  }
  return <App />;
}
