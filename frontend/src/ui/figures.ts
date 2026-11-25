/**
 * Thesis figure export: scene PNG, scene + HUD PNG, timeline SVG, state JSON, and figure mode.
 *
 * Everything is built from the live app — no new dependencies. The scene is rendered by the
 * scene itself (`captureFrame`), the HUD is painted on top by `domPainter`, and the files are
 * handed to the browser as downloads.
 */
import { fetchAssetRisk, fetchState, type AggregateState, type RiskState } from '../data';
import type { CityScene } from '../scene/types';
import { paintDom } from './domPainter';
import { readSetting } from './settings';

/** Fixed print size: 16:9 at pixel ratio 1. */
export const PRINT_SIZE = { width: 2400, height: 1350 } as const;
/**
 * The HUD is laid out for a 1280×720 window when exporting at the fixed size, so the panels sit
 * where they would on a laptop screen whatever the real window looks like (scale 1.875).
 */
const PRINT_HUD_VIEWPORT = { width: 1280, height: 720 } as const;
const MAX_VIEWPORT_PIXEL_RATIO = 2;

export type SceneExportSize = 'viewport' | 'print';

export interface FigureDeps {
  getScene(): CityScene | null;
  getSpaceId(): string | null;
  getHudHost(): HTMLElement | null;
  getSelectedAssetId(): string | null;
  /** Replay position for the state file. Not available until the replay controls exist. */
  getReplay?(): unknown;
  /** The timeline panel's root `<svg>`, or null when there is no timeline. */
  getTimelineSvg?(): SVGSVGElement | null;
}

export interface FigureTools {
  isFigureMode(): boolean;
  setFigureMode(on: boolean): void;
  hasTimeline(): boolean;
  /** Each export resolves with the downloaded file name. */
  exportScene(options: { hud: boolean; size: SceneExportSize }): Promise<string>;
  exportTimelineSvg(): Promise<string>;
  exportState(): Promise<string>;
}

export function figureFileName(space: string, view: string, extension: string, now = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const safeSpace = space.replace(/[^\w-]+/g, '-') || 'space';
  return `threatscope-${safeSpace}-${view}-${stamp}.${extension}`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed.'))), 'image/png');
  });
}

/** HUD parts that are controls or debug aids, not part of a figure. */
function isChrome(element: HTMLElement): boolean {
  return element.classList.contains('feed-control') || element.classList.contains('hud-toggle');
}

/** Lays #hud out as if the window were `viewport` CSS px, runs `fn`, and puts the styles back. */
function withVirtualViewport<T>(host: HTMLElement, viewport: { width: number; height: number }, fn: () => T): T {
  const previous = host.getAttribute('style');
  // A transform makes `position: fixed` children resolve against the host instead of the window.
  host.style.cssText += `;inset:auto;top:0;left:0;right:auto;bottom:auto;width:${viewport.width}px;height:${viewport.height}px;transform:translateZ(0)`;
  try {
    return fn();
  } finally {
    if (previous === null) host.removeAttribute('style');
    else host.setAttribute('style', previous);
  }
}

const SVG_PRESENTATION = [
  'fill', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width', 'stroke-dasharray', 'stroke-linecap',
  'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'text-anchor',
  'dominant-baseline', 'text-transform',
] as const;

/** A standalone copy of an on-screen `<svg>`: namespace, size, and styles inlined from CSS. */
export function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const box = svg.getBoundingClientRect();
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (!clone.getAttribute('width')) clone.setAttribute('width', String(Math.round(box.width)));
  if (!clone.getAttribute('height')) clone.setAttribute('height', String(Math.round(box.height)));
  if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${Math.round(box.width)} ${Math.round(box.height)}`);

  const source = [svg, ...Array.from(svg.querySelectorAll('*'))];
  const target = [clone, ...Array.from(clone.querySelectorAll('*'))];
  source.forEach((original, index) => {
    const copy = target[index] as SVGElement | undefined;
    if (!copy || !(original instanceof SVGElement)) return;
    const computed = getComputedStyle(original);
    for (const property of SVG_PRESENTATION) {
      const value = computed.getPropertyValue(property);
      if (value) copy.style.setProperty(property, value);
    }
    copy.removeAttribute('class');
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}\n`;
}

