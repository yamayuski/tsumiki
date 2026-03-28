import type { EcsToRendererMessage } from "../../../../packages/runtime-core/src/index.ts";
import { createBabylonRendererBridge } from "../../../../packages/renderer-babylon/src/index.ts";

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

const scope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;
const renderer = createBabylonRendererBridge();

scope.onmessage = (event: MessageEvent<MainToRendererMessage>) => {
  const message = event.data;

  if (message.type === "main.renderer.canvas") {
    renderer.setCanvas(message.payload.canvas, message.payload.width, message.payload.height);
    return;
  }

  if (message.type === "main.renderer.connect_port") {
    message.payload.port.onmessage = (portEvent: MessageEvent<EcsToRendererMessage>) => {
      renderer.onEcsMessage(portEvent.data);
    };
    message.payload.port.start();
  }
};
