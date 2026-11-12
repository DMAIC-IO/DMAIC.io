/**
 * Tests for core/interaction/keyboard.js — Aufnahme-Modus, Ein-Schritt-
 * Kürzel, Abbruchpfade, Bedienhinweis, Fokus (Spec C §4.3, §4.4).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, afterEach } from '../../test-utils.js';
import { defineGesture } from '../../../js/core/interaction/define.js';
import { attachGesture } from '../../../js/core/interaction/attach.js';
import { shortcutRegistry } from '../../../js/core/shortcut-registry.js';

const cleanup = [];
const tt = (key, p = {}) => `${key}(${Object.entries(p).map(([k, v]) => `${k}=${v}`).join(',')})`;
const live = () => document.getElementById('dmike-live-region')?.textContent ?? '';
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

function renderLists(root, groups) {
  root.replaceChildren();
  for (const [key, ids] of Object.entries(groups)) {
    const ul = document.createElement('ul');
    ul.dataset.reorderGroup = key;
    ul.dataset.reorderGroupLabel = `Liste ${key.toUpperCase()}`;
    ul.style.cssText = 'margin:0;padding:0;list-style:none;width:100px;min-height:100px;';
    ids.forEach((id, i) => {
      const li = document.createElement('li');
      li.dataset.reorderIndex = String(i);
      li.dataset.id = id;
      li.style.height = '20px';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'h';
      b.textContent = id;
      b.style.cssText = 'display:block;width:100%;height:20px;padding:0;border:0;';
      li.append(b);
      ul.append(li);
    });
    root.append(ul);
  }
}

function setup({ execute } = {}) {
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;left:0;top:0;display:flex;gap:20px;';
  renderLists(root, { a: ['x', 'y', 'z'], b: ['w'] });
  document.body.append(root);
  const host = { previews: [] };
  const calls = [];
  const notes = [];
  const env = {
    execute: execute ?? ((name, args) => { calls.push([name, args]); }),
    notify: (m, type) => notes.push([m, type]),
    t: tt,
  };
  const def = defineGesture({
    kind: 'reorder',
    handle: '.h',
    preview(pos) { this.previews.push(pos); },
    toCommand(from, to) { return ['moveItem', { from, to }]; },
  });
  const detach = attachGesture(root, def, host, env);
  cleanup.push(() => { detach(); root.remove(); });
  const btn = (id) => root.querySelector(`[data-id="${id}"] .h`);
  return { root, host, calls, notes, btn };
}

function key(el, k, mods = {}) {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods });
  el.dispatchEvent(e);
  return e;
}

suite('interaction/keyboard — Aufnahme-Modus', () => {
  afterEach(() => { while (cleanup.length) cleanup.pop()(); });

  test('Leertaste nimmt auf: Vorschau, Attribut, Ansage, preventDefault', () => {
    const { root, host, btn } = setup();
    const e = key(btn('x'), ' ');
    assertTrue(e.defaultPrevented);
    assertDeepEqual(host.previews, [{ group: 'a', index: 0 }]);
    assertEqual(root.querySelector('[data-id="x"]').getAttribute('data-gesture-dragging'), 'reorder');
    assertEqual(live(), 'common.gesture.picked(position=common.gesture.position(pos=1,total=3))');
  });

  test('Pfeil ↓ und Leertaste → Kommando, Ansagen', () => {
    const { calls, btn } = setup();
    key(btn('x'), ' ');
    key(btn('x'), 'ArrowDown');
    assertEqual(live(), 'common.gesture.position(pos=2,total=3)');
    key(btn('x'), 'Enter');
    assertDeepEqual(calls, [['moveItem', { from: { group: 'a', index: 0 }, to: { group: 'a', index: 1 } }]]);
    assertEqual(live(), 'common.gesture.dropped(position=common.gesture.position(pos=2,total=3))');
  });

  test('→ wechselt die Gruppe, Ansage mit Gruppenname', () => {
    const { calls, btn } = setup();
    key(btn('x'), ' ');
    key(btn('x'), 'ArrowRight');
    assertEqual(live(), 'common.gesture.positionInGroup(group=Liste B,pos=1,total=2)');
    key(btn('x'), ' ');
    assertDeepEqual(calls[0][1].to, { group: 'b', index: 0 });
  });

  test('Schritt über die Grenze bewirkt nichts', () => {
    const { host, btn } = setup();
    key(btn('x'), ' ');
    key(btn('x'), 'ArrowUp');
    key(btn('x'), 'ArrowLeft');
    assertEqual(host.previews.length, 1);
  });

  test('Esc bricht ab: Vorschau null, kein Kommando, Ansage', () => {
    const { host, calls, btn } = setup();
    key(btn('x'), ' ');
    key(btn('x'), 'ArrowDown');
    key(btn('x'), 'Escape');
    assertEqual(host.previews.at(-1), null);
    assertEqual(calls.length, 0);
    assertEqual(live(), 'common.gesture.cancelled()');
  });

  test('Tab bricht ab (ohne preventDefault)', () => {
    const { calls, btn } = setup();
    key(btn('x'), ' ');
    const e = key(btn('x'), 'Tab');
    assertTrue(!e.defaultPrevented);
    key(btn('x'), ' ');
    assertEqual(calls.length, 0, 'zweite Leertaste nimmt neu auf statt abzulegen');
  });

  test('Fokusverlust bricht ab', () => {
    const { host, calls, btn } = setup();
    btn('x').focus();
    key(btn('x'), ' ');
    btn('y').focus();
    assertEqual(host.previews.at(-1), null);
    assertEqual(calls.length, 0);
  });

  test('Ablehnung per Tastatur: notify, Ansage, Vorschau null', () => {
    const { host, notes, btn } = setup({ execute: () => { throw new Error('invalid to "b"; allowed: a'); } });
    key(btn('x'), ' ');
    key(btn('x'), 'ArrowRight');
    key(btn('x'), ' ');
    assertEqual(host.previews.at(-1), null);
    assertDeepEqual(notes, [['invalid to "b"; allowed: a', 'error']]);
    assertEqual(live(), 'common.gesture.rejected(reason=invalid to "b"; allowed: a)');
  });

  test('während einer Zeiger-Geste wird die Tastatur ignoriert; Esc bricht sie ab', () => {
    const { host, calls, btn } = setup();
    const el = btn('x');
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, isPrimary: true, button: 0, clientX: 50, clientY: 10 }));
    el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, isPrimary: true, clientX: 50, clientY: 40 }));
    const before = host.previews.length;
    key(btn('y'), ' ');
    assertEqual(host.previews.length, before, 'kein Aufnehmen');
    key(el, 'Escape');
    assertEqual(host.previews.at(-1), null);
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, isPrimary: true, button: 0, clientX: 50, clientY: 40 }));
    assertEqual(calls.length, 0);
  });
});

suite('interaction/keyboard — Ein-Schritt-Kürzel', () => {
  afterEach(() => { while (cleanup.length) cleanup.pop()(); });

  test('Alt+↓ → sofort Kommando, preventDefault', () => {
    const { calls, btn } = setup();
    const e = key(btn('x'), 'ArrowDown', { altKey: true });
    assertTrue(e.defaultPrevented);
    assertDeepEqual(calls, [['moveItem', { from: { group: 'a', index: 0 }, to: { group: 'a', index: 1 } }]]);
  });

  test('Alt+← am Rand: nichts, aber preventDefault (kein Verlauf)', () => {
    const { calls, btn } = setup();
    const e = key(btn('x'), 'ArrowLeft', { altKey: true });
    assertTrue(e.defaultPrevented);
    assertEqual(calls.length, 0);
  });

  test('Alt+Pfeil im Aufnahme-Modus: preventDefault, kein Schritt, kein Kommando', () => {
    const { host, calls, btn } = setup();
    key(btn('x'), ' ');
    const n = host.previews.length;
    const e = key(btn('x'), 'ArrowLeft', { altKey: true });
    assertTrue(e.defaultPrevented);
    assertEqual(host.previews.length, n);
    assertEqual(calls.length, 0);
  });

  test('Alt+→ → Nachbargruppe', () => {
    const { calls, btn } = setup();
    key(btn('x'), 'ArrowRight', { altKey: true });
    assertDeepEqual(calls[0][1].to, { group: 'b', index: 0 });
  });

  test('Fokus nach dem Kommando wieder am Griff (neu gerendert)', async () => {
    let root = null;
    const s = setup({
      execute() { renderLists(root, { a: ['y', 'x', 'z'], b: ['w'] }); },
    });
    root = s.root;
    s.btn('x').focus();
    key(s.btn('x'), 'ArrowDown', { altKey: true });
    await frame();
    assertEqual(document.activeElement, s.btn('x'));
  });

  test('resize: Alt+Shift+↓ verschiebt die Endkante, Alt+↓ nicht', () => {
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;left:0;top:0;';
    const block = document.createElement('div');
    block.dataset.id = 'k';
    for (const edge of ['start', 'end']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'edge';
      b.dataset.resizeEdge = edge;
      block.append(b);
    }
    root.append(block);
    document.body.append(root);
    const calls = [];
    const def = defineGesture({
      kind: 'resize',
      handle: '.edge',
      start() { return { id: 'k', start: 0, end: 30 }; },
      locate: () => null,
      step(pos, dir) {
        const d = 30 * (dir.y || dir.x);
        return pos.edge === 'start' ? { ...pos, start: pos.start + d } : { ...pos, end: pos.end + d };
      },
      preview(p) { this.p = p; },
      toCommand(from, to) { return ['updateBlock', to]; },
    });
    const detach = attachGesture(root, def, {}, { execute: (n, a) => calls.push([n, a]), t: tt });
    cleanup.push(() => { detach(); root.remove(); });
    const startEdge = root.querySelector('[data-resize-edge="start"]');
    const plain = key(startEdge, 'ArrowDown', { altKey: true });
    assertTrue(plain.defaultPrevented, 'Alt+Pfeil ohne Shift: kein Kommando, aber preventDefault');
    assertEqual(calls.length, 0);
    key(startEdge, 'ArrowDown', { altKey: true, shiftKey: true });
    assertDeepEqual(calls, [['updateBlock', { id: 'k', start: 0, end: 60, edge: 'end' }]]);
  });

  test('draw hat keinen Tastaturmodus', () => {
    const root = document.createElement('div');
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.tabIndex = 0;
    root.append(slot);
    document.body.append(root);
    const host = { p: [] };
    const def = defineGesture({ kind: 'draw', handle: '.slot', start: () => ({ m: 0 }), locate: () => ({ m: 0 }),
      preview(p) { this.p.push(p); }, toAction() {} });
    const detach = attachGesture(root, def, host, { execute() {}, t: tt });
    cleanup.push(() => { detach(); root.remove(); });
    const e = key(slot, ' ');
    assertTrue(!e.defaultPrevented);
    assertEqual(host.p.length, 0);
    slot.focus();
    assertTrue(!slot.hasAttribute('aria-describedby'));
  });
});

suite('interaction/keyboard — Bedienhinweis und Registry', () => {
  afterEach(() => { while (cleanup.length) cleanup.pop()(); });

  test('aria-describedby beim ersten Fokus', () => {
    const { btn } = setup();
    assertTrue(!btn('x').hasAttribute('aria-describedby'));
    btn('x').focus();
    assertEqual(btn('x').getAttribute('aria-describedby'), 'dmike-gesture-instructions');
    assertEqual(document.getElementById('dmike-gesture-instructions').textContent, 'common.gesture.instructions()');
  });

  test('shortcut-registry belegt kein Alt+Pfeil', () => {
    const combos = shortcutRegistry.getAll().flatMap((d) => [d.defaultCombo, ...d.aliasCombos]);
    assertTrue(!combos.some((c) => /^Alt\+(Shift\+)?Arrow/.test(c)), combos.join(' '));
  });
});

function ptr(el, type, x, y) {
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y }));
}

suite('interaction/keyboard — Esc bei Zeiger-Gesten (Ende zu Ende)', () => {
  afterEach(() => { while (cleanup.length) cleanup.pop()(); });

  test('Esc nach der Schwelle: weitere pointermove ohne Vorschau, kein data-gesture-dragging, idle', () => {
    const { root, host, calls, btn } = setup();
    const el = btn('x');
    ptr(el, 'pointerdown', 50, 10);
    ptr(el, 'pointermove', 50, 40);
    assertEqual(root.querySelector('[data-id="x"]').getAttribute('data-gesture-dragging'), 'reorder');
    key(el, 'Escape');
    assertEqual(host.previews.at(-1), null);
    const n = host.previews.length;
    ptr(el, 'pointermove', 50, 50);
    assertEqual(host.previews.length, n, 'keine weitere Vorschau');
    assertTrue(!root.querySelector('[data-gesture-dragging]'), 'kein data-gesture-dragging');
    ptr(el, 'pointerup', 50, 50);
    assertEqual(calls.length, 0);
    // idle: eine neue Tastaturaufnahme ist wieder möglich
    key(btn('y'), ' ');
    assertEqual(root.querySelector('[data-id="y"]').getAttribute('data-gesture-dragging'), 'reorder');
  });

  test('Esc außerhalb des Containers bricht eine laufende Zeiger-Geste ab', () => {
    const { root, host, calls, btn } = setup();
    const el = btn('x');
    ptr(el, 'pointerdown', 50, 10);
    ptr(el, 'pointermove', 50, 40);
    const e = key(document.body, 'Escape');
    assertTrue(e.defaultPrevented, 'Esc verbraucht');
    assertEqual(host.previews.at(-1), null);
    assertTrue(!root.querySelector('[data-gesture-dragging]'), 'kein data-gesture-dragging');
    ptr(el, 'pointerup', 50, 50);
    assertEqual(calls.length, 0);
  });

  test('Esc außerhalb ohne laufende Geste bleibt unberührt', () => {
    setup();
    const e = key(document.body, 'Escape');
    assertTrue(!e.defaultPrevented, 'kein preventDefault ohne Geste');
  });

  test('Esc im gedrückten Zustand (unter der Schwelle) → idle, pointerup führt nichts aus', () => {
    const { root, host, calls, btn } = setup();
    const el = btn('x');
    ptr(el, 'pointerdown', 50, 10);
    ptr(el, 'pointermove', 50, 12);
    key(el, 'Escape');
    ptr(el, 'pointermove', 50, 60);
    assertEqual(host.previews.filter((p) => p).length, 0, 'nie eine Vorschau');
    ptr(el, 'pointerup', 50, 60);
    assertEqual(calls.length, 0);
    assertTrue(!root.querySelector('[data-gesture-dragging]'));
    key(btn('y'), ' ');
    assertEqual(root.querySelector('[data-id="y"]').getAttribute('data-gesture-dragging'), 'reorder');
  });
});

/** Fehler aus Listenern abfangen (sonst landen sie unbehandelt auf window). */
function catchErrors(fn) {
  const errors = [];
  const onError = (e) => { errors.push(e.message); e.preventDefault(); };
  window.addEventListener('error', onError);
  try { fn(); } finally { window.removeEventListener('error', onError); }
  return errors;
}

