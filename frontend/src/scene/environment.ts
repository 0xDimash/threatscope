import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  EquirectangularReflectionMapping,
  FogExp2,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { createGlowTexture } from './textures';

export interface EnvironmentRig {
  stars: Points;
  update(time: number, delta: number): void;
  dispose(): void;
}

function createSkyTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#0a1830');
    gradient.addColorStop(0.45, '#0d2a4a');
    gradient.addColorStop(0.55, '#081420');
    gradient.addColorStop(1, '#04080f');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 256);

    const bars: Array<[number, number, number, number, string]> = [
      [30, 70, 120, 14, '#1c6fd8'],
      [190, 46, 90, 10, '#12c8e0'],
      [330, 80, 130, 12, '#8a2be2'],
      [90, 130, 150, 8, '#e04a7a'],
      [420, 120, 80, 10, '#1c6fd8'],
    ];
    for (const [x, y, w, h, color] of bars) {
      const bar = ctx.createLinearGradient(x, 0, x + w, 0);
      bar.addColorStop(0, 'rgba(255,255,255,0)');
      bar.addColorStop(0.5, color);
      bar.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = bar;
      ctx.fillRect(x, y, w, h);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function createStars(): Points {
  const count = 1400;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const tints = [
    new Color(0x3a6ea8),
    new Color(0x7fb2e8),
    new Color(0x2a4a75),
    new Color(0xa8c8e8),
  ];

  for (let i = 0; i < count; i += 1) {
    const radius = 90 + Math.random() * 120;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi) * 0.6;
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    const tint = tints[Math.floor(Math.random() * tints.length)];
    const brightness = 0.25 + Math.random() * 0.75;
    colors[i * 3] = tint.r * brightness;
    colors[i * 3 + 1] = tint.g * brightness;
    colors[i * 3 + 2] = tint.b * brightness;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));

  const points = new Points(
    geometry,
    new PointsMaterial({
      size: 0.55,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      blending: AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  points.name = 'stars';
  return points;
}

export function createEnvironment(renderer: WebGLRenderer, scene: Scene): EnvironmentRig {
  scene.background = new Color(0x03060d);
  scene.fog = new FogExp2(0x03060d, 0.0088);

  const skyTexture = createSkyTexture();
  const pmrem = new PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const environmentTarget = pmrem.fromEquirectangular(skyTexture);
  scene.environment = environmentTarget.texture;
  skyTexture.dispose();
  pmrem.dispose();

  const stars = createStars();
  scene.add(stars);

  const haze = new Mesh(
    new PlaneGeometry(300, 300),
    new MeshBasicMaterial({
      map: createGlowTexture(),
      transparent: true,
      opacity: 0.28,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  haze.name = 'haze';
  haze.position.set(0, 8, -95);
  scene.add(haze);

  return {
    stars,
    update(_time: number, delta: number): void {
      stars.rotation.y += delta * 0.012;
    },
    dispose(): void {
      scene.remove(stars, haze);
      stars.geometry.dispose();
      (stars.material as PointsMaterial).dispose();
      haze.geometry.dispose();
      (haze.material as MeshBasicMaterial).dispose();
      environmentTarget.dispose();
      scene.environment = null;
    },
  };
}
