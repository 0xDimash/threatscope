/**
 * Paints a small DOM subtree (the HUD panels) onto a 2D canvas.
 *
 * This is deliberately not a general html2canvas: it handles exactly what the HUD uses —
 * backgrounds, borders with a radius, overflow clipping, opacity and single-line or wrapped text —
 * by reading layout and computed styles straight from the live DOM. Anything it does not know
 * (box shadows, gradients, backdrop blur, images) is skipped rather than guessed.
 */
export interface PaintOptions {
  /** Viewport position of the canvas' top-left corner, in CSS px. */
  left: number;
  top: number;
  /** Canvas pixels per CSS px. */
  scale: number;
  /** Return true to leave an element (and its subtree) out. */
  skip?(element: HTMLElement): boolean;
}

export function paintDom(ctx: CanvasRenderingContext2D, root: HTMLElement, options: PaintOptions): void {
  ctx.save();
  paintElement(ctx, root, options, 1);
  ctx.restore();
}

function px(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function isTransparent(color: string): boolean {
  // Only an explicit alpha of 0 counts: `rgb(0, 0, 0)` is opaque black.
  return color === 'transparent' || /^rgba\(.*,\s*0(?:\.0+)?\)$/.test(color) || /\/\s*0(?:\.0+)?\s*\)$/.test(color);
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function paintElement(ctx: CanvasRenderingContext2D, el: HTMLElement, o: PaintOptions, parentAlpha: number): void {
  if (el.hidden || o.skip?.(el)) return;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return;
  const alpha = parentAlpha * (parseFloat(cs.opacity) || 0);
  if (alpha <= 0.01) return;

  const rect = el.getBoundingClientRect();
  const x = (rect.left - o.left) * o.scale;
  const y = (rect.top - o.top) * o.scale;
  const w = rect.width * o.scale;
  const h = rect.height * o.scale;
  const radius = px(cs.borderTopLeftRadius) * o.scale;

  ctx.save();
  ctx.globalAlpha = alpha;

  if (w > 0 && h > 0) {
    if (!isTransparent(cs.backgroundColor)) {
      ctx.fillStyle = cs.backgroundColor;
      roundedRect(ctx, x, y, w, h, radius);
      ctx.fill();
    }
    paintBorders(ctx, cs, x, y, w, h, radius, o.scale);
  }

  if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
    roundedRect(ctx, x, y, w, h, radius);
    ctx.clip();
  }

  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      paintText(ctx, child as Text, el, cs, o);
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      paintElement(ctx, child as HTMLElement, o, alpha);
    }
  }
  ctx.restore();
}

function paintBorders(
  ctx: CanvasRenderingContext2D,
  cs: CSSStyleDeclaration,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  scale: number,
): void {
  const sides = [
    { width: px(cs.borderTopWidth) * scale, color: cs.borderTopColor, style: cs.borderTopStyle },
    { width: px(cs.borderRightWidth) * scale, color: cs.borderRightColor, style: cs.borderRightStyle },
    { width: px(cs.borderBottomWidth) * scale, color: cs.borderBottomColor, style: cs.borderBottomStyle },
    { width: px(cs.borderLeftWidth) * scale, color: cs.borderLeftColor, style: cs.borderLeftStyle },
  ].map((side) => ({ ...side, visible: side.width > 0 && side.style !== 'none' && !isTransparent(side.color) }));
  if (!sides.some((side) => side.visible)) return;

  const [top, right, bottom, left] = sides;
  const uniform = sides.every((side) => side.visible && side.width === top.width && side.color === top.color);
  if (uniform && radius > 0) {
    ctx.strokeStyle = top.color;
    ctx.lineWidth = top.width;
    roundedRect(ctx, x + top.width / 2, y + top.width / 2, w - top.width, h - top.width, radius - top.width / 2);
    ctx.stroke();
    return;
  }
  if (top.visible) { ctx.fillStyle = top.color; ctx.fillRect(x, y, w, top.width); }
  if (bottom.visible) { ctx.fillStyle = bottom.color; ctx.fillRect(x, y + h - bottom.width, w, bottom.width); }
  if (left.visible) { ctx.fillStyle = left.color; ctx.fillRect(x, y, left.width, h); }
  if (right.visible) { ctx.fillStyle = right.color; ctx.fillRect(x + w - right.width, y, right.width, h); }
}

function transformText(text: string, mode: string): string {
  if (mode === 'uppercase') return text.toUpperCase();
  if (mode === 'lowercase') return text.toLowerCase();
  return text;
}

/**
 * Text is drawn one character at a time at the position the browser laid it out, so wrapping,
 * letter-spacing and ellipsis come from the real layout instead of being re-implemented.
 */
function paintText(
  ctx: CanvasRenderingContext2D,
  node: Text,
  parent: HTMLElement,
  cs: CSSStyleDeclaration,
  o: PaintOptions,
): void {
  const raw = node.data;
  if (raw.trim().length === 0) return;

  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${px(cs.fontSize) * o.scale}px ${cs.fontFamily}`;
  ctx.fillStyle = cs.color;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const metrics = ctx.measureText('M');
  const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;

  const ellipsis =
    cs.textOverflow === 'ellipsis' && parent.scrollWidth > parent.clientWidth + 1
      ? { limit: parent.getBoundingClientRect().right - px(cs.paddingRight), width: ctx.measureText('…').width / o.scale }
      : null;

  const range = document.createRange();
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (/\s/.test(char)) continue;
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    const box = range.getClientRects()[0];
    if (!box) continue;
    if (ellipsis && box.right > ellipsis.limit - ellipsis.width) {
      ctx.fillText('…', (box.left - o.left) * o.scale, (box.top - o.top) * o.scale + ascent);
      break;
    }
    ctx.fillText(transformText(char, cs.textTransform), (box.left - o.left) * o.scale, (box.top - o.top) * o.scale + ascent);
  }
}
