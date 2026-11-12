/**
 * Tests for core/flowchart/interaction/ — Kettengeste (move mit Bändern) und
 * Unterschritt-Geste (reorder innerhalb eines Schritts), angehängt an echtes
 * DOM mit Tastatur- und Zeiger-Ereignissen.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, afterEach } from '../../test-utils.js';
import { isGesture } from '../../../js/core/interaction/define.js';
import { attachGesture } from '../../../js/core/interaction/attach.js';
import { chainGesture } from '../../../js/core/flowchart/interaction/chain.js';
import { substepGesture } from '../../../js/core/flowchart/interaction/substeps.js';

const cleanup = [];
const tt = (key, p = {}) => `${key}(${Object.entries(p).map(([k, v]) => `${k}=${v}`).join(',')})`;
const live = () => document.getElementById('dmike-live-region')?.textContent ?? '';

function el(tag, attrs = {}, css = '') {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  n.style.cssText = css;
  return n;
}

function mount(root, def, host) {
  root.style.cssText = 'position:fixed;left:0;top:0;display:flex;';
  document.body.append(root);
  const calls = [];
  const env = { execute: (name, args) => { calls.push([name, args]); }, notify() {}, t: tt };
  const detach = attachGesture(root, def, host, env);
  cleanup.push(() => { detach(); root.remove(); });
  return calls;
}

/**
 * Kette: je Schritt eine Spalte (100 px breit) mit einem Slot je Band (50 px
 * hoch); der Griff steht im Slot seines Bands. Ohne Bänder ein Slot ohne
 * `data-band`.
 */
function renderChain(steps, bands) {
  const root = document.createElement('div');
  steps.forEach(([id, band], i) => {
    const col = el('div', { 'data-step-id': id, 'data-step-index': String(i), 'data-id': id }, 'width:100px;height:100px;');
    for (const b of bands.length ? bands : [null]) {
      const slot = el('div', b ? { 'data-band': b } : {}, `height:${100 / Math.max(bands.length, 1)}px;`);
      if (b === band) {
        const grip = el('button', { type: 'button', class: 'grip' }, 'display:block;width:20px;height:20px;padding:0;border:0;');
        slot.append(grip);
      }
      col.append(slot);
    }
    root.append(col);
  });
  return root;
}

function setupChain({ bands = ['va', 'nva'], steps = [['s1', 'va'], ['s2', 'nva'], ['s3', 'va']] } = {}) {
  const root = renderChain(steps.map(([id, band]) => [id, bands.length ? band : null]), bands);
  const host = { state: { chainPreview: null } };
  const calls = mount(root, chainGesture(bands.length ? { handle: '.grip', bands } : { handle: '.grip' }), host);
  const grip = (id) => root.querySelector(`[data-step-id="${id}"] .grip`);
  return { root, host, calls, grip };
}

function key(target, k) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}
function keys(target, list) {
  target.focus();
  for (const k of list) key(target, k);
}
function pointer(target, type, x, y) {
  target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, pointerType: 'mouse',
    button: type === 'pointermove' ? -1 : 0, clientX: x, clientY: y,
  }));
}
function drag(target, sx, sy, tx, ty) {
  pointer(target, 'pointerdown', sx, sy);
  for (let i = 1; i <= 4; i++) pointer(target, 'pointermove', sx + (tx - sx) * i / 4, sy + (ty - sy) * i / 4);
  pointer(target, 'pointerup', tx, ty);
}

