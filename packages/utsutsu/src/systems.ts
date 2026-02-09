/**
 * Base System Classes
 */

import type { System, Entity } from './ecs';

export abstract class BaseSystem implements System {
  abstract requiredComponents: string[];

  abstract update(entities: Entity[], deltaTime: number): void;

  protected filterEntities(entities: Entity[]): Entity[] {
    return entities.filter(entity =>
      this.requiredComponents.every(type => entity.components.has(type))
    );
  }
}
