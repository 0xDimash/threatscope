/**
 * Small non-blocking message strip for API outcomes (offline cache, 404/409/422).
 * Lives above the app so it stays visible after a modal closes; removes itself.
 */
const LIFETIME_MS = 8000;

export function showNotice(message: string): void {
  const host = document.getElementById('modal-root') ?? document.body;
  let region = host.querySelector<HTMLElement>('.app-notice');
  if (!region) {
    region = document.createElement('div');
    region.className = 'app-notice';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.style.cssText =
      'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:60;' +
      'display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none;';
    host.append(region);
  }

  const item = document.createElement('div');
  item.style.cssText =
    'max-width:min(560px,92vw);padding:10px 14px;border:1px solid rgba(255,255,255,0.4);' +
    'background:rgba(0,0,0,0.92);color:#fff;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;' +
    'text-transform:uppercase;letter-spacing:0.06em;';
  item.textContent = message;
  region.append(item);

  const strip = region;
  window.setTimeout(() => {
    item.remove();
    if (strip.children.length === 0) strip.remove();
  }, LIFETIME_MS);
}
