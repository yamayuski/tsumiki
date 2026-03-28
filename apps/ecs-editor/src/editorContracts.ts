/**
 * Extended message contracts for the ECS editor.
 * These supplement the runtime-core contracts with editor-specific messages.
 */

/** Pause the ECS simulation */
export interface MainToEcsPauseMessage {
  type: "main.ecs.pause";
}

/** Resume the ECS simulation */
export interface MainToEcsResumeMessage {
  type: "main.ecs.resume";
}

/** Step one tick (useful when paused) */
export interface MainToEcsStepMessage {
  type: "main.ecs.step";
}

/** Request current world state (entities + components) */
export interface MainToEcsGetStateMessage {
  type: "main.ecs.get_state";
}

/** Set a component value on an entity */
export interface MainToEcsSetComponentMessage {
  type: "main.ecs.set_component";
  payload: {
    entity: string; // bigint as string
    componentTypeId: string;
    values: Record<string, number | boolean>;
  };
}

/** Update (replace) a user-defined system script */
export interface MainToEcsUpdateSystemMessage {
  type: "main.ecs.update_system";
  payload: {
    id: string;
    code: string; // transpiled JavaScript
  };
}

/** Remove a user-defined system script */
export interface MainToEcsRemoveSystemMessage {
  type: "main.ecs.remove_system";
  payload: {
    id: string;
  };
}

export type MainToEcsEditorMessage =
  | MainToEcsPauseMessage
  | MainToEcsResumeMessage
  | MainToEcsStepMessage
  | MainToEcsGetStateMessage
  | MainToEcsSetComponentMessage
  | MainToEcsUpdateSystemMessage
  | MainToEcsRemoveSystemMessage;

/** Serialized component snapshot */
export interface ComponentSnapshot {
  typeId: string;
  fields: Record<string, number | boolean>;
}

/** Serialized entity snapshot */
export interface EntitySnapshot {
  entity: string; // bigint as string
  components: ComponentSnapshot[];
}

/** World state snapshot sent from the ECS worker to the main thread */
export interface EcsToMainStateMessage {
  type: "ecs.main.state";
  payload: {
    entities: EntitySnapshot[];
    running: boolean;
    frame: number;
  };
}

export type EcsToMainMessage = EcsToMainStateMessage;
