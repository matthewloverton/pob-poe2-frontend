/// <reference types="vite/client" />
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { useBuildStore } from "./build/buildStore";

const root = document.getElementById("root");
if (!root) throw new Error("root element missing");
// StrictMode disabled: its double-mount races with async Pixi teardown on the shared canvas.
createRoot(root).render(<App />);

// Dev-only: expose the build store on window so we can poke it from DevTools
// (e.g. window.__buildStore.getState().sourceXml) without importing through Vite.
if (import.meta.env.DEV) {
  (window as unknown as { __buildStore: typeof useBuildStore }).__buildStore = useBuildStore;
}

// HMR on Pixi modules leaves GL state orphaned. Force a full reload instead.
if (import.meta.hot) {
  import.meta.hot.accept(() => window.location.reload());
}
