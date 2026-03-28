export type RuntimeEntityId = bigint;

export type InputEventType =
  | "keyboard.down"
  | "keyboard.up"
  | "pointer.down"
  | "pointer.up"
  | "pointer.move"
  | "gamepad.button"
  | "gamepad.axis";

export interface RuntimeInputEvent {
  type: InputEventType;
  timestamp: number;
  payload: Record<string, unknown>;
}

export interface TickPayload {
  frame: number;
  deltaMs: number;
}

export interface SceneBootstrap {
  sceneId: string;
  seed?: number;
}

export interface RendererCommandCreateOrUpdate {
  op: "upsert";
  entityId: RuntimeEntityId;
  transform?: {
    x?: number;
    y?: number;
    z?: number;
    rx?: number;
    ry?: number;
    rz?: number;
    sx?: number;
    sy?: number;
    sz?: number;
  };
  mesh?: {
    kind: "box" | "sphere" | "plane";
    material?: "standard" | "pbr";
    colorHex?: string;
  };
}

export interface RendererCommandDelete {
  op: "delete";
  entityId: RuntimeEntityId;
}

export type RendererCommand = RendererCommandCreateOrUpdate | RendererCommandDelete;

export interface MainToEcsInitMessage {
  type: "main.ecs.init";
  payload: SceneBootstrap;
}

export interface MainToEcsInputMessage {
  type: "main.ecs.input";
  payload: RuntimeInputEvent;
}

export interface MainToEcsTickMessage {
  type: "main.ecs.tick";
  payload: TickPayload;
}

export type MainToEcsMessage = MainToEcsInitMessage | MainToEcsInputMessage | MainToEcsTickMessage;

export interface EcsToRendererInitMessage {
  type: "ecs.renderer.init";
  payload: {
    sceneId: string;
  };
}

export interface EcsToRendererDiffMessage {
  type: "ecs.renderer.diff";
  payload: {
    frame: number;
    commands: RendererCommand[];
  };
}

export type EcsToRendererMessage = EcsToRendererInitMessage | EcsToRendererDiffMessage;

export interface RendererToEcsAckMessage {
  type: "renderer.ecs.ack";
  payload: {
    frame: number;
  };
}

export type RendererToEcsMessage = RendererToEcsAckMessage;

export function isMainToEcsMessage(v: unknown): v is MainToEcsMessage {
  if (!v || typeof v !== "object") {
    return false;
  }
  const m = v as { type?: unknown; payload?: unknown };
  if (typeof m.type !== "string" || typeof m.payload !== "object") {
    return false;
  }
  return m.type === "main.ecs.init" || m.type === "main.ecs.input" || m.type === "main.ecs.tick";
}

export function isEcsToRendererMessage(v: unknown): v is EcsToRendererMessage {
  if (!v || typeof v !== "object") {
    return false;
  }
  const m = v as { type?: unknown; payload?: unknown };
  if (typeof m.type !== "string" || typeof m.payload !== "object") {
    return false;
  }
  return m.type === "ecs.renderer.init" || m.type === "ecs.renderer.diff";
}
