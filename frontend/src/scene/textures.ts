import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';

const GLOW_SIZE = 256;

export function createGlowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = GLOW_SIZE;
  canvas.height = GLOW_SIZE;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(
      GLOW_SIZE / 2,
      GLOW_SIZE / 2,
      0,
      GLOW_SIZE / 2,
      GLOW_SIZE / 2,
      GLOW_SIZE / 2,
    );
    gradient.addColorStop(0, 'rgba(47,129,247,0.85)');
    gradient.addColorStop(0.35, 'rgba(47,129,247,0.28)');
    gradient.addColorStop(1, 'rgba(47,129,247,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function createLabelTexture(text: string, color: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = 'bold 38px "SF Mono", Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = color;
    ctx.fillText(text, 256, 48);
  }
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function createGroundTexture(size = 1024): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#04080f';
    ctx.fillRect(0, 0, size, size);

    const glow = ctx.createRadialGradient(
      size / 2,
      size * 0.46,
      size * 0.04,
      size / 2,
      size * 0.46,
      size * 0.62,
    );
    glow.addColorStop(0, 'rgba(22,64,116,0.38)');
    glow.addColorStop(0.6, 'rgba(10,32,60,0.18)');
    glow.addColorStop(1, 'rgba(4,8,15,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(47,129,247,0.10)';
    ctx.lineWidth = 1;
    const step = size / 28;
    for (let x = 0; x <= size; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
    for (let y = 0; y <= size; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(47,129,247,0.07)';
    for (let i = 1; i <= 7; i += 1) {
      ctx.beginPath();
      ctx.arc(size / 2, size * 0.46, (size * 0.055 * i) / 1.6, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(90,140,200,0.045)';
    ctx.font = `bold ${Math.round(size * 0.055)}px "SF Mono", Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('ALMATY', size / 2, size * 0.52);

    const vignette = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.3,
      size / 2,
      size / 2,
      size * 0.72,
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
