/**
 * Tests für core/agent/agent-read-mixin.js — das EINE read(), das Spec §9
 * Migrationsschritt 3 an jedem Viewmodel verlangt. Einmal geschrieben statt
 * 72-mal: der Generator löst den Spread auf und sieht Marke und Schema des
 * Mixin-Mitglieds.
 */
import { suite, test, beforeAll, afterAll, assertEqual, assertDeepEqual, assertThrows } from '../../test-utils.js';
import { agentReadMixin, readAgentState } from '../../../js/core/agent/agent-read-mixin.js';
import { AGENT_REGISTRY } from '../../../js/core/agent/agent-registry.generated.js';

/** Eine Alpine-Komponente, soweit das Mixin sie braucht. */
function componentFor(moduleId, modelJson) {
  const mixin = agentReadMixin({ id: moduleId });
  return { ...mixin, model: { toJSON: () => modelJson } };
}

// Seit Task 5 deklariert `five-why.nodes` ein Massenfeld (bulk: true, kind
// 'tree') — aber um readAgentState()s TABELLEN-Optionen (fields, rows) real
// zu prüfen, statt sie nur zu behaupten, registrieren wir hier zusätzlich
// einen synthetischen Eintrag mit Worksheet-Form (title/columns/rows),
// spiegelt die Form, die agent-read.test.js für projectReadState selbst
// benutzt.
const BULK_MODULE_ID = '__agent-read-mixin-test-bulk__';
const BULK_SCHEMA = {
  title: { type: 'string', help: '', bulk: false },
  columns: { type: 'object[]', help: '', bulk: false },
  rows: { type: 'any[][]', help: '', bulk: true },
};

suite('agent read mixin', () => {
  beforeAll(() => { AGENT_REGISTRY[BULK_MODULE_ID] = { fields: BULK_SCHEMA }; });
  afterAll(() => { delete AGENT_REGISTRY[BULK_MODULE_ID]; });

  test('read() projects the model JSON through the registry schema', () => {
    // five-why ist nach Task 5 freigegeben; bis dahin liefert die Registry
    // für das Modul bereits `fields`, auch ohne Freigabe. `nodes` ist seit
    // Task 5 selbst ein Massenfeld (@agentBulk tree) — ohne
    // options.fields kommt nur der Umfang, kein leeres Array mehr.
    const component = componentFor('five-why', { problem: 'P', nodes: [], _idCounter: 7 });
    const state = component.read();
    assertEqual(state.problem, 'P');
    assertDeepEqual(state.nodes, { $bulk: true, kind: 'tree', nodeCount: 0, depth: 0 });
    assertEqual('_idCounter' in state, false);
  });

  test('read() of an unknown module id yields an empty object, it does not throw', () => {
    const component = componentFor('does-not-exist', { a: 1 });
    assertDeepEqual(component.read(), {});
  });

  test('readAgentState without options replaces a bulk field with a descriptor', () => {
    const snapshot = { title: 'T', columns: [{ name: 'a' }, { name: 'b' }], rows: [[1, 2], [3, 4], [5, 6]] };
    const state = readAgentState(BULK_MODULE_ID, snapshot, undefined);
    assertEqual(state.title, 'T');
    assertDeepEqual(state.rows, { $bulk: true, kind: 'table', rowCount: 3, columns: ['a', 'b'] });
  });

  test('readAgentState with options.fields delivers the named bulk field in full', () => {
    const snapshot = { title: 'T', columns: [{ name: 'a' }, { name: 'b' }], rows: [[1, 2], [3, 4], [5, 6]] };
    const state = readAgentState(BULK_MODULE_ID, snapshot, { fields: ['rows'] });
    assertDeepEqual(state.rows, [[1, 2], [3, 4], [5, 6]]);
  });

  test('readAgentState with options.rows truncates the bulk field and sets the $range sibling', () => {
    const snapshot = { title: 'T', columns: [{ name: 'a' }, { name: 'b' }], rows: [[1, 2], [3, 4], [5, 6]] };
    const state = readAgentState(BULK_MODULE_ID, snapshot, { fields: ['rows'], rows: { from: 1, to: 2 } });
    assertDeepEqual(state.rows, [[3, 4]]);
    assertDeepEqual(state['rows$range'], { from: 1, to: 2, rowCount: 3 });
  });

  test('readAgentState wirft bei einem kaputten Bereich, statt den Fehler als Lesezustand zu liefern', () => {
    // `projectReadState` ist rein und kennt `i18n` nicht — es GIBT den Fehler
    // als `{ $error, $message }` ZURÜCK. Käme der so beim Agenten an, sähe er
    // wie Daten aus. `readAgentState` wirft ihn deshalb: der Fang-Punkt von
    // `instance.call` (agent-ops.js) macht daraus `call_failed` samt Meldung.
    const snapshot = { title: 'T', columns: [{ name: 'a' }], rows: [[1], [2], [3]] };
    assertThrows(
      () => readAgentState(BULK_MODULE_ID, snapshot, { fields: ['rows'], rows: { from: 5, to: 2 } }),
      /rows\.from \(5\) is greater than rows\.to \(2\)/,
    );
  });

  test('readAgentState wirft auch bei einem halben Bereich (from ohne to)', () => {
    // `{ from: 100 }` heißt „gib mir ab Zeile 100" und ist eine plausible
    // Anfrage. Sie kam als leere Zeilenliste zurück, und der Agent hielt das
    // für eine Aussage über die DATEN statt über seinen AUFRUF.
    const snapshot = { title: 'T', columns: [{ name: 'a' }], rows: [[1], [2], [3]] };
    assertThrows(
      () => readAgentState(BULK_MODULE_ID, snapshot, { fields: ['rows'], rows: { from: 100 } }),
      /rows\.to/,
    );
  });

  test('readAgentState never hands out a reference into the live state', () => {
    // `nodes` ist seit Task 5 ein Massenfeld: ohne `fields` kommt nur der
    // Umfang, kein Array. Die Vollform holt genau dieser Aufruf ab.
    const live = { problem: 'P', nodes: [{ id: 1 }] };
    const state = readAgentState('five-why', live, { fields: ['nodes'] });
    state.nodes[0].id = 99;
    assertEqual(live.nodes[0].id, 1);
  });

  test('read() returns the empty-snapshot projection when the model has no toJSON', () => {
    const mixin = agentReadMixin({ id: 'five-why' });
    const component = { ...mixin, model: null };
    // five-why's Schema hat zwei Felder (problem, nodes), beide nicht bulk;
    // über einem LEEREN Snapshot projiziert FEHLT jedes von beiden. Vorher
    // kamen sie als `undefined` durch — und genau das machte den
    // Driftvergleich der Pilotmodule (Schlüssel von read() == erklärte
    // Felder) unfällbar.
    assertDeepEqual(component.read(), {});
    assertEqual(Object.keys(component.read()).length, 0);
  });
});
