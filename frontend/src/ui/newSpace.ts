/**
 * Space editor dialog: name the room, then place components on a grid and bind them to
 * inventory assets. Used both to create a space and to edit one — same layout, prefilled from
 * the stored components. A component here is a 3D device the room scene renders.
 * Persistence (backend first, local cache second) lives in `spaces.ts`.
 */
import { fetchInventory } from '../data';
import { COMPONENT_KINDS, type ComponentKind, type RoomComponent } from '../scene/room';
import { showNotice } from './notice';
import { MAX_TITLE, createSpace, updateSpace, type SpaceDef } from './spaces';

export interface SpaceEditorCallbacks {
  /** Present when editing an existing space. */
  space?: SpaceDef;
  onSaved(spaceId: string): void;
}

const COLS = 8;
const ROWS = 6;
const ROOM_W = 12;
const ROOM_D = 10;

const KINDS = Object.keys(COMPONENT_KINDS) as ComponentKind[];

interface Placed {
  /** Stable component id; survives edits and is what `/api/spaces/{id}/risk` keys on. */
  id: string;
  kind: ComponentKind;
  asset_id: string | null;
}

let sequence = 0;
function nextComponentId(): string {
  sequence += 1;
  return `comp-${Date.now().toString(36)}-${sequence}`;
}

/** Grid slot → room coordinates, so the scene and the editor agree. */
function slotPosition(index: number): { x: number; z: number } {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const cellW = ROOM_W / COLS;
  const cellD = ROOM_D / ROWS;
  return {
    x: Number((-ROOM_W / 2 + cellW * (col + 0.5)).toFixed(2)),
    z: Number((-ROOM_D / 2 + cellD * (row + 0.5)).toFixed(2)),
  };
}

/** Nearest grid slot for stored coordinates; null when the point is outside the room. */
function slotForPosition(x: number, z: number): number | null {
  const col = Math.round((x + ROOM_W / 2) / (ROOM_W / COLS) - 0.5);
  const row = Math.round((z + ROOM_D / 2) / (ROOM_D / ROWS) - 0.5);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
  return row * COLS + col;
}

const START: Array<[number, ComponentKind]> = [
  [11, 'rack'],
  [12, 'pc'],
  [19, 'pc'],
  [20, 'nas'],
];

