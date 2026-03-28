import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./style.css";

// Configure Monaco to use the locally bundled version instead of CDN
loader.config({ monaco });

// Set up Monaco workers from the bundled assets (required for Vite builds)
window.MonacoEnvironment = {
  getWorker(_moduleId: string, label: string) {
    if (label === "typescript" || label === "javascript") {
      return new Worker(
        new URL("monaco-editor/esm/vs/language/typescript/ts.worker", import.meta.url),
        { type: "module" },
      );
    }
    if (label === "json") {
      return new Worker(
        new URL("monaco-editor/esm/vs/language/json/json.worker", import.meta.url),
        { type: "module" },
      );
    }
    if (label === "css" || label === "scss" || label === "less") {
      return new Worker(new URL("monaco-editor/esm/vs/language/css/css.worker", import.meta.url), {
        type: "module",
      });
    }
    if (label === "html" || label === "handlebars" || label === "razor") {
      return new Worker(
        new URL("monaco-editor/esm/vs/language/html/html.worker", import.meta.url),
        { type: "module" },
      );
    }
    return new Worker(new URL("monaco-editor/esm/vs/editor/editor.worker", import.meta.url), {
      type: "module",
    });
  },
};

const container = document.getElementById("app");
if (!container) throw new Error("App container not found");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
