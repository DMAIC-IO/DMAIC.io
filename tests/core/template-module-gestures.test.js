/**
 * Tests for core/template-module.js mit `gestures` (Spec C §6): anhängen
 * beim Mount, lösen bei destroy, kein doppeltes Anhängen nach
 * onLanguageChange, Ausführung auf dem reaktiven Model, Ablehnung → notify.
 */
import { suite, test, assertEqual, assertTrue, assertThrows } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { createModule } from '../../js/core/template-module.js';
import { defineModel, command, number } from '../../js/core/model.js';
import { defineGesture } from '../../js/core/interaction/define.js';

const Counter = defineModel({
  fields: { x: number({ integer: true }) },
  commands: {
    setX: command({ params: { x: number({ min: 0, max: 3, integer: true }) }, run({ x }) { this.x = x; } }),
  },
});

const ID = 'gesture-test';
const TPL_KEY = `js/modules/${ID}/${ID}.html`;

const stepRight = defineGesture({
  kind: 'move',
  handle: '.gt-h',
  start() { return { x: this.model.x }; },
  locate() { return null; },
  step(pos, dir) { return { x: pos.x + dir.x }; },
  preview(pos) { this.previewed = pos; },
  toCommand(from, to) { return ['setX', { x: to.x }]; },
});

function ensureTemplate() {
  if (!Alpine.version) Alpine.start();
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) return;
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', TPL_KEY);
  tpl.innerHTML = '<div x-data="gestureTest"><button type="button" class="gt-h" data-id="h">h</button><span class="gt-x" x-text="model.x"></span></div>';
  document.body.append(tpl);
}

function makeModule(gestures = [stepRight]) {
  return createModule({
    config: { id: ID, engine: 'alpine', phase: 'define', templateUrl: new URL(TPL_KEY, document.baseURI).href },
    Model: Counter,
    gestures,
    data: () => ({ previewed: null }),
  });
}

function fakeContext(saved, events, notes) {
  return {
    instanceId: 'gt-1',
    stateManager: { getModuleState: () => saved, setModuleState: () => {} },
    i18n: { t: (k) => k, tf: () => (k) => k, getLanguage: () => 'de' },
    eventBus: { on: () => {}, emit: (name, payload) => events.push([name, payload]) },
    notify: (m, type) => notes.push([m, type]),
    theme: 'light',
    language: 'de',
  };
}

const mounted = [];
const flush = () => new Promise((r) => setTimeout(r, 0));

async function mount(saved = { x: 0 }) {
  ensureTemplate();
  while (mounted.length) mounted.pop().remove();
  const events = [];
  const notes = [];
  const mod = makeModule();
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  await mod.init(container, fakeContext(saved, events, notes));
  return { mod, container, events, notes };
}

const altRight = (c) => c.querySelector('.gt-h').dispatchEvent(
  new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true }));
const space = (c) => c.querySelector('.gt-h').dispatchEvent(
  new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
const executed = (events) => events.filter(([n]) => n === 'command:executed');

suite('createModule mit gestures', () => {
  test('hängt beim Mount an; Kommando auf dem reaktiven Model', async () => {
    const { container, events } = await mount();
    altRight(container);
    await flush();
    assertEqual(executed(events).length, 1);
    assertEqual(executed(events)[0][1].command, 'setX');
    assertEqual(container.querySelector('.gt-x').textContent, '1');
  });

  test('destroy löst die Geste', async () => {
    const { mod, container, events, notes } = await mount();
    const handle = container.querySelector('.gt-h');
    await mod.destroy();
    container.append(handle);
    // Eine noch angehängte Geste scheitert hier am fehlenden Viewmodel: der Fehler
    // entsteht beim Auflösen des Hosts und läuft als unbehandelter Listener-Fehler
    // auf window (nicht über notify) — beides wird geprüft.
    const errors = [];
    const onError = (e) => { errors.push(e.message); e.preventDefault(); };
    window.addEventListener('error', onError);
    try {
      altRight(container);
      await flush();
    } finally {
      window.removeEventListener('error', onError);
    }
    assertEqual(executed(events).length, 0);
    assertEqual(notes.length, 0);
    assertEqual(errors.length, 0, errors.join('; '));
  });

  test('nach onLanguageChange genau ein Kommando, auf dem neuen Viewmodel', async () => {
    const { mod, container, events } = await mount();
    mod.onLanguageChange();
    altRight(container);
    await flush();
    assertEqual(executed(events).length, 1);
    assertEqual(container.querySelector('.gt-x').textContent, '1');
  });

  test('Ablehnung → context.notify, Model unverändert', async () => {
    const { container, events, notes } = await mount({ x: 3 });
    altRight(container);
    await flush();
    assertEqual(executed(events).length, 0);
    assertEqual(notes.length, 1);
    assertEqual(notes[0][1], 'error');
    assertTrue(/invalid x 4/.test(notes[0][0]), notes[0][0]);
    assertEqual(container.querySelector('.gt-x').textContent, '3');
  });

  test('laufende Tastaturaufnahme: onLanguageChange bricht sie ab, die nächste Geste läuft', async () => {
    const { mod, container, events } = await mount();
    space(container);
    assertTrue(container.querySelector('[data-dragging]') !== null, 'aufgenommen');
    mod.onLanguageChange();
    altRight(container);
    await flush();
    assertEqual(executed(events).length, 1);
    assertEqual(container.querySelector('.gt-x').textContent, '1');
  });

  test('laufende Tastaturaufnahme: setState bricht sie ab, die nächste Geste läuft', async () => {
    const { mod, container, events } = await mount();
    space(container);
    mod.setState({ x: 2 });
    assertTrue(!container.querySelector('[data-dragging]'), 'nichts mehr aufgenommen');
    altRight(container);
    await flush();
    // Der Fake-stateManager verwirft setModuleState; der Neuaufbau liest x = 0.
    assertEqual(executed(events).length, 1);
    assertEqual(container.querySelector('.gt-x').textContent, '1');
  });

  test('gestures verlangen die Alpine-Engine', () => {
    assertThrows(() => createModule({
      config: { id: 'gesture-plain', phase: 'define' },
      Model: Counter,
      gestures: [stepRight],
    }), /createModule gesture-plain: gestures require the Alpine engine/);
  });

  test('gestures nimmt nur defineGesture-Ergebnisse', () => {
    assertThrows(() => makeModule([{ kind: 'move', handle: '.gt-h' }]), /createModule gesture-test: gestures\[0\] is not a defineGesture result/);
  });
});
