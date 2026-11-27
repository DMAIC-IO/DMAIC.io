/**
 * Tests für core/agent/agent-read-mixin.js — `readAgentState()`, der
 * Projektor hinter dem eigenen `read()` der Altform-Module.
 */
import { suite, test, beforeAll, afterAll, assertEqual, assertDeepEqual, assertThrows } from '../../test-utils.js';
import { readAgentState } from '../../../js/core/agent/agent-read-mixin.js';
import { AGENT_REGISTRY } from '../../../js/core/agent/agent-registry.generated.js';

// Zwei synthetische Registry-Einträge statt echter Module (die bei ihrer
// Umstellung `readAgentState` verlassen): einer mit einem Baum-Massenfeld
// (bulk: true, kind 'tree') neben einem gewöhnlichen Feld, und einer mit
// Worksheet-Form (title/columns/rows), um readAgentState()s
// TABELLEN-Optionen (fields, rows) real zu prüfen, statt sie nur zu
// behaupten — spiegelt die Form, die agent-read.test.js für
// projectReadState selbst benutzt.
const TREE_MODULE_ID = '__agent-read-mixin-test-tree__';
const TREE_SCHEMA = {
  vocs: { type: 'object[]', help: '', bulk: true, bulkKind: 'tree' },
  styles: { type: 'object', help: '', bulk: false },
};
const BULK_MODULE_ID = '__agent-read-mixin-test-bulk__';
const BULK_SCHEMA = {
  title: { type: 'string', help: '', bulk: false },
  columns: { type: 'object[]', help: '', bulk: false },
  rows: { type: 'any[][]', help: '', bulk: true },
};

suite('readAgentState', () => {
  beforeAll(() => {
    AGENT_REGISTRY[BULK_MODULE_ID] = { fields: BULK_SCHEMA };
    AGENT_REGISTRY[TREE_MODULE_ID] = { fields: TREE_SCHEMA };
  });
  afterAll(() => {
    delete AGENT_REGISTRY[BULK_MODULE_ID];
    delete AGENT_REGISTRY[TREE_MODULE_ID];
  });

  test('projiziert den Stand durch das Registry-Schema', () => {
    // `vocs` ist ein Massenfeld (bulk tree) — ohne options.fields kommt nur
    // der Umfang, kein leeres Array.
    const state = readAgentState(TREE_MODULE_ID, { vocs: [], styles: { a: 1 }, _idCounter: 7 }, undefined);
    assertDeepEqual(state.styles, { a: 1 });
    assertDeepEqual(state.vocs, { $bulk: true, kind: 'tree', nodeCount: 0, depth: 0 });
    assertEqual('_idCounter' in state, false);
  });

  test('eine unbekannte Modul-Id ergibt ein leeres Objekt und wirft nicht', () => {
    assertDeepEqual(readAgentState('does-not-exist', { a: 1 }, undefined), {});
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
    // `vocs` ist ein Massenfeld: ohne `fields` kommt nur der Umfang, kein
    // Array. Die Vollform holt genau dieser Aufruf ab.
    const live = { vocs: [{ id: 1 }] };
    const state = readAgentState(TREE_MODULE_ID, live, { fields: ['vocs'] });
    state.vocs[0].id = 99;
    assertEqual(live.vocs[0].id, 1);
  });

  test('ein leerer Stand ergibt die leere Projektion, ohne undefined-Schlüssel', () => {
    // Das Schema hat zwei Felder (vocs, styles); über einem LEEREN Stand
    // projiziert FEHLT jedes von beiden. Kämen sie als `undefined` durch,
    // wäre der Driftvergleich (Schlüssel von read() == erklärte Felder)
    // unfällbar.
    assertEqual(Object.keys(readAgentState(TREE_MODULE_ID, {}, undefined)).length, 0);
  });
});
