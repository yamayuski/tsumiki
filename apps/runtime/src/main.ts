/**
 * Runtime Entry Point
 */

import { World } from '@tsumiki/utsutsu';
import { BabylonRenderer, PhysicsEngine } from '@tsumiki/ukiyoe';

// Get canvas element
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
if (!canvas) {
  throw new Error('Canvas element not found');
}

// Initialize ECS World
const world = new World();

// Initialize renderer
const renderer = new BabylonRenderer(canvas);
const scene = renderer.getScene();

// Initialize physics
const physics = new PhysicsEngine();
physics.initialize(scene).then(() => {
  console.log('Physics initialized');
});

// Create a simple test entity
const entityId = 'test-entity';
const entity = world.createEntity(entityId);
world.addComponent(entityId, {
  type: 'transform',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
});

console.log('Runtime initialized');
console.log('World:', world);
console.log('Renderer:', renderer);

// Start render loop
renderer.start();

// Game loop
let lastTime = performance.now();
const update = () => {
  const currentTime = performance.now();
  const deltaTime = (currentTime - lastTime) / 1000;
  lastTime = currentTime;

  // Update ECS world
  world.update(deltaTime);

  // Sync with renderer
  renderer.syncWithWorld(world);

  requestAnimationFrame(update);
};
update();