suite('interaction/keyboard — Fehler im Callback', () => {
  afterEach(() => { while (cleanup.length) cleanup.pop()(); });

  test('wirft start bei der Aufnahme: Fehler sichtbar, Sperre frei, zweite Geste läuft', () => {
    const root = document.createElement('div');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bad';
    root.append(b);
    document.body.append(root);
    const def = defineGesture({
      kind: 'move', handle: '.bad',
      start() { throw new Error('start kaputt'); },
      locate: () => null, step: () => null, preview() {}, toCommand: () => ['x', {}],
    });
    const detach = attachGesture(root, def, {}, { execute() {}, t: tt });
    cleanup.push(() => { detach(); root.remove(); });
    const errors = catchErrors(() => key(b, ' '));
    assertDeepEqual(errors.map((m) => m.replace(/^Uncaught (Error: )?/, '')), ['start kaputt']);
    assertTrue(!root.querySelector('[data-gesture-dragging]'));
    const { root: other, btn } = setup();
    key(btn('x'), ' ');
    assertEqual(other.querySelector('[data-id="x"]').getAttribute('data-gesture-dragging'), 'reorder');
  });

  test('ein verlorenes keyup verschluckt keinen späteren Tastendruck', () => {
    const { root, btn } = setup();
    const extra = document.createElement('button');
    extra.type = 'button';
    root.append(extra);
    key(btn('x'), ' ');
    key(btn('x'), 'Escape');
    // Das keyup der Leertaste kam nie an; Enter an einem anderen Knopf bleibt unberührt.
    key(extra, 'Enter');
    const up = new KeyboardEvent('keyup', { key: 'Enter', bubbles: true, cancelable: true });
    extra.dispatchEvent(up);
    assertTrue(!up.defaultPrevented);
  });
});
