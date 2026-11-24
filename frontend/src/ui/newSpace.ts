/**
 * "New space" dialog: a name and a scene template. The heavy lifting (ids, limits,
 * persistence) lives in `spaces.ts`; this file only collects input and reports errors.
 */
import { MAX_TITLE, createSpace } from './spaces';

export interface NewSpaceCallbacks {
  onCreated(spaceId: string): void;
}

export function openNewSpace(root: HTMLElement, callbacks: NewSpaceCallbacks): void {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="New space">
      <div class="modal-head">
        <h2>New space</h2>
        <button type="button" class="modal-close" aria-label="Close">×</button>
      </div>
      <p class="modal-note">Same 3D scene, your own name. Stays on this device.</p>
      <label class="field">
        <span class="field-label">Name</span>
        <input class="field-input" type="text" maxlength="${MAX_TITLE}" placeholder="e.g. HQ · floor 3" />
      </label>
      <div class="field">
        <span class="field-label">Scene</span>
        <label class="option">
          <input type="radio" name="template" value="room" checked />
          <span><b>Minimal Room</b><small>8 devices · live attacks</small></span>
        </label>
        <label class="option disabled">
          <input type="radio" name="template" value="city" disabled />
          <span><b>City</b><small>coming back later</small></span>
        </label>
      </div>
      <div class="modal-error" role="alert" hidden></div>
      <div class="modal-actions">
        <button type="button" class="btn-ghost" data-action="cancel">Cancel</button>
        <button type="button" class="btn-solid" data-action="create" disabled>Create space</button>
      </div>
    </div>
  `;
  root.append(modal);

  const input = modal.querySelector<HTMLInputElement>('.field-input')!;
  const error = modal.querySelector<HTMLElement>('.modal-error')!;
  const createBtn = modal.querySelector<HTMLButtonElement>('[data-action="create"]')!;

  const close = (): void => {
    modal.remove();
    document.removeEventListener('keydown', onKey);
  };

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKey);

  const validate = (): boolean => {
    const value = input.value.trim();
    const ok = value.length >= 2;
    createBtn.disabled = !ok;
    return ok;
  };

  const submit = (): void => {
    if (!validate()) return;
    const result = createSpace(input.value, 'room');
    if (!result.ok || !result.space) {
      error.textContent = result.error ?? 'Could not create the space.';
      error.hidden = false;
      return;
    }
    close();
    callbacks.onCreated(result.space.id);
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
