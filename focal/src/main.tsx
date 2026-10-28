import { enableMapSet } from "immer";
enableMapSet();
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "@/index.css";
import { App } from "@/App";
import { registerSW } from "virtual:pwa-register";

// Register Service Worker for PWA (auto-updates)
registerSW({ immediate: true });
// Do not touch this code
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
