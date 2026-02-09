/**
 * Builder Types
 */

import type { Entity } from '@tsumiki/utsutsu';

export interface SceneData {
  entities: Entity[];
  metadata: {
    name: string;
    version: string;
    created: string;
  };
}

export interface BuildOptions {
  optimize?: boolean;
  minify?: boolean;
  sourcemap?: boolean;
}

export interface BuildResult {
  success: boolean;
  outputPath?: string;
  errors?: string[];
}
