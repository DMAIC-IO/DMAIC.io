/**
 * attachGesture — eine Geste an einen Container hängen (Spec C §4, §6).
 *
 * Kein Alpine (C3): `host` ist `this` der Callbacks — oder eine Funktion,
 * die ihn liefert; sie wird bei jedem Gestenbeginn aufgerufen, weil
 * `createModule` das Viewmodel bei Sprachwechsel und `setState` neu baut,
 * den Container aber behält. `env` führt aus, meldet und übersetzt.
 *
 * Der Kern schreibt nur `data-dragging` (am Quellelement), `data-drop-target`
 * (Zielgruppe bei `reorder`) und `aria-describedby` am Griff; alles Weitere
 * zeichnet das Modul aus `preview(pos)`.
 */
import { IDLE, next, claim, release } from './machine.js';
import { deepEqual, makeContext } from './helpers.js';
import { groupsOf } from './gestures/reorder.js';
import { announce } from './announce.js';
import { isGesture } from './define.js';
import { bindPointer } from './pointer.js';
import { bindKeyboard } from './keyboard.js';

/**
 * @typedef {object} GestureEnv
 * @property {(name: string, args: object) => any} execute führt das Kommando aus; wirft bei Ablehnung
 * @property {(message: string, type: string) => void} [notify]
 * @property {(key: string, params?: object) => string} [t]
 */

/**
 * @param {HTMLElement} root Container (Delegation)
 * @param {Readonly<object>} def Ergebnis von `defineGesture`
 * @param {object|(() => object)} host `this` der Callbacks, oder Funktion, die ihn liefert
 * @param {GestureEnv} [env] Vorgabe: `host` (nur, wenn `host` ein Objekt ist)
 * @returns {() => void} detach
 */
export function attachGesture(root, def, host, env = host) {
  if (!isGesture(def)) throw new Error('attachGesture: def is not a defineGesture result');
  const gesture = createController(root, def, host, env);
  const unbind = [bindPointer(root, def, gesture), bindKeyboard(root, def, gesture)];
  return function detach() {
    gesture.abort();
    for (const fn of unbind) fn();
  };
}

/**
 * Die Steuerung einer angehängten Geste; Adapter rufen nur sie.
 * @param {HTMLElement} root @param {Readonly<object>} def
 * @param {object|(() => object)} host @param {GestureEnv} env
 * @returns {object}
 */
