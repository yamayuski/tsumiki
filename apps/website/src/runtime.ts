import type {
  EcsToRendererMessage,
  MainToEcsInputMessage,
  MainToEcsMessage,
  MainToEcsTickMessage,
  RuntimeInputEvent,
} from "../../../packages/runtime-core/src/index.ts";

interface MainToRendererCanvasMessage {
  type: "main.renderer.canvas";
  payload: {
    canvas: OffscreenCanvas;
    width: number;
    height: number;
  };
}

interface MainToRendererConnectPortMessage {
  type: "main.renderer.connect_port";
  payload: {
    port: MessagePort;
  };
}

type MainToRendererMessage = MainToRendererCanvasMessage | MainToRendererConnectPortMessage;

export interface RuntimeController {
  dispose(): void;
}

export function startRuntime(host: HTMLElement): RuntimeController {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(640, Math.floor(host.clientWidth || window.innerWidth) - 24);
  canvas.height = Math.max(360, Math.floor(window.innerHeight * 0.6));
  canvas.style.maxWidth = "100%";
  canvas.style.display = "block";
  canvas.style.border = "1px solid var(--border)";
  canvas.style.borderRadius = "8px";

  const status = document.createElement("p");
  status.className = "runtime-status";
  status.textContent = "Runtime: booting...";

  host.replaceChildren(status, canvas);

  const ecsWorker = new Worker(new URL("./workers/ecs.worker.ts", import.meta.url), {
    type: "module",
  });
  const rendererWorker = new Worker(new URL("./workers/renderer.worker.ts", import.meta.url), {
    type: "module",
  });

  const offscreen = canvas.transferControlToOffscreen();
  const rendererCanvasMessage: MainToRendererCanvasMessage = {
    type: "main.renderer.canvas",
    payload: {
      canvas: offscreen,
      width: canvas.width,
      height: canvas.height,
    },
  };

  const channel = new MessageChannel();
  const rendererConnectMessage: MainToRendererConnectPortMessage = {
    type: "main.renderer.connect_port",
    payload: {
      port: channel.port2,
    },
  };

  rendererWorker.postMessage(rendererCanvasMessage, [offscreen]);
  rendererWorker.postMessage(rendererConnectMessage, [channel.port2]);
  ecsWorker.postMessage({ type: "main.ecs.connect_renderer", payload: { port: channel.port1 } }, [
    channel.port1,
  ]);

  const initMessage: MainToEcsMessage = {
    type: "main.ecs.init",
    payload: {
      sceneId: "sandbox",
      seed: Date.now(),
    },
  };
  ecsWorker.postMessage(initMessage);

  let frame = 0;
  let rafId = 0;
  let lastTs = performance.now();

  const postInput = (event: RuntimeInputEvent) => {
    const m: MainToEcsInputMessage = {
      type: "main.ecs.input",
      payload: event,
    };
    ecsWorker.postMessage(m);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    postInput({
      type: "keyboard.down",
      timestamp: event.timeStamp,
      payload: {
        code: event.code,
      },
    });
  };

  const onKeyUp = (event: KeyboardEvent) => {
    postInput({
      type: "keyboard.up",
      timestamp: event.timeStamp,
      payload: {
        code: event.code,
      },
    });
  };

  const onPointerMove = (event: PointerEvent) => {
    postInput({
      type: "pointer.move",
      timestamp: event.timeStamp,
      payload: {
        x: event.clientX,
        y: event.clientY,
      },
    });
  };

  const onTick = (ts: number) => {
    const dt = ts - lastTs;
    lastTs = ts;
    frame += 1;

    const tickMessage: MainToEcsTickMessage = {
      type: "main.ecs.tick",
      payload: {
        frame,
        deltaMs: dt,
      },
    };
    ecsWorker.postMessage(tickMessage);
    rafId = requestAnimationFrame(onTick);
  };

  ecsWorker.onmessage = (event: MessageEvent<EcsToRendererMessage>) => {
    const message = event.data;
    if (message.type === "ecs.renderer.diff") {
      status.textContent = `Runtime: running (frame ${message.payload.frame}, commands ${message.payload.commands.length})`;
    }
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  rafId = requestAnimationFrame(onTick);

  const dispose = () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("pointermove", onPointerMove);
    ecsWorker.terminate();
    rendererWorker.terminate();
  };

  return { dispose };
}

export type { MainToRendererMessage };
