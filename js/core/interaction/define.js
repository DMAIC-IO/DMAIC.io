/**
 * defineGesture — die Definition einer Geste prüfen und mit den Vorgaben
 * ihrer Art zusammenführen (Spec C §5). Das Ergebnis ist eingefroren und
 * das einzige, was `attachGesture` und `createModule({ gestures })` annehmen.
 */
import { requireKnownId } from '../validate.js';
import { reorder } from './gestures/reorder.js';
import { move } from './gestures/move.js';
import { resize, withEdge } from './gestures/resize.js';
import { draw } from './gestures/draw.js';

const KINDS = Object.freeze({
  reorder: { defaults: reorder, required: ['toCommand'], forbidden: { toAction: 'toCommand' } },
  move: { defaults: move, required: ['start', 'locate', 'step', 'toCommand'], forbidden: { toAction: 'toCommand' } },
  resize: { defaults: resize, required: ['start', 'locate', 'step', 'toCommand'], forbidden: { toAction: 'toCommand' } },
  draw: { defaults: draw, required: ['start', 'locate', 'toAction'], forbidden: { toCommand: 'toAction' } },
});
const CALLBACKS = ['start', 'locate', 'step', 'clamp', 'preview', 'toCommand', 'toAction', 'announce'];
/** Callbacks, die `this` = Host brauchen. */
const NEEDS_THIS = ['preview', 'toAction'];
const ARROW = /^(async\s*)?(\([^)]*\)|[\w$]+)\s*=>/;
const defined = new WeakSet();

/**
 * @param {object} def `{ kind, handle, start?, locate?, step?, clamp?, preview, toCommand?, toAction?, announce?, axis? }`
 * @returns {Readonly<object>} geprüfte, eingefrorene Definition
 * @throws {Error} in der Vertragsform von `core/validate.js`
 */
export function defineGesture(def) {
  const kind = def?.kind;
  requireKnownId('gesture kind', kind, Object.keys(KINDS));
  const spec = KINDS[kind];
  const owner = `defineGesture(${kind})`;
  if (typeof def.handle !== 'string' || def.handle === '') {
    throw new Error(`missing key "handle" of ${owner}; expected: a CSS selector`);
  }
  for (const [key, instead] of Object.entries(spec.forbidden)) {
    if (Object.hasOwn(def, key)) throw new Error(`invalid ${key} of ${owner}; allowed: ${instead}`);
  }
  const merged = { ...spec.defaults, ...def };
  for (const key of ['preview', ...spec.required]) {
    if (typeof merged[key] !== 'function') throw new Error(`missing key "${key}" of ${owner}; expected: a function`);
  }
  for (const key of CALLBACKS) {
    if (merged[key] !== undefined && typeof merged[key] !== 'function') {
      throw new Error(`invalid ${key} of ${owner}; allowed: a function`);
    }
  }
  for (const key of NEEDS_THIS) {
    if (typeof merged[key] === 'function' && ARROW.test(merged[key].toString())) {
      throw new Error(`invalid ${key} of ${owner}; allowed: a method or function, not an arrow function (this = host)`);
    }
  }
  if (merged.axis !== undefined && merged.axis !== 'x' && merged.axis !== 'y') {
    throw new Error(`invalid axis ${JSON.stringify(merged.axis)} of ${owner}; allowed: x, y`);
  }
  if (kind === 'resize') merged.start = withEdge(merged.start);
  const out = Object.freeze(merged);
  defined.add(out);
  return out;
}

/**
 * Stammt `x` aus `defineGesture`?
 * @param {any} x @returns {boolean}
 */
export function isGesture(x) {
  return typeof x === 'object' && x !== null && defined.has(x);
}
