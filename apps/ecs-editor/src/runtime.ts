import type {
  MainToEcsMessage,
  MainToEcsTickMessage,
} from "../../../packages/runtime-core/src/index.ts";
import type {
  EcsToMainMessage,
  EntitySnapshot,
  MainToEcsEditorMessage,
} from "./editorContracts.ts";

interface MainToRendererCanvasMessage {
  type: "main.renderer.canvas";
  payload: { canvas: OffscreenCanvas; width: number; height: number };
}

interface MainToRendererConnectPortMessage {
  type: "main.renderer.connect_port";
  payload: { port: MessagePort };
}

export type EditorMessage = EcsToMainMessage;

export interface EditorStateSnapshot {
  running: boolean;
  frame: number;
  entities: EntitySnapshot[];
}

export interface RuntimeController {
  postEditor(message: MainToEcsEditorMessage): void;
  dispose(): void;
}

export type StateListener = (state: EditorStateSnapshot) => void;

export function startRuntime(canvas: HTMLCanvasElement, onState: StateListener): RuntimeController {
  const ecsWorker = new Worker(new URL("./workers/ecs.worker.ts", import.meta.url), {
    type: "module",
  });
  const rendererWorker = new Worker(new URL("./workers/renderer.worker.ts", import.meta.url), {
    type: "module",
  });

  const offscreen = canvas.transferControlToOffscreen();
  const rendererCanvasMessage: MainToRendererCanvasMessage = {
    type: "main.renderer.canvas",
    payload: { canvas: offscreen, width: canvas.width, height: canvas.height },
  };

  const channel = new MessageChannel();
  const rendererConnectMessage: MainToRendererConnectPortMessage = {
    type: "main.renderer.connect_port",
    payload: { port: channel.port2 },
  };

  rendererWorker.postMessage(rendererCanvasMessage, [offscreen]);
  rendererWorker.postMessage(rendererConnectMessage, [channel.port2]);
  ecsWorker.postMessage({ type: "main.ecs.connect_renderer", payload: { port: channel.port1 } }, [
    channel.port1,
  ]);

  const initMessage: MainToEcsMessage = {
    type: "main.ecs.init",
    payload: { sceneId: "sandbox", seed: Date.now() },
  };
  ecsWorker.postMessage(initMessage);

  let frame = 0;
  let rafId = 0;
  let lastTs = performance.now();

  const onTick = (ts: number) => {
    const dt = ts - lastTs;
    lastTs = ts;
    frame += 1;
    const tickMessage: MainToEcsTickMessage = {
      type: "main.ecs.tick",
      payload: { frame, deltaMs: dt },
    };
    ecsWorker.postMessage(tickMessage);
    rafId = requestAnimationFrame(onTick);
  };

  ecsWorker.onmessage = (event: MessageEvent<EditorMessage>) => {
    const message = event.data;
    if (message.type === "ecs.main.state") {
      onState({
        running: message.payload.running,
        frame: message.payload.frame,
        entities: message.payload.entities,
      });
    }
  };

  rafId = requestAnimationFrame(onTick);

  return {
    postEditor(message: MainToEcsEditorMessage) {
      ecsWorker.postMessage(message);
    },
    dispose() {
      cancelAnimationFrame(rafId);
      ecsWorker.terminate();
      rendererWorker.terminate();
    },
  };
}
