// On phones the card is a sheet over the lower screen. It opens low ("peek":
// the title and first lines) so the model keeps most of the screen, and the
// handle on top raises it to show the whole card ("full") or lowers it again.

/** How far (px) a swipe on the handle must travel to count as a swipe, not a tap. */
export const SWIPE_PX = 24;

/**
 * The sheet's next state after a press on the handle that moved `dy` pixels
 * (negative is up). A tap toggles; a swipe up raises, a swipe down lowers.
 */
export function sheetAfter(state, dy) {
  if (Math.abs(dy) < SWIPE_PX) return state === 'full' ? 'peek' : 'full';
  return dy < 0 ? 'full' : 'peek';
}

/**
 * Wire the handle. `isPhone()` says whether the card is a sheet right now;
 * on wide screens the handle is hidden and the panel ignores the state.
 */
export function createSheet({ panel, handle, body, isPhone }) {
  const set = (state) => {
    panel.dataset.sheet = state;
    const full = state === 'full';
    handle.setAttribute('aria-expanded', String(full));
    handle.setAttribute('aria-label', full ? 'Lower the card' : 'Show the whole card');
    if (!full) body.scrollTop = 0;
  };
  let startY = null;
  handle.addEventListener('pointerdown', (e) => {
    startY = e.clientY;
    handle.setPointerCapture?.(e.pointerId);
  });
  handle.addEventListener('pointerup', (e) => {
    if (startY === null) return;
    set(sheetAfter(panel.dataset.sheet, e.clientY - startY));
    startY = null;
  });
  handle.addEventListener('pointercancel', () => (startY = null));
  // Keyboard and assistive tech press the button without a pointer.
  handle.addEventListener('click', (e) => {
    if (e.detail === 0) set(sheetAfter(panel.dataset.sheet, 0));
  });
  // Tabbing into the hidden part of a lowered card raises it. The title takes
  // focus when a card opens, and that stays low.
  body.addEventListener('focusin', (e) => {
    if (isPhone() && panel.dataset.sheet !== 'full' && e.target.id !== 'card-title') set('full');
  });
  set('peek');
  return { set, get: () => panel.dataset.sheet };
}
