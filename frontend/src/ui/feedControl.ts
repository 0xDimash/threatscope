import { apiBase } from '../data/api';

const RATES = [0, 1, 2, 5, 10];

/**
 * Dev-only demo control: sets how many synthetic threats the backend generates per second.
 * Renders nothing unless the backend exposes `/api/demo/feed` (DEMO_FEED=1).
 */
export function mountFeedControl(host: HTMLElement): void {
  const base = `${apiBase()}/api/demo/feed`;
  // the room can be rebuilt (hashchange, settings change); keep one control
  host.querySelector('.feed-control')?.remove();
  const el = document.createElement('div');
  el.className = 'feed-control';
  el.innerHTML = `
    <span class="feed-label">threats</span>
    ${RATES.map((r) => `<button type="button" data-rate="${r}">${r === 0 ? 'off' : r}</button>`).join('')}
    <span class="feed-unit">/s</span>
  `;
  host.appendChild(el);

  const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>('button'));

  const paint = (rate: number): void => {
    buttons.forEach((b) => b.classList.toggle('active', Number(b.dataset.rate) === rate));
  };

  fetch(base)
    .then((r) => (r.ok ? r.json() : null))
    .then((status: { rate: number } | null) => {
      if (!status) return;
      el.classList.add('ready');
      paint(status.rate);
    })
    .catch(() => {});

  buttons.forEach((b) => {
    b.addEventListener('click', () => {
      const rate = Number(b.dataset.rate);
      fetch(base, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rate }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((status: { rate: number } | null) => {
          if (status) paint(status.rate);
        })
        .catch(() => {});
    });
  });
}