export function createFigureTools(deps: FigureDeps): FigureTools {
  let figureMode = false;

  function spaceName(): string {
    return deps.getSpaceId() ?? 'space';
  }

  function applyFigureMode(): void {
    document.body.classList.toggle('figure-mode', figureMode);
    deps.getScene()?.setFigureMode?.(figureMode);
  }

  return {
    isFigureMode: () => figureMode,
    setFigureMode(on: boolean): void {
      figureMode = on;
      applyFigureMode();
    },
    hasTimeline: () => (deps.getTimelineSvg?.() ?? null) !== null,

    async exportScene({ hud, size }): Promise<string> {
      const scene = deps.getScene();
      if (!scene?.captureFrame) throw new Error('Open a room first — there is no scene to export.');
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_VIEWPORT_PIXEL_RATIO);
      const pixels =
        size === 'print'
          ? { width: PRINT_SIZE.width, height: PRINT_SIZE.height }
          : { width: Math.round(viewport.width * ratio), height: Math.round(viewport.height * ratio) };

      // Render and copy in one synchronous run: the WebGL buffer is gone after this task.
      const frame = scene.captureFrame(pixels.width, pixels.height);
      const hudHost = deps.getHudHost();
      if (hud && hudHost) {
        const ctx = frame.getContext('2d');
        if (!ctx) throw new Error('2D canvas is not available.');
        const paint = (cssWidth: number): void =>
          paintDom(ctx, hudHost, { left: 0, top: 0, scale: pixels.width / cssWidth, skip: isChrome });
        if (size === 'print') {
          withVirtualViewport(hudHost, PRINT_HUD_VIEWPORT, () => paint(PRINT_HUD_VIEWPORT.width));
        } else {
          paint(viewport.width);
        }
      }

      const view = `${hud ? 'scene-hud' : 'scene'}${size === 'print' ? `-${PRINT_SIZE.width}x${PRINT_SIZE.height}` : ''}`;
      const fileName = figureFileName(spaceName(), view, 'png');
      downloadBlob(await canvasToBlob(frame), fileName);
      return fileName;
    },

    async exportTimelineSvg(): Promise<string> {
      const svg = deps.getTimelineSvg?.() ?? null;
      if (!svg) throw new Error('There is no timeline to export.');
      const fileName = figureFileName(spaceName(), 'timeline', 'svg');
      downloadBlob(new Blob([serializeSvg(svg)], { type: 'image/svg+xml' }), fileName);
      return fileName;
    },

    async exportState(): Promise<string> {
      const errors: string[] = [];
      let state: AggregateState | null = null;
      try {
        state = await fetchState();
      } catch (error) {
        errors.push(`GET /api/state: ${error instanceof Error ? error.message : String(error)}`);
      }

      const assetId = deps.getSelectedAssetId();
      let risk: RiskState | null = null;
      if (assetId) {
        try {
          risk = await fetchAssetRisk(assetId);
        } catch (error) {
          errors.push(`GET /api/assets/${assetId}/risk: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const payload = {
        schema: 'threatscope.figure-state/1',
        exported_at: new Date().toISOString(),
        space: spaceName(),
        figure_mode: figureMode,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          device_pixel_ratio: window.devicePixelRatio || 1,
        },
        settings: { bloom: readSetting('bloom', true), labels: readSetting('labels', true) },
        camera: deps.getScene()?.getCameraPose?.() ?? null,
        api_state: state,
        selected_asset: assetId ? { asset_id: assetId, risk } : null,
        replay: deps.getReplay?.() ?? null,
        errors,
      };
      const fileName = figureFileName(spaceName(), 'state', 'json');
      downloadBlob(new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' }), fileName);
      return fileName;
    },
  };
}