function createController(root, def, host, env) {
  const doc = root.ownerDocument;
  const owner = {};
  let state = IDLE;
  let g = null;          // laufende Geste: { h, el, from, pos, source, marked, ctx, sourceId, edge }
  let pressedEl = null;  // Griff zwischen pointerdown und Schwelle
  let swallowClick = false;
  let endHook = null;    // vom Pointer-Adapter: löst Listener und Erfassung, sobald die Geste endet

  const resolveHost = () => (typeof host === 'function' ? host() : host);
  const t = (key, params) => (typeof env?.t === 'function' ? env.t(key, params) : key);
  const positionText = (run, pos) => (pos && typeof def.announce === 'function'
    ? def.announce.call(run.h, pos, t, run.ctx, run.from) : '');
  const say = (key, params = {}) => announce(doc, t(`common.gesture.${key}`, params).trim());

  function markTarget(pos) {
    for (const n of root.querySelectorAll('[data-drop-target]')) n.removeAttribute('data-drop-target');
    if (def.kind !== 'reorder' || !pos) return;
    groupsOf(root).find((gr) => gr.dataset.group === String(pos.group))?.setAttribute('data-drop-target', '');
  }

  function show(pos) {
    g.pos = pos;
    markTarget(pos);
    def.preview.call(g.h, pos);
  }

  /** Lauf-Daten für einen Griff; ohne Vorschau. */
  function makeRun(el, source, origin) {
    const h = resolveHost();
    const from = def.start.call(h, el);
    const item = el.closest('[data-id]');
    const own = item && root.contains(item) ? item : null;
    return {
      h, el, from, pos: from, source,
      marked: own ?? el,
      ctx: makeContext(root, origin, def.axis),
      sourceId: own ? own.dataset.id : null,
      edge: el.dataset.edge ?? null,
    };
  }

  function begin(el, source, origin) {
    g = makeRun(el, source, origin);
    g.marked.setAttribute('data-dragging', def.kind);
    show(g.from);
  }

  function settle() {
    const hook = endHook;
    endHook = null;
    hook?.();
  }

  /** Vorschau und Markierungen weg, Sperre frei. @returns {object} der beendete Lauf */
  function end() {
    const run = g;
    g = null;
    pressedEl = null;
    run.marked.removeAttribute('data-dragging');
    markTarget(null);
    def.preview.call(run.h, null);
    state = IDLE;
    release(doc, owner);
    settle();
    return run;
  }

  /** Abgelegt: Kommando bzw. Aktion, Ansage, Ablehnung, Fokus. */
  function commit(run, to) {
    if (!to) { say('cancelled'); return; }
    const position = positionText(run, to);
    if (deepEqual(run.from, to)) { say('dropped', { position }); return; }
    if (def.kind === 'draw') {
      def.toAction.call(run.h, run.from, to);
      say('dropped', { position });
      return;
    }
    const [name, args] = def.toCommand.call(run.h, run.from, to);
    try {
      env.execute(name, args);
    } catch (err) {
      say('rejected', { reason: err.message });
      env.notify?.(err.message, 'error');
      return;
    }
    say('dropped', { position });
    if (run.source === 'keyboard') restoreFocus(root, def, run, to);
  }

  return {
    t,
    /** Der Pointer-Adapter meldet, was beim Ende der Geste zu lösen ist. */
    onEnd(fn) { endHook = fn; },
    idle: () => state.phase === 'idle',
    picking: (el) => Boolean(g && g.source === 'keyboard' && (el === undefined || g.el === el)),
    pointerDragging: () => Boolean(g && g.source === 'pointer'),

    press(el, e) {
      if (state.phase !== 'idle' || !claim(doc, owner)) return false;
      swallowClick = false;
      state = next(state, { type: 'press', pointerId: e.pointerId, x: e.clientX, y: e.clientY });
      pressedEl = el;
      return true;
    },

    pointerMove(e) {
      const before = state.phase;
      state = next(state, { type: 'move', pointerId: e.pointerId, x: e.clientX, y: e.clientY });
      if (state.phase !== 'dragging' || state.source !== 'pointer') return;
      if (before === 'pressed') begin(pressedEl, 'pointer', state.origin);
      const raw = def.locate.call(g.h, { x: e.clientX, y: e.clientY }, g.ctx, g.from);
      const pos = raw == null ? null : def.clamp.call(g.h, raw, g.ctx, g.from);
      if (!deepEqual(pos, g.pos)) show(pos);
    },

    pointerUp(e) {
      const before = state.phase;
      state = next(state, { type: 'release', pointerId: e.pointerId });
      if (before === 'pressed' && state.phase === 'idle') {
        pressedEl = null;
        release(doc, owner);
        return;
      }
      if (state.phase !== 'dropped') return;
      swallowClick = true;
      const run = end();
      commit(run, run.pos);
    },

    pointerCancel() {
      const before = state.phase;
      state = next(state, { type: 'cancel', source: 'pointer' });
      if (before === 'pressed' && state.phase === 'idle') {
        pressedEl = null;
        release(doc, owner);
        return;
      }
      if (state.phase !== 'cancelled') return;
      swallowClick = true;
      end();
      say('cancelled');
    },

    consumeClick() {
      const s = swallowClick;
      swallowClick = false;
      return s;
    },

    keyPick(el) {
      if (state.phase !== 'idle' || !claim(doc, owner)) return;
      state = next(state, { type: 'pick' });
      begin(el, 'keyboard', null);
      say('picked', { position: positionText(g, g.pos) });
    },

    keyStep(dir) {
      if (!g || g.source !== 'keyboard') return;
      const raw = def.step.call(g.h, g.pos, dir, g.ctx, g.from);
      if (raw == null) return;
      const pos = def.clamp.call(g.h, raw, g.ctx, g.from);
      if (pos == null || deepEqual(pos, g.pos)) return;
      show(pos);
      announce(doc, positionText(g, pos));
    },

    keyDrop() {
      state = next(state, { type: 'drop' });
      if (state.phase !== 'dropped') return;
      const run = end();
      commit(run, run.pos);
    },

    keyCancel() {
      state = next(state, { type: 'cancel', source: 'keyboard' });
      if (state.phase !== 'cancelled') return;
      end();
      say('cancelled');
    },

    /** Ein-Schritt-Kürzel: ein Schritt ab `start(el)`, sofort Kommando. */
    shortcut(el, dir, endEdge) {
      if (state.phase !== 'idle' || !claim(doc, owner)) return;
      try {
        const run = makeRun(el, 'keyboard', null);
        if (endEdge) run.from = { ...run.from, edge: 'end' };
        const raw = def.step.call(run.h, run.from, dir, run.ctx, run.from);
        if (raw == null) return;
        const to = def.clamp.call(run.h, raw, run.ctx, run.from);
        if (to == null || deepEqual(to, run.from)) return;
        commit(run, to);
      } finally {
        release(doc, owner);
      }
    },

    abort() {
      if (g) end();
      else if (state.phase === 'pressed') release(doc, owner);
      state = IDLE;
      pressedEl = null;
      settle();
    },
  };
}

/**
 * Nach dem Kommando den Griff wieder fokussieren (Spec C §4.3): erst über
 * `data-id` des Quellelements, sonst über Gruppe und Index der Zielposition.
 * Wartet Mikrotask plus Frame, damit das Modul neu gerendert hat.
 * @param {HTMLElement} root @param {Readonly<object>} def
 * @param {{ sourceId: string|null, edge: string|null }} run @param {object} to
 * @returns {void}
 */
function restoreFocus(root, def, run, to) {
  const find = () => {
    let scope = null;
    if (run.sourceId !== null) {
      scope = [...root.querySelectorAll('[data-id]')].find((n) => n.dataset.id === run.sourceId) ?? null;
    }
    if (!scope && to && to.group !== undefined) {
      const group = groupsOf(root).find((gr) => gr.dataset.group === String(to.group));
      scope = group
        ? [...group.querySelectorAll('[data-index]')].find((n) => n.dataset.index === String(to.index)) ?? null
        : null;
    }
    if (!scope) return;
    const handles = [scope, ...scope.querySelectorAll(def.handle)].filter((n) => n.matches(def.handle));
    const handle = handles.find((n) => (n.dataset.edge ?? null) === run.edge) ?? handles[0];
    handle?.focus();
  };
  Promise.resolve().then(() => requestAnimationFrame(find));
}
