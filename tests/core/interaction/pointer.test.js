/**
 * Tests for core/interaction/attach.js + pointer.js — Zeiger-Gesten an
 * echtem DOM mit synthetischen Pointer Events (Spec C §4.1, §4.2, §6).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, afterEach } from '../../test-utils.js';
import { defineGesture } from '../../../js/core/interaction/define.js';
import { attachGesture } from '../../../js/core/interaction/attach.js';
import { bindPointer } from '../../../js/core/interaction/pointer.js';

const cleanup = [];

function list(root, key, ids) {
  const ul = document.createElement('ul');
  ul.dataset.group = key;
  ul.dataset.groupLabel = `Liste ${key.toUpperCase()}`;
  ul.style.cssText = 'margin:0;padding:0;list-style:none;width:100px;min-height:100px;';
  ids.forEach((id, i) => {
    const li = document.createElement('li');
    li.dataset.index = String(i);
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

/** Container mit a = x,y,z und b = w; Host und env protokollieren. */
function setup({ left = 0, execute } = {}) {
  const root = document.createElement('div');
  root.style.cssText = `position:fixed;left:${left}px;top:0;display:flex;gap:20px;`;
  list(root, 'a', ['x', 'y', 'z']);
  list(root, 'b', ['w']);
  document.body.append(root);
  const host = { previews: [], actions: [] };
  const calls = [];
  const notes = [];
  const env = {
    execute: execute ?? ((name, args) => { calls.push([name, args]); }),
    notify: (m, type) => notes.push([m, type]),
    t: (key, p = {}) => `${key}(${Object.entries(p).map(([k, v]) => `${k}=${v}`).join(',')})`,
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
  return { root, host, calls, notes, btn, detach };
}

function pointer(el, type, x, y, extra = {}) {
  el.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, pointerType: 'mouse',
    button: type === 'pointermove' ? -1 : 0, clientX: x, clientY: y, ...extra,
  }));
}
/** Druck auf (sx,sy), Bewegung in 4 Schritten nach (tx,ty), Loslassen. */
function drag(el, sx, sy, tx, ty, { end = 'pointerup' } = {}) {
  pointer(el, 'pointerdown', sx, sy);
  for (let i = 1; i <= 4; i++) pointer(el, 'pointermove', sx + (tx - sx) * i / 4, sy + (ty - sy) * i / 4);
  pointer(el, end, tx, ty);
}
const live = () => document.getElementById('dmike-live-region')?.textContent ?? '';

