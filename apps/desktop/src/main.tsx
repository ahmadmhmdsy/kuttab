import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserLabs } from "@kuttab/labs/browser";
import { App } from "./App.tsx";
import { applyDocumentLang } from "./i18n.ts";
import { createPlatform } from "./platform/index.ts";
import { applyAppearance, boot, useStore } from "./state.ts";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

boot(createPlatform, createBrowserLabs)
  .then(() => {
    applyDocumentLang(useStore.getState().settings.uiLang);
    applyAppearance(useStore.getState().settings);
    useStore.subscribe((s, prev) => {
      if (s.settings !== prev.settings) applyAppearance(s.settings);
    });
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((e: unknown) => {
    console.error(e);
    root.render(
      <main className="boot-error">
        <h1>Kuttab could not start</h1>
        <pre>{e instanceof Error ? e.message : String(e)}</pre>
      </main>,
    );
  });