suite('flowchart/interaction — Kettengeste', () => {
  afterEach(() => { while (cleanup.length) cleanup.pop()(); });

  test('ist eine move-Geste mit dem Griff des Moduls', () => {
    const def = chainGesture({ handle: '.of__grip', bands: ['va', 'nva'] });
    assertTrue(isGesture(def));
    assertEqual(def.kind, 'move');
    assertEqual(def.handle, '.of__grip');
  });

  test('Tastatur → → Enter: moveStep an Index from+2, ohne side', () => {
    const { calls, grip } = setupChain();
    keys(grip('s1'), ['Enter', 'ArrowRight', 'ArrowRight', 'Enter']);
    assertDeepEqual(calls, [['moveStep', { id: 's1', index: 2 }]]);
    assertEqual(live(), 'common.gesture.dropped(position=common.gesture.position(pos=3,total=3))');
  });

  test('Tastatur ↓ Enter: anderes Band, gleicher Index, mit side', () => {
    const { calls, grip } = setupChain();
    keys(grip('s1'), ['Enter', 'ArrowDown', 'Enter']);
    assertDeepEqual(calls, [['moveStep', { id: 's1', index: 0, side: 'nva' }]]);
  });

  test('Tastatur: Vorschau in state.chainPreview, Grenzen halten', () => {
    const { host, grip } = setupChain();
    keys(grip('s1'), ['Enter', 'ArrowUp', 'ArrowLeft']);
    assertDeepEqual(host.state.chainPreview, { id: 's1', index: 0, band: 'va' });
    keys(grip('s1'), ['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowRight']);
    assertDeepEqual(host.state.chainPreview, { id: 's1', index: 2, band: 'nva' });
    key(grip('s1'), 'Escape');
  });

  test('↓ → Escape: kein Kommando, Vorschau weg, Ansage, Fokus am Griff', () => {
    const { host, calls, grip } = setupChain();
    keys(grip('s1'), ['Enter', 'ArrowDown', 'ArrowRight']);
    assertDeepEqual(host.state.chainPreview, { id: 's1', index: 1, band: 'nva' });
    key(grip('s1'), 'Escape');
    assertEqual(calls.length, 0);
    assertEqual(host.state.chainPreview, null);
    assertEqual(live(), 'common.gesture.cancelled()');
    assertTrue(document.activeElement === grip('s1'), 'Fokus steht am Griff');
  });

  test('ohne Bänder ändern ↑/↓ nichts', () => {
    const { host, calls, grip } = setupChain({ bands: [] });
    keys(grip('s2'), ['Enter', 'ArrowDown']);
    assertDeepEqual(host.state.chainPreview, { id: 's2', index: 1, band: null });
    keys(grip('s2'), ['ArrowLeft', 'Enter']);
    assertDeepEqual(calls, [['moveStep', { id: 's2', index: 0 }]]);
  });

  test('↑/↓ aus einem Band, das nicht in bands steht, ändern nichts', () => {
    const def = chainGesture({ handle: '.grip', bands: ['va', 'nva'] });
    const pos = { id: 's1', index: 0, band: 'x' };
    assertEqual(def.step(pos, { x: 0, y: 1 }), null);
    assertEqual(def.step(pos, { x: 0, y: -1 }), null);
  });

  test('Zeiger: Ablegen über Spalte 0 im anderen Band → index 0 und side', () => {
    const { calls, grip } = setupChain();
    drag(grip('s2'), 110, 60, 20, 20);
    assertDeepEqual(calls, [['moveStep', { id: 's2', index: 0, side: 'va' }]]);
  });

  test('Zeiger: hinter die letzte Spalte im eigenen Band → Endindex n−1', () => {
    const { calls, grip } = setupChain();
    drag(grip('s1'), 10, 10, 290, 20);
    assertDeepEqual(calls, [['moveStep', { id: 's1', index: 2 }]]);
  });
});

/** Zwei Schritte, je eine Gruppe mit Unterschritten (20 px hoch), Griff je Eintrag. */
function setupSubsteps() {
  const root = document.createElement('div');
  for (const [stepId, subs] of [['s1', ['x', 'y', 'z']], ['s2', ['w']]]) {
    const list = el('div', { 'data-reorder-group': stepId }, 'width:100px;min-height:100px;');
    subs.forEach((id, i) => {
      const item = el('div', { 'data-reorder-index': String(i), 'data-id': id, 'data-substep-id': id }, 'height:20px;');
      item.append(el('button', { type: 'button', class: 'fc-substep-grip' }, 'display:block;width:20px;height:20px;padding:0;border:0;'));
      list.append(item);
    });
    root.append(list);
  }
  const host = { state: { substepPreview: null } };
  const calls = mount(root, substepGesture({ handle: '.fc-substep-grip' }), host);
  const grip = (id) => root.querySelector(`[data-substep-id="${id}"] .fc-substep-grip`);
  return { host, calls, grip };
}

suite('flowchart/interaction — Unterschritt-Geste', () => {
  afterEach(() => { while (cleanup.length) cleanup.pop()(); });

  test('ist eine reorder-Geste auf der y-Achse', () => {
    const def = substepGesture({ handle: '.fc-substep-grip' });
    assertTrue(isGesture(def));
    assertEqual(def.kind, 'reorder');
    assertEqual(def.axis, 'y');
  });

  test('↓ Enter verschiebt um eins: moveSubstep mit Schritt, Unterschritt, Endindex', () => {
    const { host, calls, grip } = setupSubsteps();
    keys(grip('x'), ['Enter', 'ArrowDown']);
    assertEqual(host.state.substepPreview.index, 1);
    key(grip('x'), 'Enter');
    assertDeepEqual(calls, [['moveSubstep', { stepId: 's1', substepId: 'x', index: 1 }]]);
    assertEqual(host.state.substepPreview, null);
  });

  test('Tastatur → in den Nachbarschritt bewegt nichts', () => {
    const { host, calls, grip } = setupSubsteps();
    keys(grip('x'), ['Enter', 'ArrowRight', 'Enter']);
    assertEqual(calls.length, 0);
    assertEqual(host.state.substepPreview, null);
  });

  test('Zeiger: ein Ziel im anderen Schritt ergibt kein Kommando', () => {
    const { calls, grip } = setupSubsteps();
    drag(grip('x'), 10, 10, 150, 10);
    assertEqual(calls.length, 0);
    assertEqual(live(), 'common.gesture.cancelled()');
  });
});
