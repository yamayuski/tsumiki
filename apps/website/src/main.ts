import "./style.css";
import { startRuntime } from "./runtime.ts";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<main class="runtime-root">
  <header>
    <h1>Tsumiki Runtime MVP</h1>
    <p>UI Thread → ECS Worker → Renderer Worker (OffscreenCanvas)</p>
    <p>Move entity with <code>←</code> <code>→</code> or <code>A</code> <code>D</code></p>
  </header>
  <section id="runtime-host"></section>
</main>
`;

const host = document.querySelector<HTMLElement>("#runtime-host");
if (!host) {
  throw new Error("runtime host not found");
}

const runtime = startRuntime(host);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    runtime.dispose();
  });
}
