import {
  ECSEngine,
  World,
  type ComponentConstructor,
  type System,
} from "../../../../packages/core-ecs/src/index.ts";
import {
  type EcsToRendererDiffMessage,
  type EcsToRendererInitMessage,
  type EcsToRendererMessage,
  type MainToEcsInputMessage,
  type MainToEcsMessage,
  type MainToEcsTickMessage,
  type RendererCommand,
  isMainToEcsMessage,
} from "../../../../packages/runtime-core/src/index.ts";

class Position {
  static readonly typeId = "Position";
  static readonly schema = { x: "f32", y: "f32", z: "f32" } as const;

  public x: number;
  public y: number;
  public z: number;

  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
}

class Velocity {
  static readonly typeId = "Velocity";
  static readonly schema = { vx: "f32", vy: "f32", vz: "f32" } as const;

  public vx: number;
  public vy: number;
  public vz: number;

  constructor(vx = 0, vy = 0, vz = 0) {
    this.vx = vx;
    this.vy = vy;
    this.vz = vz;
  }
}

class Renderable {
  static readonly typeId = "Renderable";
  static readonly schema = { kind: "u8", colorId: "u8" } as const;

  public kind: number;
  public colorId: number;

  constructor(kind = 1, colorId = 1) {
    this.kind = kind;
    this.colorId = colorId;
  }
}

class MovementSystem implements System {
  public update(world: World, deltaTime: number): void {
    const rows = world.query(Position, Velocity);
    for (const row of rows) {
      const position = row.components[0] as Position;
      const velocity = row.components[1] as Velocity;
      position.x += velocity.vx * deltaTime;
      position.y += velocity.vy * deltaTime;
      if (position.x > 1) {
        position.x = -1;
      }
      if (position.x < -1) {
        position.x = 1;
      }
    }
  }
}

interface MainToEcsConnectRendererMessage {
  type: "main.ecs.connect_renderer";
  payload: {
    port: MessagePort;
  };
}

type WorkerInboundMessage = MainToEcsMessage | MainToEcsConnectRendererMessage;

const scope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;

const world = new World();
const engine = new ECSEngine(world);
engine.addSystem(new MovementSystem());

let rendererPort: MessagePort | null = null;

function postRenderer(message: EcsToRendererMessage): void {
  if (rendererPort) {
    rendererPort.postMessage(message);
  }
  scope.postMessage(message);
}

function bootstrapScene(): void {
  const entity = world.createEntity();
  const components = new Map<ComponentConstructor, unknown>();
  components.set(Position, new Position(0, 0, 0));
  components.set(Velocity, new Velocity(0.6, 0, 0));
  components.set(Renderable, new Renderable(1, 1));
  world.addEntityWithComponents(entity, components);
}

function handleInput(message: MainToEcsInputMessage): void {
  const rows = world.query(Velocity);
  const first = rows[0];
  if (!first) {
    return;
  }
  const velocity = first.components[0] as Velocity;
  if (message.payload.type === "keyboard.down") {
    const code = message.payload.payload["code"];
    if (code === "ArrowLeft" || code === "KeyA") {
      velocity.vx = -0.8;
    }
    if (code === "ArrowRight" || code === "KeyD") {
      velocity.vx = 0.8;
    }
  }
  if (message.payload.type === "keyboard.up") {
    velocity.vx = 0;
  }
}

function emitDiff(frame: number): void {
  const commands: RendererCommand[] = [];
  const rows = world.query(Position, Renderable);
  for (const row of rows) {
    const position = row.components[0] as Position;
    commands.push({
      op: "upsert",
      entityId: row.entity,
      transform: {
        x: position.x,
        y: position.y,
        z: position.z,
      },
      mesh: {
        kind: "box",
        material: "standard",
        colorHex: "#57b8ff",
      },
    });
  }

  const message: EcsToRendererDiffMessage = {
    type: "ecs.renderer.diff",
    payload: {
      frame,
      commands,
    },
  };
  postRenderer(message);
}

scope.onmessage = (event: MessageEvent<WorkerInboundMessage>) => {
  const message = event.data;

  if (message.type === "main.ecs.connect_renderer") {
    rendererPort = message.payload.port;
    rendererPort.start();
    return;
  }

  if (!isMainToEcsMessage(message)) {
    return;
  }

  if (message.type === "main.ecs.init") {
    bootstrapScene();
    const initMessage: EcsToRendererInitMessage = {
      type: "ecs.renderer.init",
      payload: {
        sceneId: message.payload.sceneId,
      },
    };
    postRenderer(initMessage);
    return;
  }

  if (message.type === "main.ecs.input") {
    handleInput(message);
    return;
  }

  if (message.type === "main.ecs.tick") {
    const tick = message as MainToEcsTickMessage;
    engine.update(tick.payload.deltaMs / 1000);
    emitDiff(tick.payload.frame);
  }
};
