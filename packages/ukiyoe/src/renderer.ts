/**
 * Babylon.js Renderer
 */

import { Engine, Scene } from '@babylonjs/core';
import type { World } from '@tsumiki/utsutsu';

export class BabylonRenderer {
  private engine: Engine;
  private scene: Scene;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true);
    this.scene = new Scene(this.engine);
  }

  getScene(): Scene {
    return this.scene;
  }

  getEngine(): Engine {
    return this.engine;
  }

  start(): void {
    this.engine.runRenderLoop(() => {
      this.scene.render();
    });
  }

  stop(): void {
    this.engine.stopRenderLoop();
  }

  dispose(): void {
    this.scene.dispose();
    this.engine.dispose();
  }

  syncWithWorld(_world: World): void {
    // Sync ECS world entities with Babylon.js scene
    // This will be implemented to bridge utsutsu and Babylon.js
  }
}
