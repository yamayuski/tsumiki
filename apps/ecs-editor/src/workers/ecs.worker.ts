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
import type {
  ComponentSnapshot,
  EcsToMainMessage,
  EntitySnapshot,
  MainToEcsEditorMessage,
} from "../editorContracts.ts";

// ─── Component definitions ────────────────────────────────────────────────────

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

// Registry of known component constructors (for inspector + serialization)
const componentRegistry = new Map<string, ComponentConstructor>([
  [Position.typeId, Position as unknown as ComponentConstructor],
  [Velocity.typeId, Velocity as unknown as ComponentConstructor],
  [Renderable.typeId, Renderable as unknown as ComponentConstructor],
]);

// ─── Built-in systems ─────────────────────────────────────────────────────────

class MovementSystem implements System {
  public update(world: World, deltaTime: number): void {
    const rows = world.query(
      Position as unknown as ComponentConstructor,
      Velocity as unknown as ComponentConstructor,
    );
    for (const row of rows) {
      const position = row.components[0] as Position;
      const velocity = row.components[1] as Velocity;
      position.x += velocity.vx * deltaTime;
      position.y += velocity.vy * deltaTime;
      if (position.x > 1) position.x = -1;
      if (position.x < -1) position.x = 1;
      world.addComponent(row.entity, Position as unknown as ComponentConstructor, position);
    }
  }
}

// ─── Worker state ─────────────────────────────────────────────────────────────

interface MainToEcsConnectRendererMessage {
  type: "main.ecs.connect_renderer";
  payload: { port: MessagePort };
}

type WorkerInboundMessage =
  | MainToEcsMessage
  | MainToEcsEditorMessage
  | MainToEcsConnectRendererMessage;

const scope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;

const world = new World();
const engine = new ECSEngine(world);
engine.addSystem(new MovementSystem());

/** User-defined systems by id */
const userSystems = new Map<string, System>();

let rendererPort: MessagePort | null = null;
let running = true;
let currentFrame = 0;
let pendingStep = false;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function postRenderer(message: EcsToRendererMessage): void {
  if (rendererPort) {
    rendererPort.postMessage(message);
  }
  scope.postMessage(message);
}

function postMain(message: EcsToMainMessage): void {
  scope.postMessage(message);
}

function bootstrapScene(): void {
  const entity = world.createEntity();
  const components = new Map<ComponentConstructor, unknown>();
  components.set(Position as unknown as ComponentConstructor, new Position(0, 0, 0));
  components.set(Velocity as unknown as ComponentConstructor, new Velocity(0.6, 0, 0));
  components.set(Renderable as unknown as ComponentConstructor, new Renderable(1, 1));
  world.addEntityWithComponents(entity, components);
}

function emitDiff(frame: number): void {
  const commands: RendererCommand[] = [];
  const rows = world.query(
    Position as unknown as ComponentConstructor,
    Renderable as unknown as ComponentConstructor,
  );
  for (const row of rows) {
    const position = row.components[0] as Position;
    commands.push({
      op: "upsert",
      entityId: row.entity,
      transform: { x: position.x, y: position.y, z: position.z },
      mesh: { kind: "box", material: "standard", colorHex: "#57b8ff" },
    });
  }
  const message: EcsToRendererDiffMessage = {
    type: "ecs.renderer.diff",
    payload: { frame, commands },
  };
  postRenderer(message);
}

/** Serialize the entire world state into snapshots for the inspector */
function buildStateSnapshot(): EntitySnapshot[] {
  const snapshots: EntitySnapshot[] = [];
  // Collect all entities by querying each registered component
  const entitySeen = new Set<bigint>();
  for (const [, ctor] of componentRegistry) {
    const rows = world.query(ctor);
    for (const row of rows) {
      if (!entitySeen.has(row.entity)) {
        entitySeen.add(row.entity);
        const components: ComponentSnapshot[] = [];
        for (const [typeId, c] of componentRegistry) {
          const comp = world.getComponent(row.entity, c);
          if (comp !== undefined) {
            // Serialize all own enumerable fields
            const fields: Record<string, number | boolean> = {};
            for (const key of Object.keys(comp as object)) {
              const v = (comp as Record<string, unknown>)[key];
              if (typeof v === "number" || typeof v === "boolean") {
                fields[key] = v;
              }
            }
            components.push({ typeId, fields });
          }
        }
        snapshots.push({ entity: row.entity.toString(), components });
      }
    }
  }
  return snapshots;
}

