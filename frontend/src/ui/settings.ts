/**
 * Settings modal. Values persist in localStorage and are applied when a scene
 * is (re)created — changing one rebuilds the current space, which is cheap.
 */
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

export function openSettings(root: HTMLElement, callbacks: SettingsCallbacks): void {
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
