import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("root element missing");
// StrictMode disabled: its double-mount races with async Pixi teardown on the shared canvas.
createRoot(root).render(<App />);
