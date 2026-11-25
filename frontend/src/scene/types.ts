import type { Asset, Link, SecurityEvent } from '../types/contract';

export interface Inventory {
  assets: Asset[];
  links: Link[];
}

export interface SceneOptions {
  assets: readonly Asset[];
  links?: readonly Link[];
  bloom?: boolean;
  labels?: boolean;
  pixelRatio?: number;
  events?: readonly SecurityEvent[];
  eventIntervalMs?: number;
}

export interface SceneStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  assets: number;
  labelCount: number;
}

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export interface CityScene {
  readonly assetIds: string[];
  start(): void;
  stop(): void;
  dispose(): void;
  resize(): void;
  resetView(): void;
  getStats(): SceneStats;
  pick(clientX: number, clientY: number): string | null;
  focusAsset(id: string, distance?: number): void;
  spawnArc?(event: SecurityEvent): void;
  highlight?(id: string | null): void;
  /**
   * Renders one frame at exactly `width`×`height` (pixel ratio 1) and returns it as a 2D canvas.
   * The renderer has no `preserveDrawingBuffer`, so the frame is copied out in the same task as
   * the render; the live view is restored before returning. Throws if the size exceeds the GPU limit.
   */
  captureFrame?(width: number, height: number): HTMLCanvasElement;
  /** Light print variant; hides hover highlights and the pointer cursor. Off restores the live look. */
  setFigureMode?(on: boolean): void;
  getCameraPose?(): CameraPose;
}
