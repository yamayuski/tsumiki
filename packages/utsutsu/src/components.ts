/**
 * Basic 3D Components
 */

import type { Component } from './ecs';

export interface TransformComponent extends Component {
  type: 'transform';
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}

export interface MeshComponent extends Component {
  type: 'mesh';
  meshId: string;
}

export interface CameraComponent extends Component {
  type: 'camera';
  fov: number;
  near: number;
  far: number;
}
