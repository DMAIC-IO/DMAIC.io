/**
 * Direktiven x-async-task* — Sichtbarkeit, Sperre, Status, Fortschritt, Fehler, Anker.
 */
import { suite, test, assertEqual, assertTrue, assertThrows } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { createModule } from '../../js/core/template-module.js';
import { asyncTask } from '../../js/core/async-task.js';
import { defineModel, number } from '../../js/core/model.js';
import { registerAsyncTaskDirectives } from '../../js/core/async-task-directives.js';

const Doc = defineModel({ fields: { a: number({ default: 1 }) } });
const ID = 'task-dir';
const TPL_KEY = `js/modules/${ID}/${ID}.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const i18n = { t: (k, p) => (p ? `${k}:${JSON.stringify(p)}` : k), tf: () => (k) => k, getLanguage: () => 'de' };
const control = { gate: null, report: null, fail: false };

function ensure() {
  if (!Alpine.version) { registerAsyncTaskDirectives(Alpine, { i18n }); Alpine.start(); }
  else registerAsyncTaskDirectives(Alpine, { i18n });
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) return;
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', TPL_KEY);
  tpl.innerHTML = `<div x-data="taskDir">
    <div class="box" x-async-task="calc">
      <button class="start" x-async-task-start data-arg-n="2">go</button>
      <button class="cancel" x-async-task-cancel>stop</button>
      <progress class="prog" x-async-task-progress></progress>
      <p class="err" x-async-task-error></p>
    </div>
  </div>`;
  document.body.append(tpl);
}

async function mount() {
  ensure();
  const notified = [];
  const mod = createModule({
    config: { id: ID, engine: 'alpine', phase: 'define', templateUrl: new URL(TPL_KEY, document.baseURI).href },
    Model: Doc,
    asyncTasks: {
      calc: asyncTask({
        params: { n: number() },
        blocked() { return this.model.a < 0 ? 'negativ' : null; },
        async run({ n }, { signal, progress }) {
          control.report = progress;
          await new Promise((resolve, reject) => {
            control.gate = resolve;
            signal.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')));
          });
          if (control.fail) throw new Error('kaputt');
          return this.model.a + n;
        },
      }),
    },
    view() { return {}; },
  });
  const container = document.createElement('div');
  document.body.append(container);
  await mod.init(container, {
    instanceId: 'td-1',
    stateManager: { getModuleState: () => null, setModuleState: () => {}, getProjectCycle: () => 'dmaic', get: () => undefined },
    i18n, eventBus: { on: () => {}, off: () => {}, emit: () => {} },
    notify: (...a) => notified.push(a), dialog: { confirm: async () => true }, theme: 'light', language: 'de',
  });
  await flush();
  const $ = (s) => container.querySelector(s);
  return { mod, container, notified, $, vm: () => Alpine.$data(container.querySelector('[x-data]')) };
}

suite('x-async-task', () => {
  test('Ruhe: Abbrechen, Fortschritt, Fehler verborgen; Anker gesetzt', async () => {
    const { $, mod, container } = await mount();
    assertEqual($('.cancel').hidden, true);
    assertEqual($('.prog').hidden, true);
    assertEqual($('.err').hidden, true);
    assertEqual($('.box').hasAttribute('data-running'), false);
    assertEqual($('.start').disabled, false);
    assertEqual($('.start').getAttribute('data-help-key'), `modules.${ID}.asyncTasks.calc.help`);
    assertEqual($('.cancel').getAttribute('data-help-key'), `modules.${ID}.asyncTasks.calc.cancel.help`);
    await mod.destroy(); container.remove();
  });

  test('Lauf: gesperrt, aria-busy, data-running, unbestimmter Fortschritt, dann Wert', async () => {
    control.fail = false;
    const { $, vm, mod, container } = await mount();
    $('.start').click(); await flush();
    assertEqual($('.start').disabled, true);
    assertEqual($('.box').getAttribute('aria-busy'), 'true');
    assertTrue($('.box').hasAttribute('data-running'));
    assertEqual($('.cancel').hidden, false);
    assertEqual($('.prog').hidden, false);
    assertEqual($('.prog').hasAttribute('value'), false, 'unbestimmt ohne value');
    control.report(0.25); await flush();
    assertEqual($('.prog').value, 0.25);
    control.gate(); await flush(); await flush();
    assertEqual(vm().calc, 3);
    assertEqual($('.box').hasAttribute('aria-busy'), false);
    assertEqual($('.prog').hidden, true);
    await mod.destroy(); container.remove();
  });

  test('Abbrechen-Knopf bricht ab, kein Fehler sichtbar', async () => {
    const { $, mod, container } = await mount();
    $('.start').click(); await flush();
    $('.cancel').click(); await flush();
    assertEqual($('.start').disabled, false);
    assertEqual($('.err').hidden, true);
    await mod.destroy(); container.remove();
  });

  test('blocked(): gesperrt, Grund im title', async () => {
    const { $, vm, mod, container } = await mount();
    vm().model.a = -1; await flush();
    assertEqual($('.start').disabled, true);
    assertEqual($('.start').title, 'negativ');
    vm().model.a = 1; await flush();
    assertEqual($('.start').disabled, false);
    assertEqual($('.start').hasAttribute('title'), false);
    await mod.destroy(); container.remove();
  });

  test('Fehler: Anzeige und Meldung', async () => {
    control.fail = true;
    const { $, notified, mod, container } = await mount();
    $('.start').click(); await flush();
    control.gate(); await flush(); await flush();
    assertEqual($('.err').hidden, false);
    assertEqual($('.err').textContent, 'kaputt');
    assertEqual(notified.length, 1);
    control.fail = false;
    await mod.destroy(); container.remove();
  });
});

/** Komponente mit Stub-Griff, ohne Modul — für Fehlbindungen. */
function stubMount(html, { auto = false } = {}) {
  registerAsyncTaskDirectives(Alpine, { i18n });
  if (!Alpine.version) Alpine.start();
  const name = `taskStub${++stubN}`;
  Alpine.data(name, () => {
    const comp = { _asyncTasks: { calc: { running: false, progress: null, error: null, value: null } } };
    Object.defineProperty(comp, '_ui', { enumerable: false, get: () => ({ moduleId: 'stub', notify() {}, i18n }) });
    Object.defineProperty(comp, '_asyncTaskHost', {
      enumerable: false,
      get: () => ({
        isAuto: () => auto,
        params: (n) => {
          if (n !== 'calc') throw new Error(`invalid asyncTask ${n}; allowed: calc`);
          return {};
        },
        blockedReason: () => null, start: async () => ({ status: 'done' }), cancel: () => false,
      }),
    });
    return comp;
  });
  const host = document.createElement('div');
  const root = document.createElement('div');
  root.setAttribute('x-data', name);
  root.innerHTML = html;
  host.append(root);
  Alpine.initTree(host);
}
let stubN = 0;

suite('x-async-task Fehlbindungen', () => {
  test('Würfe beim Aufbau', () => {
    assertThrows(() => stubMount('<div x-async-task="calc"><span x-async-task-start></span></div>'), /x-async-task-start must sit on a <button>, got <span>/);
    assertThrows(() => stubMount('<button x-async-task-start>x</button>'), /x-async-task-start needs an enclosing x-async-task/);
    assertThrows(() => stubMount('<div x-async-task="nope"></div>'), /invalid asyncTask nope; allowed: calc/);
    assertThrows(() => stubMount('<div x-async-task="calc"><button x-async-task-start>x</button></div>', { auto: true }), /x-async-task-start: calc is an auto task/);
    assertThrows(() => stubMount('<div x-async-task="calc"><div x-async-task-progress></div></div>'), /x-async-task-progress must sit on a <progress>, got <div>/);
  });
});
