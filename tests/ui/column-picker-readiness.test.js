/**
 * ColumnPicker — `refresh()` im Vorladefenster: solange der Arbeitsblatt-Code
 * nicht geladen ist (`readSync` meldet `not_loaded`), heißt eine fehlende
 * Spalte „weiß ich nicht", nicht „gelöscht". Der Picker zeichnet nur und
 * verwirft keine gespeicherte Auswahl; nach dem Laden prüft er wie gewohnt.
 */
import { suite, test, assertEqual, assertDeepEqual, afterEach } from '../test-utils.js';
import { ColumnPicker } from '../../js/ui/column-picker.js';
import { registerWorksheetReader } from '../../js/core/worksheet-columns.js';
import { readWorksheetState } from '../../js/modules/worksheet/worksheet-read.js';

const REF_A = { instanceId: 'ws-1', sheetId: 's1', columnId: 'a' };
const REF_GONE = { instanceId: 'ws-1', sheetId: 's1', columnId: 'gone' };

/** Kontext mit einem Leser, der bis `loaded = true` wie `readSync` `not_loaded` wirft. */
function makeContext() {
  const ws = {
    sheets: [{ id: 's1', name: 'Eins', state: { rowCount: 3, columns: [
      { id: 'a', shortName: 'C1', type: 'numeric', values: [1, 2, 3] },
    ] } }],
  };
  const phases = { data: [{ moduleId: 'worksheet', instanceId: 'ws-1' }] };
  const handlers = [];
  const state = { loaded: false };
  const stateManager = {
    get(path) {
      if (path === 'phases') return phases;
      if (path.startsWith('phases.')) return phases[path.slice(7)] ?? [];
      return undefined;
    },
    getModuleState: (id) => (id === 'ws-1' ? ws : null),
  };
  registerWorksheetReader(stateManager, (id, options) => {
    if (!state.loaded) throw Object.assign(new Error('not_loaded'), { code: 'not_loaded' });
    return readWorksheetState(stateManager.getModuleState(id), options);
  });
  return {
    state,
    ctx: {
      stateManager,
      eventBus: {
        on: (n, fn) => handlers.push([n, fn]),
        off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
        emit: (n, p) => { for (const [a, f] of [...handlers]) if (a === n) f(p); },
      },
      i18n: { t: (k) => k },
    },
  };
}

let host;
let picker;

/** @param {object} options @returns {{ state: { loaded: boolean }, ctx: any, changes: any[] }} */
function mount(options) {
  const h = makeContext();
  const changes = [];
  host = document.createElement('div');
  document.body.appendChild(host);
  picker = new ColumnPicker(host, h.ctx, { ...options, onChange: (v) => changes.push(v) });
  return { ...h, changes };
}

suite('ColumnPicker — refresh im Vorladefenster (not_loaded)', () => {
  afterEach(() => {
    picker?.destroy(); picker = null;
    if (host) { host.remove(); host = null; }
  });

  test('single: nicht geladen → Auswahl bleibt, kein onChange', () => {
    const h = mount({ mode: 'single', types: ['numeric'] });
    picker.value = REF_A;
    picker.refresh();
    h.ctx.eventBus.emit('worksheet:dataChanged', { instanceId: 'ws-1' });
    h.ctx.eventBus.emit('state:saved');
    assertEqual(h.changes.length, 0);
    assertDeepEqual(picker.value, REF_A);
  });

  test('multi: nicht geladen → alle gespeicherten Schlüssel bleiben, kein onChange', () => {
    const h = mount({ mode: 'multi', types: ['numeric'] });
    picker.value = [REF_A, REF_GONE];
    picker.refresh();
    assertEqual(h.changes.length, 0);
    assertDeepEqual(picker.value, [REF_A, REF_GONE]);
  });

  test('nach dem Laden: refresh verwirft nur die wirklich fehlende Spalte und meldet es', () => {
    const h = mount({ mode: 'multi', types: ['numeric'] });
    picker.value = [REF_A, REF_GONE];
    picker.refresh();
    assertEqual(h.changes.length, 0);
    h.state.loaded = true;
    h.ctx.eventBus.emit('worksheet:dataChanged', { instanceId: 'ws-1', reason: 'preload' });
    assertEqual(h.changes.length, 1);
    assertDeepEqual(h.changes[0], [REF_A]);
    assertDeepEqual(picker.value, [REF_A]);
  });

  test('nach dem Laden: eine vorhandene Auswahl bleibt ohne onChange', () => {
    const h = mount({ mode: 'single', types: ['numeric'] });
    picker.value = REF_A;
    h.state.loaded = true;
    picker.refresh();
    assertEqual(h.changes.length, 0);
    assertDeepEqual(picker.value, REF_A);
    assertEqual(host.querySelector('select').value, 'ws-1|s1|a');
  });
});
