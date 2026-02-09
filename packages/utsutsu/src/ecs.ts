/**
 * Core ECS Types
 */

export type EntityId = string;
export type ComponentType = string;

export interface Component {
  type: ComponentType;
}

export interface Entity {
  id: EntityId;
  components: Map<ComponentType, Component>;
}

export interface System {
  requiredComponents: ComponentType[];
  update(entities: Entity[], deltaTime: number): void;
}
