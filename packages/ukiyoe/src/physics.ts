/**
 * Physics Integration with Havok
 */

import HavokPhysics from '@babylonjs/havok';
import { HavokPlugin } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';

export class PhysicsEngine {
  private havokPlugin: HavokPlugin | null = null;

  async initialize(scene: Scene): Promise<void> {
    const havokInstance = await HavokPhysics();
    this.havokPlugin = new HavokPlugin(true, havokInstance);
    scene.enablePhysics(undefined, this.havokPlugin);
  }

  isInitialized(): boolean {
    return this.havokPlugin !== null;
  }
}