suite('interaction/attach — Zeiger', () => {
  afterEach(() => { while (cleanup.length) cleanup.pop()(); });

  test('Ziehen in der Gruppe → genau ein Kommando mit Endindex', () => {
    const { calls, btn } = setup();
    drag(btn('x'), 50, 10, 50, 45);
    assertEqual(calls.length, 1);
    assertDeepEqual(calls[0], ['moveItem', { from: { group: 'a', index: 0 }, to: { group: 'a', index: 1 } }]);
  });

  test('ans Ende der eigenen Gruppe → Endindex n−1', () => {
    const { calls, btn } = setup();
    drag(btn('x'), 50, 10, 50, 70);
    assertDeepEqual(calls[0][1].to, { group: 'a', index: 2 });
  });

  test('in die fremde Gruppe → Index ohne Abzug', () => {
    const { calls, btn } = setup();
    drag(btn('x'), 50, 10, 170, 15);
    assertDeepEqual(calls[0][1].to, { group: 'b', index: 1 });
  });

  test('Vorschau: Start, Positionen, am Ende null; Attribute während des Ziehens', () => {
    const { root, host, btn } = setup();
    const el = btn('x');
    pointer(el, 'pointerdown', 50, 10);
    pointer(el, 'pointermove', 50, 30);
    assertDeepEqual(host.previews[0], { group: 'a', index: 0 });
    assertEqual(root.querySelector('[data-id="x"]').getAttribute('data-dragging'), 'reorder');
    pointer(el, 'pointermove', 170, 15);
    assertTrue(root.querySelector('[data-group="b"]').hasAttribute('data-drop-target'));
    pointer(el, 'pointerup', 170, 15);
    assertEqual(host.previews.at(-1), null);
    assertEqual(root.querySelectorAll('[data-dragging], [data-drop-target]').length, 0);
  });

  test('unter 4 px: kein Kommando, keine Vorschau, Klick bleibt Klick', () => {
    const { root, host, calls, btn } = setup();
    let clicks = 0;
    root.addEventListener('click', () => { clicks += 1; });
    const el = btn('x');
    pointer(el, 'pointerdown', 50, 10);
    pointer(el, 'pointermove', 52, 12);
    pointer(el, 'pointerup', 52, 12);
    el.click();
    assertEqual(calls.length, 0);
    assertEqual(host.previews.length, 0);
    assertEqual(clicks, 1);
  });

  test('Klick direkt nach einer Geste wird verschluckt', () => {
    const { root, btn } = setup();
    let clicks = 0;
    root.addEventListener('click', () => { clicks += 1; });
    drag(btn('x'), 50, 10, 50, 45);
    btn('x').click();
    assertEqual(clicks, 0);
    btn('x').click();
    assertEqual(clicks, 1, 'nur der erste Klick');
  });

  test('pointercancel: Vorschau weg, kein Kommando, Ansage', () => {
    const { host, calls, btn } = setup();
    drag(btn('x'), 50, 10, 50, 45, { end: 'pointercancel' });
    assertEqual(calls.length, 0);
    assertEqual(host.previews.at(-1), null);
    assertEqual(live(), 'common.gesture.cancelled()');
  });

  test('Ablegen außerhalb → kein Kommando, Abbruch angesagt', () => {
    const { calls, btn } = setup();
    drag(btn('x'), 50, 10, 500, 10);
    assertEqual(calls.length, 0);
    assertEqual(live(), 'common.gesture.cancelled()');
  });

  test('Ablegen am Ursprung → kein Kommando', () => {
    const { calls, btn } = setup();
    drag(btn('y'), 50, 30, 50, 37);
    assertEqual(calls.length, 0);
  });

  test('nur primäre Taste und primärer Zeiger', () => {
    const { host, btn } = setup();
    const el = btn('x');
    pointer(el, 'pointerdown', 50, 10, { button: 2 });
    pointer(el, 'pointermove', 50, 40);
    pointer(el, 'pointerdown', 50, 10, { isPrimary: false, pointerId: 3 });
    pointer(el, 'pointermove', 50, 40, { pointerId: 3 });
    assertEqual(host.previews.length, 0);
  });

  test('zweiter Druck während einer Geste wird ignoriert', () => {
    const { calls, btn } = setup();
    const el = btn('x');
    pointer(el, 'pointerdown', 50, 10);
    pointer(el, 'pointermove', 50, 45);
    pointer(btn('z'), 'pointerdown', 50, 50, { pointerId: 2 });
    pointer(el, 'pointerup', 50, 45);
    assertEqual(calls.length, 1);
    assertDeepEqual(calls[0][1].from, { group: 'a', index: 0 });
  });

  test('Ablehnung: Vorschau weg, Ansage, notify', () => {
    const { host, notes, btn } = setup({ execute: () => { throw new Error('invalid to "b"; allowed: a'); } });
    drag(btn('x'), 50, 10, 170, 15);
    assertEqual(host.previews.at(-1), null);
    assertEqual(live(), 'common.gesture.rejected(reason=invalid to "b"; allowed: a)');
    assertDeepEqual(notes, [['invalid to "b"; allowed: a', 'error']]);
  });

  test('Ablegen sagt die Position an', () => {
    const { btn } = setup();
    drag(btn('x'), 50, 10, 50, 45);
    assertEqual(live(), 'common.gesture.dropped(position=common.gesture.position(pos=2,total=3))');
  });

  test('je Dokument nur eine Geste', () => {
    const one = setup();
    const two = setup({ left: 300 });
    pointer(one.btn('x'), 'pointerdown', 50, 10);
    pointer(one.btn('x'), 'pointermove', 50, 45);
    drag(two.btn('x'), 350, 10, 350, 45);
    assertEqual(two.host.previews.length, 0);
    assertEqual(two.calls.length, 0);
    pointer(one.btn('x'), 'pointerup', 50, 45);
    assertEqual(one.calls.length, 1);
  });

  test('detach löst alle Listener', () => {
    const { calls, btn, detach } = setup();
    detach();
    drag(btn('x'), 50, 10, 50, 45);
    assertEqual(calls.length, 0);
  });

  test('nicht fokussierbarer Griff: einmal console.warn', () => {
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;left:0;top:0;';
    const d = document.createElement('div');
    d.className = 'd';
    d.style.cssText = 'width:50px;height:50px;';
    root.append(d);
    document.body.append(root);
    const warned = [];
    const orig = console.warn;
    console.warn = (...a) => warned.push(a);
    try {
      const def = defineGesture({ kind: 'move', handle: '.d', start: () => ({ v: 0 }), locate: () => ({ v: 1 }),
        step: (p) => p, preview(p) { this.p = p; }, toCommand: () => ['c', {}] });
      const detach = attachGesture(root, def, {}, { execute() {} });
      cleanup.push(() => { detach(); root.remove(); });
      pointer(d, 'pointerdown', 10, 10); pointer(d, 'pointerup', 10, 10);
      pointer(d, 'pointerdown', 10, 10); pointer(d, 'pointerup', 10, 10);
    } finally {
      console.warn = orig;
    }
    assertEqual(warned.length, 1);
    assertTrue(/not focusable/.test(String(warned[0][0])));
  });

  test('draw: toAction mit this = Host, kein execute', () => {
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;left:0;top:0;';
    for (let i = 0; i < 4; i++) {
      const s = document.createElement('div');
      s.className = 'slot';
      s.dataset.min = String(i * 30);
      s.style.cssText = 'height:30px;width:100px;';
      root.append(s);
    }
    document.body.append(root);
    const host = { opened: [], p: [] };
    const executed = [];
    const def = defineGesture({
      kind: 'draw',
      handle: '.slot',
      start(el) { return { min: Number(el.dataset.min) }; },
      locate(point) { return { min: Math.floor(point.y / 30) * 30 }; },
      preview(pos) { this.p.push(pos); },
      toAction(from, to) { this.opened.push([from.min, to.min]); },
    });
    const detach = attachGesture(root, def, host, { execute: (...a) => executed.push(a) });
    cleanup.push(() => { detach(); root.remove(); });
    drag(root.children[1], 50, 45, 50, 100);
    assertDeepEqual(host.opened, [[30, 90]]);
    assertEqual(executed.length, 0);
    assertEqual(host.p.at(-1), null);
  });

  test('host als Funktion wird je Geste aufgelöst', () => {
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;left:0;top:0;display:flex;gap:20px;';
    list(root, 'a', ['x', 'y']);
    document.body.append(root);
    let current = { name: 'erst', seen: [] };
    const def = defineGesture({ kind: 'reorder', handle: '.h', preview(pos) { this.seen.push(pos); }, toCommand: (f, t) => ['m', t] });
    const detach = attachGesture(root, def, () => current, { execute() {} });
    cleanup.push(() => { detach(); root.remove(); });
    const first = current;
    current = { name: 'zweit', seen: [] };
    drag(root.querySelector('[data-id="x"] .h'), 50, 10, 50, 35);
    assertEqual(first.seen.length, 0);
    assertTrue(current.seen.length > 0);
  });
  test('Klick-Verschlucken überlebt keinen fremden Klick', () => {
    const { root, btn } = setup();
    let clicks = 0;
    root.addEventListener('click', () => { clicks += 1; });
    drag(btn('x'), 50, 10, 50, 45);
    root.querySelector('[data-group="b"]').click();
    assertEqual(clicks, 1, 'fremder Klick läuft durch');
    btn('x').click();
    assertEqual(clicks, 2, 'Griff-Klick wird nicht mehr verschluckt');
  });

  test('Zeiger-Listener werden gelöst, wenn die Geste ohne Adapter endet', () => {
    const root = document.createElement('div');
    root.innerHTML = '<button class="h" type="button">h</button>';
    document.body.append(root);
    const h = root.firstChild;
    const moves = [];
    let endHook = null;
    const gesture = {
      press: () => true,
      pointerMove: (e) => moves.push(e.clientY),
      pointerUp() {}, pointerCancel() {},
      consumeClick: () => false,
      onEnd: (fn) => { endHook = fn; },
    };
    const unbind = bindPointer(root, { handle: '.h', kind: 'reorder' }, gesture);
    cleanup.push(() => { unbind(); root.remove(); });
    pointer(h, 'pointerdown', 5, 5);
    pointer(h, 'pointermove', 5, 30);
    assertEqual(moves.length, 1);
    endHook();
    pointer(h, 'pointermove', 5, 40);
    assertEqual(moves.length, 1, 'nach dem Ende kein Move mehr');
  });
});
