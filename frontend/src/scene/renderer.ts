import {
  ACESFilmicToneMapping,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
  type PerspectiveCamera,
  type Scene,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

export interface RendererOptions {
  pixelRatio?: number;
  bloom?: boolean;
  bloomStrength?: number;
  exposure?: number;
}

export interface RenderContext {
  renderer: WebGLRenderer;
  composer: EffectComposer;
  bloom: UnrealBloomPass | null;
  render(): void;
  setSize(width: number, height: number): void;
  dispose(): void;
}

export function createRenderer(canvas: HTMLCanvasElement, options: RendererOptions = {}): WebGLRenderer {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    stencil: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, options.pixelRatio ?? 1.75));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = options.exposure ?? 1.0;
  renderer.setClearColor(0x000000, 1);
  return renderer;
}

export function createRenderContext(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  options: RendererOptions = {},
): RenderContext {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  let bloom: UnrealBloomPass | null = null;
  if (options.bloom ?? true) {
    bloom = new UnrealBloomPass(
      new Vector2(512, 512),
      options.bloomStrength ?? 0.55,
      0.5,
      0.72,
    );
    composer.addPass(bloom);
  }

  const fxaa = new ShaderPass(FXAAShader);
  composer.addPass(fxaa);
  composer.addPass(new OutputPass());

  const context: RenderContext = {
    renderer,
    composer,
    bloom,
    render(): void {
      composer.render();
    },
    setSize(width: number, height: number): void {
      renderer.setSize(width, height, false);
      composer.setSize(width, height);
      const ratio = renderer.getPixelRatio();
      fxaa.material.uniforms.resolution.value.set(1 / (width * ratio), 1 / (height * ratio));
    },
    dispose(): void {
      composer.dispose();
      fxaa.dispose();
      bloom?.dispose();
      renderer.dispose();
    },
  };

  return context;
}
