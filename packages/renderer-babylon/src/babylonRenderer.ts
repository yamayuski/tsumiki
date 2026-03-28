import type { EcsToRendererMessage } from "../../runtime-core/src/index.ts";
import {
  ArcRotateCamera,
  Color3,
  Engine,
  HemisphericLight,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
  type AbstractMesh,
} from "@babylonjs/core";

export interface BabylonRendererBridge {
  setCanvas(canvas: OffscreenCanvas, width: number, height: number): void;
  onEcsMessage(message: EcsToRendererMessage): void;
  dispose(): void;
}

export function createBabylonRendererBridge(): BabylonRendererBridge {
  let canvas: OffscreenCanvas | null = null;
  let engine: Engine | null = null;
  let scene: Scene | null = null;
  let camera: ArcRotateCamera | null = null;
  const meshByEntityId = new Map<string, AbstractMesh>();
  let currentFrame = 0;

  function ensureEngine(): void {
    if (!canvas || engine) {
      return;
    }

    engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: true,
    });

    scene = new Scene(engine);
    scene.clearColor.set(0.03, 0.05, 0.1, 1);

    camera = new ArcRotateCamera(
      "camera",
      Math.PI / 2,
      Math.PI / 3,
      4,
      new Vector3(0, 0, 0),
      scene,
    );
    camera.setTarget(new Vector3(0, 0, 0));

    const light = new HemisphericLight("light", new Vector3(0.5, 1, 0), scene);
    light.intensity = 0.9;

    engine.runRenderLoop(() => {
      if (!scene) {
        return;
      }
      if (camera) {
        const phase = currentFrame * 0.01;
        camera.alpha = Math.PI / 2 + Math.sin(phase) * 0.25;
      }
      scene.render();
    });
  }

  function parseHexColor(input?: string): Color3 {
    if (!input) {
      return new Color3(0.34, 0.72, 1);
    }
    return Color3.FromHexString(input);
  }

  function toEntityKey(entityId: bigint): string {
    return entityId.toString();
  }

  function upsertMesh(
    entityId: bigint,
    transform: { x?: number; y?: number; z?: number },
    colorHex?: string,
  ): void {
    if (!scene) {
      return;
    }

    const key = toEntityKey(entityId);
    let mesh = meshByEntityId.get(key);
    if (!mesh) {
      mesh = MeshBuilder.CreateBox(`entity-${key}`, { size: 0.25 }, scene);
      const material = new StandardMaterial(`mat-${key}`, scene);
      material.diffuseColor = parseHexColor(colorHex);
      mesh.material = material;
      meshByEntityId.set(key, mesh);
    }

    mesh.position.x = transform.x ?? 0;
    mesh.position.y = transform.y ?? 0;
    mesh.position.z = transform.z ?? 0;

    if (mesh.material instanceof StandardMaterial) {
      mesh.material.diffuseColor = parseHexColor(colorHex);
    }
  }

  function deleteMesh(entityId: bigint): void {
    const key = toEntityKey(entityId);
    const mesh = meshByEntityId.get(key);
    if (!mesh) {
      return;
    }
    mesh.dispose(false, true);
    meshByEntityId.delete(key);
  }

  return {
    setCanvas(nextCanvas, width, height) {
      canvas = nextCanvas;
      canvas.width = width;
      canvas.height = height;
      ensureEngine();
    },
    onEcsMessage(message) {
      ensureEngine();
      if (!scene) {
        return;
      }

      if (message.type === "ecs.renderer.init") {
        scene.metadata = {
          sceneId: message.payload.sceneId,
        };
        return;
      }

      if (message.type !== "ecs.renderer.diff") {
        return;
      }
      currentFrame = message.payload.frame;

      for (const command of message.payload.commands) {
        if (command.op === "delete") {
          deleteMesh(command.entityId);
          continue;
        }
        upsertMesh(command.entityId, command.transform ?? {}, command.mesh?.colorHex);
      }
    },
    dispose() {
      for (const mesh of meshByEntityId.values()) {
        mesh.dispose(false, true);
      }
      meshByEntityId.clear();
      scene?.dispose();
      engine?.dispose();
      scene = null;
      engine = null;
      camera = null;
      canvas = null;
    },
  };
}
