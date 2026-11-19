/**
 * Tests for modules/triz-function-analysis/domain/migrations.js — Schritt
 * '0→1.0' für Altdaten ohne `_schema`: Kosten, Lagen auf unbekannte ids,
 * Rohform-Reinigung; alle übrigen Felder bleiben.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { from0 } from '../../../js/modules/triz-function-analysis/domain/migrations.js';
import { State } from '../../../js/modules/triz-function-analysis/domain/model.js';

const comp = (id, over = {}) => ({ id, name: id, kind: 'system', note: '', cost: null, ...over });
const fn = (id, carrier, object, over = {}) => ({
  id, carrier, verb: 'v', object, parameter: 'p', type: 'useful', level: 'adequate', note: 'n', ...over,
});

suite('triz-function-analysis Migration 0→1.0', () => {
  test('Kosten: Text, negativ, NaN, fehlend → null; Zahl ≥ 0 bleibt', () => {
    const out = from0({
      components: ['24,5', -1, NaN, undefined, '5', 0, 7.5].map((cost, i) => comp(`c${i}`, { cost })),
    });
    assertDeepEqual(out.components.map((c) => c.cost), [null, null, null, null, null, 0, 7.5]);
  });
  test('Lagen und Beschriftungen auf unbekannte ids entfallen', () => {
    const out = from0({
      components: [comp('x', { kind: 'target' }), comp('y')],
      functions: [fn('f1', 'y', 'x')],
      positions: { x: { x: 5, y: 6 }, gone: { x: 1, y: 1 } },
      labels: { f1: { x: 7, y: 8 }, gone: { x: 1, y: 1 } },
    });
    assertDeepEqual(out.positions, { x: { x: 5, y: 6 } });
    assertDeepEqual(out.labels, { f1: { x: 7, y: 8 } });
  });
  test('alle übrigen Felder bleiben', () => {
    const old = {
      components: [comp('x', { kind: 'target', name: 'X', note: 'Notiz', cost: 3 }), comp('y', { kind: 'supersystem' })],
      interactions: [{ a: 'x', b: 'y' }],
      exclusions: [{ a: 'q', b: 'x' }],
      functions: [fn('f1', 'y', 'x', { type: 'harmful', level: null }), fn('f2', 'x', 'y', { level: 'excessive' })],
      positions: { y: { x: 10, y: 20 } },
      labels: { f2: { x: 30, y: 40 } },
      activeTab: 'model',
      showRanks: true,
    };
    assertDeepEqual(from0(JSON.parse(JSON.stringify(old))), old);
  });
  test('Rohform: fehlende Texte leer, unbekannte Art system, unbekannter Typ useful, ungültige Stufe null', () => {
    const out = from0({
      components: [{ id: 'z', name: 7, kind: 'bogus' }],
      functions: [{ id: 'f', carrier: 'z', object: 'q', type: 'weird', level: 'huge' }],
    });
    assertDeepEqual(out.components, [{ id: 'z', name: '', kind: 'system', note: '', cost: null }]);
    assertDeepEqual(out.functions, [{
      id: 'f', carrier: 'z', verb: '', object: 'q', parameter: '', type: 'useful', level: null, note: '',
    }]);
  });
  test('kein Objekt oder keine Listen → leere Listen', () => {
    for (const v of [null, 'x', { components: 'x' }]) {
      const out = from0(v);
      assertDeepEqual([out.components, out.interactions, out.exclusions, out.functions], [[], [], [], []]);
    }
  });
});

suite('triz-function-analysis Migration — mit dem Model (Altvertrag fromJSON)', () => {
  test('Altdaten ohne _schema werden migriert und repariert wie früher', () => {
    const m = State.fromJSON({
      components: [
        { id: 'x', name: 'X', kind: 'target' },
        { id: 'y', name: 'Y', kind: 'target' },
        { id: 'z', name: 7, kind: 'bogus' },
        { name: 'no id', kind: 'system' },
      ],
      interactions: [{ a: 'y', b: 'x' }, { a: 'x', b: 'y' }, { a: 'x', b: 'x' }, { a: 'x', b: 'gone' }],
      functions: [
        { id: 'f1', carrier: 'x', object: 'gone', type: 'harmful', level: 'excessive' },
        { id: 'f2', carrier: 'y', object: 'x', type: 'useful', level: 'huge' },
        { id: 'f3', carrier: 'y', object: 'x', type: 'weird' },
        { carrier: 'x', object: 'y' },
      ],
      positions: { x: { x: 5, y: 6 }, gone: { x: 1, y: 1 }, y: { x: 'a', y: 2 } },
      labels: { f2: { x: 7, y: 8 }, gone: { x: 1, y: 1 }, f3: { x: 1, y: null } },
      activeTab: 'nope',
    }, { repair: true });
    assertDeepEqual(m.components.map((c) => [c.id, c.name, c.kind]),
      [['x', 'X', 'target'], ['y', 'Y', 'system'], ['z', '', 'system']]);
    assertDeepEqual(m.interactions, [{ a: 'x', b: 'y' }]);
    assertDeepEqual(m.functions.map((f) => [f.id, f.carrier, f.object, f.type, f.level]), [
      ['f1', 'x', '', 'harmful', null],
      ['f2', 'y', 'x', 'useful', 'adequate'],
      ['f3', 'y', 'x', 'useful', 'adequate'],
    ]);
    assertDeepEqual(m.positions, { x: { x: 5, y: 6 } });
    assertDeepEqual(m.labels, { f2: { x: 7, y: 8 } });
    assertEqual(m.activeTab, 'components');
  });
  test('Kosten der Altform: ungültig → null, Rundreise erhält sie', () => {
    const comps = [-3, '5', NaN, undefined, 7].map((cost, i) => ({ id: `c${i}`, name: '', kind: 'system', note: '', cost }));
    const m = State.fromJSON({ components: comps }, { repair: true });
    assertDeepEqual(m.components.map((c) => c.cost), [null, null, null, null, 7]);
    assertEqual(State.fromJSON(m.toJSON()).components[4].cost, 7);
  });
  test('showRanks nur bei true, Müll ergibt einen leeren Stand', () => {
    assertEqual(State.fromJSON({ showRanks: 'yes' }, { repair: true }).showRanks, false);
    assertEqual(State.fromJSON({ showRanks: true }, { repair: true }).showRanks, true);
    assertEqual(State.fromJSON(null).components.length, 0);
    assertEqual(State.fromJSON('x').components.length, 0);
    assertEqual(State.fromJSON({ components: 'x' }, { repair: true }).components.length, 0);
  });
  test('Reiter valueCost bleibt', () => {
    assertEqual(State.fromJSON({ activeTab: 'valueCost' }, { repair: true }).activeTab, 'valueCost');
  });
});
