import { PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface CameraRig {
  camera: PerspectiveCamera;
  controls: OrbitControls;
  resize(width: number, height: number): void;
  focus(target: Vector3, distance: number): void;
  reset(): void;
  dispose(): void;
}

const INITIAL_POSITION = new Vector3(0, 38, 66);
const INITIAL_TARGET = new Vector3(0, 1, -2);

export function createCameraRig(canvas: HTMLCanvasElement, aspect: number): CameraRig {
  const camera = new PerspectiveCamera(58, aspect, 0.1, 400);
  camera.position.copy(INITIAL_POSITION);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enableZoom = true;
  controls.zoomSpeed = 0.8;
  controls.rotateSpeed = 0.55;
  controls.panSpeed = 0.6;
  controls.minDistance = 14;
  controls.maxDistance = 150;
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.minPolarAngle = Math.PI * 0.06;
  controls.target.copy(INITIAL_TARGET);
  controls.update();

  return {
    camera,
    controls,
    resize(width: number, height: number): void {
      camera.aspect = height > 0 ? width / height : 1;
      camera.updateProjectionMatrix();
    },
    focus(target: Vector3, distance: number): void {
      const direction = new Vector3(0.25, 0.5, 1).normalize();
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(direction, distance);
      controls.update();
    },
    reset(): void {
      camera.position.copy(INITIAL_POSITION);
      controls.target.copy(INITIAL_TARGET);
      controls.update();
    },
    dispose(): void {
      controls.dispose();
    },
  };
}
