/**
 * ECS World
 */

import type { Entity, EntityId, System, Component, ComponentType } from './ecs';

export class World {
  private entities = new Map<EntityId, Entity>();
  private systems: System[] = [];

  createEntity(id: EntityId): Entity {
    const entity: Entity = {
      id,
      components: new Map(),
    };
    this.entities.set(id, entity);
    return entity;
  }

  removeEntity(id: EntityId): void {
    this.entities.delete(id);
  }

  getEntity(id: EntityId): Entity | undefined {
    return this.entities.get(id);
  }

  addComponent(entityId: EntityId, component: Component): void {
    const entity = this.entities.get(entityId);
    if (entity) {
      entity.components.set(component.type, component);
    }
  }

  removeComponent(entityId: EntityId, componentType: ComponentType): void {
    const entity = this.entities.get(entityId);
    if (entity) {
      entity.components.delete(componentType);
    }
  }

  addSystem(system: System): void {
    this.systems.push(system);
  }

  update(deltaTime: number): void {
    const entityArray = Array.from(this.entities.values());
    for (const system of this.systems) {
      system.update(entityArray, deltaTime);
    }
  }
}
