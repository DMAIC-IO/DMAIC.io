/**
 * Zustandsautomat einer Geste (Spec C §4.1) — rein, ohne DOM.
 *
 *   idle → pressed → dragging → dropped | cancelled → (reset) idle
 *
 * `pressed` gibt es nur beim Zeiger; die Tastatur nimmt direkt auf
 * (`pick` → dragging). Ereignisse der jeweils anderen Quelle und fremder
 * Zeiger werden ignoriert: es gilt, was zuerst begann.
 */

/** Abstand in px, ab dem ein gedrückter Zeiger zur Geste wird. */
export const THRESHOLD = 4;

/**
 * @typedef {{ phase: 'idle'|'pressed'|'dragging'|'dropped'|'cancelled',
 *             source: 'pointer'|'keyboard'|null, pointerId: number|null,
 *             origin: { x: number, y: number }|null }} GestureState
 */

/** @type {Readonly<GestureState>} */
export const IDLE = Object.freeze({ phase: 'idle', source: null, pointerId: null, origin: null });

/**
 * Übergang des Automaten.
 * @param {GestureState} state
 * @param {{ type: 'press'|'move'|'release'|'pick'|'drop'|'cancel'|'reset',
 *           source?: 'pointer'|'keyboard', pointerId?: number, x?: number, y?: number }} event
 * @returns {GestureState}
 */
export function next(state, event) {
  switch (event.type) {
    case 'press':
      if (state.phase !== 'idle') return state;
      return { phase: 'pressed', source: 'pointer', pointerId: event.pointerId, origin: { x: event.x, y: event.y } };
    case 'pick':
      if (state.phase !== 'idle') return state;
      return { phase: 'dragging', source: 'keyboard', pointerId: null, origin: null };
    case 'move':
      if (state.phase !== 'pressed' || state.source !== 'pointer' || event.pointerId !== state.pointerId) return state;
      return Math.hypot(event.x - state.origin.x, event.y - state.origin.y) >= THRESHOLD
        ? { ...state, phase: 'dragging' }
        : state;
    case 'release':
      if (state.source !== 'pointer' || event.pointerId !== state.pointerId) return state;
      if (state.phase === 'pressed') return IDLE;
      if (state.phase === 'dragging') return { ...state, phase: 'dropped' };
      return state;
    case 'drop':
      if (state.source !== 'keyboard' || state.phase !== 'dragging') return state;
      return { ...state, phase: 'dropped' };
    case 'cancel':
      if (event.source !== state.source) return state;
      if (state.phase === 'pressed') return IDLE;
      if (state.phase === 'dragging') return { ...state, phase: 'cancelled' };
      return state;
    case 'reset':
      return state.phase === 'dropped' || state.phase === 'cancelled' ? IDLE : state;
    default:
      return state;
  }
}

/** Aktive Geste je Bereich (Dokument). */
const owners = new WeakMap();

/**
 * Den Bereich für eine Geste beanspruchen.
 * @param {object} scope meist das Dokument @param {object} owner die Geste
 * @returns {boolean} false, wenn schon eine andere Geste läuft
 */
export function claim(scope, owner) {
  const current = owners.get(scope);
  if (current && current !== owner) return false;
  owners.set(scope, owner);
  return true;
}

/**
 * Den Bereich freigeben — nur durch den Besitzer.
 * @param {object} scope @param {object} owner @returns {void}
 */
export function release(scope, owner) {
  if (owners.get(scope) === owner) owners.delete(scope);
}