function emitState(): void {
  const entities = buildStateSnapshot();
  postMain({
    type: "ecs.main.state",
    payload: { entities, running, frame: currentFrame },
  });
}

function handleInput(message: MainToEcsInputMessage): void {
  const rows = world.query(Velocity as unknown as ComponentConstructor);
  const first = rows[0];
  if (!first) return;
  const velocity = first.components[0] as Velocity;
  if (message.payload.type === "keyboard.down") {
    const code = message.payload.payload.code as string | undefined;
    if (code === "ArrowLeft" || code === "KeyA") velocity.vx = -0.8;
    if (code === "ArrowRight" || code === "KeyD") velocity.vx = 0.8;
  }
  if (message.payload.type === "keyboard.up") {
    velocity.vx = 0;
  }
}

function runTick(deltaMs: number, frame: number): void {
  currentFrame = frame;
  engine.update(deltaMs / 1000);
  // Also run user systems
  for (const [, sys] of userSystems) {
    sys.update(world, deltaMs / 1000);
  }
  emitDiff(frame);
  emitState();
}

// ─── Message handler ──────────────────────────────────────────────────────────

scope.onmessage = (event: MessageEvent<WorkerInboundMessage>) => {
  const message = event.data;

  if (message.type === "main.ecs.connect_renderer") {
    const port = message.payload.port;
    rendererPort = port;
    port.start();
    return;
  }

  // Editor-specific messages
  if (message.type === "main.ecs.pause") {
    running = false;
    emitState();
    return;
  }
  if (message.type === "main.ecs.resume") {
    running = true;
    emitState();
    return;
  }
  if (message.type === "main.ecs.step") {
    pendingStep = true;
    return;
  }
  if (message.type === "main.ecs.get_state") {
    emitState();
    return;
  }
  if (message.type === "main.ecs.set_component") {
    const { entity, componentTypeId, values } = message.payload;
    const ctor = componentRegistry.get(componentTypeId);
    if (ctor) {
      const existing = world.getComponent(BigInt(entity), ctor);
      if (existing) {
        Object.assign(existing as object, values);
        world.addComponent(BigInt(entity), ctor, existing);
      }
    }
    emitState();
    return;
  }
  if (message.type === "main.ecs.update_system") {
    const { id, code } = message.payload;
    try {
      // Evaluate the transpiled JS and extract the default export (a System class).
      // The code is wrapped so that World and ECSEngine constructors are injected.
      // eslint-disable-next-line no-implied-eval
      const fn = new Function("World", "ECSEngine", code) as (...args: unknown[]) => System;
      const system = fn(World, ECSEngine);
      userSystems.set(id, system);
    } catch (err) {
      console.error("[ecs-worker] Failed to load user system:", err);
    }
    return;
  }
  if (message.type === "main.ecs.remove_system") {
    userSystems.delete(message.payload.id);
    return;
  }

  // Standard runtime messages
  if (!isMainToEcsMessage(message)) {
    return;
  }

  if (message.type === "main.ecs.init") {
    bootstrapScene();
    const initMessage: EcsToRendererInitMessage = {
      type: "ecs.renderer.init",
      payload: { sceneId: message.payload.sceneId },
    };
    postRenderer(initMessage);
    emitState();
    return;
  }

  if (message.type === "main.ecs.input") {
    handleInput(message);
    return;
  }

  if (message.type === "main.ecs.tick") {
    const tick = message as MainToEcsTickMessage;
    if (running || pendingStep) {
      pendingStep = false;
      runTick(tick.payload.deltaMs, tick.payload.frame);
    }
  }
};
