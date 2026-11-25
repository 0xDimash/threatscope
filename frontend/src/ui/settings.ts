/**
 * Settings modal. Values persist in localStorage and are applied when a scene
 * is (re)created — changing one rebuilds the current space, which is cheap.
 */
import type { FigureTools } from './figures';

export type SettingsKey = 'bloom' | 'labels';

const PREFIX = 'ts.settings';

export function readSetting(key: SettingsKey, fallback: boolean): boolean {
  const raw = window.localStorage.getItem(`${PREFIX}.${key}`);
  if (raw === null) {
    return fallback;
  }
  return raw === 'true';
}

function writeSetting(key: SettingsKey, value: boolean): void {
  window.localStorage.setItem(`${PREFIX}.${key}`, value ? 'true' : 'false');
}

export interface SettingsCallbacks {
  onChange(): void;
  onClose(): void;
}

const ROWS: Array<{ key: SettingsKey; title: string; description: string }> = [
  { key: 'bloom', title: 'Bloom glow', description: 'Neon glow on emissive devices. Turn off for a flatter, quieter look.' },
  { key: 'labels', title: 'Device labels', description: 'Show the name above every device in the scene.' },
];

function renderFigureSection(modal: HTMLElement, figures: FigureTools): void {
  const section = document.createElement('section');
  section.className = 'modal-section';
  section.innerHTML = `
    <h3>Figures</h3>
    <label class="modal-row">
      <span class="modal-row-text">
        <strong>Figure mode</strong>
        <span>Light print look. Hides the cursor, hover highlights and debug controls. Off restores the live view.</span>
      </span>
      <input type="checkbox" ${figures.isFigureMode() ? 'checked' : ''} />
      <span class="modal-switch" aria-hidden="true"></span>
    </label>
    <div class="export-grid"></div>
    <p class="export-status" role="status" aria-live="polite"></p>
  `;
  const grid = section.querySelector<HTMLElement>('.export-grid')!;
  const status = section.querySelector<HTMLElement>('.export-status')!;

  const actions: Array<{ label: string; run: () => Promise<string> }> = [
    { label: 'Scene PNG · window', run: () => figures.exportScene({ hud: false, size: 'viewport' }) },
    { label: 'Scene PNG · 2400×1350', run: () => figures.exportScene({ hud: false, size: 'print' }) },
    { label: 'Scene + HUD PNG · window', run: () => figures.exportScene({ hud: true, size: 'viewport' }) },
    { label: 'Scene + HUD PNG · 2400×1350', run: () => figures.exportScene({ hud: true, size: 'print' }) },
  ];
  if (figures.hasTimeline()) {
    actions.push({ label: 'Timeline SVG', run: () => figures.exportTimelineSvg() });
  }
  actions.push({ label: 'State JSON', run: () => figures.exportState() });

  const buttons: HTMLButtonElement[] = [];
  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'export-btn';
    button.textContent = action.label;
    button.addEventListener('click', async () => {
      buttons.forEach((b) => (b.disabled = true));
      status.textContent = 'Working…';
      status.classList.remove('error');
      try {
        status.textContent = `Saved ${await action.run()}`;
      } catch (error) {
        status.classList.add('error');
        status.textContent = error instanceof Error ? error.message : 'Export failed.';
      } finally {
        buttons.forEach((b) => (b.disabled = false));
      }
    });
    buttons.push(button);
    grid.append(button);
  }

  const toggle = section.querySelector<HTMLInputElement>('input')!;
  toggle.addEventListener('change', () => figures.setFigureMode(toggle.checked));
  modal.querySelector('.modal-foot')?.before(section);
}

export function openSettings(root: HTMLElement, callbacks: SettingsCallbacks, figures?: FigureTools): void {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="Settings">
      <div class="modal-head">
        <h2>Settings</h2>
        <button type="button" class="modal-close" aria-label="Close">×</button>
      </div>
      <p class="modal-note">Applies immediately — the current space reloads with the new look.</p>
      <div class="modal-rows"></div>
      <p class="modal-foot">ThreatScope 3D · diploma prototype</p>
    </div>
  `;

  const rows = modal.querySelector<HTMLElement>('.modal-rows');
  if (rows) {
    for (const row of ROWS) {
      const enabled = readSetting(row.key, true);
      const label = document.createElement('label');
      label.className = 'modal-row';
      label.innerHTML = `
        <span class="modal-row-text">
          <strong>${row.title}</strong>
          <span>${row.description}</span>
        </span>
        <input type="checkbox" ${enabled ? 'checked' : ''} />
        <span class="modal-switch" aria-hidden="true"></span>
      `;
      const input = label.querySelector<HTMLInputElement>('input');
      input?.addEventListener('change', () => {
        writeSetting(row.key, input.checked);
        callbacks.onChange();
      });
      rows.append(label);
    }
  }

  if (figures) {
    renderFigureSection(modal, figures);
  }

  function close(): void {
    modal.remove();
    callbacks.onClose();
  }
  modal.querySelector<HTMLButtonElement>('.modal-close')?.addEventListener('click', close);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      close();
    }
  });
  document.addEventListener('keydown', function onKey(event) {
    if (event.key === 'Escape') {
      document.removeEventListener('keydown', onKey);
      close();
    }
  });

  root.append(modal);
}
