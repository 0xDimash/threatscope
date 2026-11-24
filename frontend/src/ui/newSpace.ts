/**
 * Space editor dialog: name the room, then place components on a grid. Used both to create a
 * space and to edit one — same layout, prefilled from the stored components.
 * A component here is a 3D device the room scene renders — the same kinds the built-in
 * room uses. Persistence and limits live in `spaces.ts`.
 */
import { COMPONENT_KINDS, type ComponentKind, type RoomComponent } from '../scene/room';
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
  const placed = new Map<number, ComponentKind>(
    editing
      ? (editing.components ?? [])
          .map((component) => {
            const slot = slotForPosition(component.x, component.z);
            return slot === null ? null : ([slot, component.kind] as [number, ComponentKind]);
          })
          .filter((entry): entry is [number, ComponentKind] => entry !== null)
      : START,
  );
  let brush: ComponentKind = 'pc';

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
          ? 'Rename the room or rearrange its devices.'
          : 'Build a room from scratch: pick a component, then click a slot.'
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
          <p class="builder-hint">Click a placed component again to remove it.</p>
        </div>
        <div class="builder-stage">
          <div class="builder-grid" role="group" aria-label="Room layout"></div>
          <div class="builder-count">0 placed</div>
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

  // grid
  const cells: HTMLButtonElement[] = [];
  const paint = (): void => {
    cells.forEach((cell, index) => {
      const kind = placed.get(index);
      cell.classList.toggle('filled', Boolean(kind));
      cell.textContent = kind ? COMPONENT_KINDS[kind].label.slice(0, 4).toUpperCase() : '';
      cell.setAttribute('aria-label', kind ? `${COMPONENT_KINDS[kind].label}, remove` : `Empty slot ${index + 1}`);
    });
    count.textContent = `${placed.size} placed`;
  };

  for (let index = 0; index < COLS * ROWS; index += 1) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.dataset.index = String(index);
    cell.addEventListener('click', () => {
      if (placed.has(index)) placed.delete(index);
      else placed.set(index, brush);
      paint();
    });
    cells.push(cell);
    grid.append(cell);
  }
  paint();

  modal.querySelector('.builder-clear')?.addEventListener('click', () => {
    placed.clear();
    paint();
  });

  const validate = (): boolean => {
    const ok = input.value.trim().length >= 2;
    createBtn.disabled = !ok;
    return ok;
  };

  const submit = (): void => {
    if (!validate()) return;
    const components: RoomComponent[] = [...placed.entries()]
      .sort(([a], [b]) => a - b)
      .map(([index, kind]) => ({ kind, ...slotPosition(index) }));
    const result = editing
      ? updateSpace(editing.id, { title: input.value, components })
      : createSpace(input.value, 'room', components);
    if (!result.ok || !result.space) {
      error.textContent = result.error ?? (editing ? 'Could not save the space.' : 'Could not create the space.');
      error.hidden = false;
      return;
    }
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
      submit();
    }
  });
  createBtn.addEventListener('click', submit);
  modal.querySelector('[data-action="cancel"]')?.addEventListener('click', close);
  modal.querySelector('.modal-close')?.addEventListener('click', close);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) close();
  });

  input.focus();
}
