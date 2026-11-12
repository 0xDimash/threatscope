import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  FogExp2,
  Points,
  PointsMaterial,
  type Scene,
  type WebGLRenderer,
} from 'three';

export interface EnvironmentRig {
  stars: Points;
  update(time: number, delta: number): void;
  dispose(): void;
}

function createStars(): Points {
  const count = 500;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    const radius = 110 + Math.random() * 140;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi) * 0.5;
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    const brightness = 0.12 + Math.random() * 0.35;
    colors[i * 3] = brightness;
    colors[i * 3 + 1] = brightness;
    colors[i * 3 + 2] = brightness;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));

  const points = new Points(
    geometry,
    new PointsMaterial({
      size: 0.4,
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      blending: AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  points.name = 'stars';
  return points;
}

export function createEnvironment(_renderer: WebGLRenderer, scene: Scene): EnvironmentRig {
  scene.background = new Color(0x000000);
  scene.fog = new FogExp2(0x000000, 0.0035);

  const stars = createStars();
  scene.add(stars);

  return {
    stars,
    update(_time: number, delta: number): void {
      stars.rotation.y += delta * 0.008;
    },
    dispose(): void {
      scene.remove(stars);
      stars.geometry.dispose();
      (stars.material as PointsMaterial).dispose();
      scene.environment = null;
    },
  };
}