export function openSpaceEditor(root: HTMLElement, callbacks: SpaceEditorCallbacks): void {
  const editing = callbacks.space;
  const placed = new Map<number, Placed>(
    editing
      ? (editing.components ?? [])
          .map((component) => {
            const slot = slotForPosition(component.x, component.z);
            if (slot === null) return null;
            return [
              slot,
              { id: component.id, kind: component.kind, asset_id: component.asset_id ?? null },
            ] as [number, Placed];
          })
          .filter((entry): entry is [number, Placed] => entry !== null)
      : START.map(([slot, kind]) => [slot, { id: nextComponentId(), kind, asset_id: null }] as [number, Placed]),
  );
  let brush: ComponentKind = 'pc';
  let selected: number | null = null;

  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal wide" role="dialog" aria-modal="true" aria-label="${editing ? 'Edit space' : 'New space'}">
      <div class="modal-head">
        <h2>${editing ? 'Edit space' : 'New space'}</h2>
        <button type="button" class="modal-close" aria-label="Close">×</button>
      </div>
      <p class="modal-note">${
        editing
          ? 'Rename the room, rearrange its devices or rebind them to assets.'
          : 'Build a room from scratch: pick a component, click a slot, then bind it to an asset.'
      }</p>

      <label class="field">
        <span class="field-label">Name</span>
        <input class="field-input" type="text" maxlength="${MAX_TITLE}" placeholder="e.g. HQ · floor 3" />
      </label>

      <div class="builder">
        <div class="builder-palette">
          <span class="field-label">Components</span>
          <div class="palette" role="group" aria-label="Components"></div>
          <button type="button" class="btn-ghost builder-clear">Clear</button>
          <p class="builder-hint">Click a placed component to select it and bind an asset.</p>
        </div>
        <div class="builder-stage">
          <div class="builder-grid" role="group" aria-label="Room layout"></div>
          <div class="builder-count">0 placed</div>
          <label class="field">
            <span class="field-label">Asset binding</span>
            <select class="field-input builder-asset" disabled></select>
          </label>
          <button type="button" class="btn-ghost builder-remove" disabled>Remove selected</button>
        </div>
      </div>

      <div class="modal-error" role="alert" hidden></div>
      <div class="modal-actions">
        <button type="button" class="btn-ghost" data-action="cancel">Cancel</button>
        <button type="button" class="btn-solid" data-action="create" disabled>${
          editing ? 'Save changes' : 'Create space'
        }</button>
      </div>
    </div>
  `;
  root.append(modal);

  const input = modal.querySelector<HTMLInputElement>('.field-input')!;
  const error = modal.querySelector<HTMLElement>('.modal-error')!;
  const createBtn = modal.querySelector<HTMLButtonElement>('[data-action="create"]')!;
  const palette = modal.querySelector<HTMLElement>('.palette')!;
  const grid = modal.querySelector<HTMLElement>('.builder-grid')!;
  const count = modal.querySelector<HTMLElement>('.builder-count')!;
  const assetSelect = modal.querySelector<HTMLSelectElement>('.builder-asset')!;
  const removeBtn = modal.querySelector<HTMLButtonElement>('.builder-remove')!;

  if (editing) {
    input.value = editing.title;
    createBtn.disabled = false;
  }

  const close = (): void => {
    modal.remove();
    document.removeEventListener('keydown', onKey);
  };
  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKey);

  // palette
  const brushes = new Map<ComponentKind, HTMLButtonElement>();
  for (const kind of KINDS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'palette-item';
    button.dataset.kind = kind;
    button.textContent = COMPONENT_KINDS[kind].label;
    button.addEventListener('click', () => {
      brush = kind;
      brushes.forEach((b, k) => b.classList.toggle('active', k === kind));
    });
    brushes.set(kind, button);
    palette.append(button);
  }
  brushes.get('pc')?.classList.add('active');

  // asset binding
  const unboundOption = document.createElement('option');
  unboundOption.value = '';
  unboundOption.textContent = 'Not bound to an asset';
  assetSelect.append(unboundOption);

  const hasAssetOption = (id: string): boolean =>
    [...assetSelect.options].some((option) => option.value === id);
  const addAssetOption = (id: string, label: string): void => {
    if (hasAssetOption(id)) return;
    const option = document.createElement('option');
    option.value = id;
    option.textContent = label;
    assetSelect.append(option);
  };

  void fetchInventory()
    .then((inventory) => {
      const assets = [...inventory.assets].sort((a, b) => a.name.localeCompare(b.name));
      for (const asset of assets) addAssetOption(asset.id, `${asset.name} · ${asset.id}`);
      // A binding the inventory no longer has stays visible so it can be changed.
      for (const item of placed.values()) {
        if (item.asset_id && !hasAssetOption(item.asset_id)) {
          addAssetOption(item.asset_id, `${item.asset_id} (not in inventory)`);
        }
      }
      syncBinding();
    })
    .catch(() => {
      // Offline: the inventory mock is used by the data client; only a hard failure lands here.
    });

  const syncBinding = (): void => {
    const item = selected === null ? undefined : placed.get(selected);
    assetSelect.disabled = !item;
    removeBtn.disabled = !item;
    if (item?.asset_id) addAssetOption(item.asset_id, item.asset_id);
    assetSelect.value = item?.asset_id ?? '';
  };

  // grid
  const cells: HTMLButtonElement[] = [];
  const paint = (): void => {
    let bound = 0;
    cells.forEach((cell, index) => {
      const item = placed.get(index);
      if (item?.asset_id) bound += 1;
      cell.classList.toggle('filled', Boolean(item));
      cell.classList.toggle('selected', index === selected);
      cell.style.outline = index === selected && item ? '1px solid #ffffff' : '';
      cell.textContent = item
        ? COMPONENT_KINDS[item.kind].label.slice(0, 4).toUpperCase() + (item.asset_id ? ' ·' : '')
        : '';
      cell.setAttribute(
        'aria-label',
        item
          ? `${COMPONENT_KINDS[item.kind].label}, ${item.asset_id ? `bound to ${item.asset_id}` : 'not bound'}, select`
          : `Empty slot ${index + 1}`,
      );
    });
    count.textContent = `${placed.size} placed · ${bound} bound`;
    syncBinding();
  };

  for (let index = 0; index < COLS * ROWS; index += 1) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.dataset.index = String(index);
    cell.addEventListener('click', () => {
      if (placed.has(index)) {
        selected = index;
      } else {
        placed.set(index, { id: nextComponentId(), kind: brush, asset_id: null });
        selected = index;
      }
      paint();
    });
    cells.push(cell);
    grid.append(cell);
  }
  paint();

  assetSelect.addEventListener('change', () => {
    if (selected === null) return;
    const item = placed.get(selected);
    if (!item) return;
    item.asset_id = assetSelect.value || null;
    paint();
  });

  removeBtn.addEventListener('click', () => {
    if (selected === null) return;
    placed.delete(selected);
    selected = null;
    paint();
  });

  modal.querySelector('.builder-clear')?.addEventListener('click', () => {
    placed.clear();
    selected = null;
    paint();
  });

  const validate = (): boolean => {
    const ok = input.value.trim().length >= 2;
    createBtn.disabled = !ok;
    return ok;
  };

  let saving = false;
  const submit = async (): Promise<void> => {
    if (saving || !validate()) return;
    saving = true;
    createBtn.disabled = true;
    const components: RoomComponent[] = [...placed.entries()]
      .sort(([a], [b]) => a - b)
      .map(([index, item]) => ({
        id: item.id,
        kind: item.kind,
        asset_id: item.asset_id,
        ...slotPosition(index),
      }));
    const result = editing
      ? await updateSpace(editing.id, { title: input.value, components })
      : await createSpace(input.value, 'room', components);
    saving = false;
    if (!result.ok || !result.space) {
      error.textContent = result.error ?? (editing ? 'Could not save the space.' : 'Could not create the space.');
      error.hidden = false;
      validate();
      return;
    }
    if (result.notice) showNotice(result.notice);
    close();
    callbacks.onSaved(result.space.id);
  };

  input.addEventListener('input', () => {
    error.hidden = true;
    validate();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void submit();
    }
  });
  createBtn.addEventListener('click', () => void submit());
  modal.querySelector('[data-action="cancel"]')?.addEventListener('click', close);
  modal.querySelector('.modal-close')?.addEventListener('click', close);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) close();
  });

  input.focus();
}
