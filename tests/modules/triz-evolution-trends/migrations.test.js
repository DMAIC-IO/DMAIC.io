/**
 * Tests for modules/triz-evolution-trends/domain/migrations.js — Schritt
 * '0→1.0' für Stände ohne `_schema`: wie das alte `State.fromJSON` (Stufe als
 * Zahl, ganzzahlig in der Skala, sonst -1; Notiz Text oder leer; fehlende
 * Trends als Vorgabe, fremde entfallen).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { from0 } from '../../../js/modules/triz-evolution-trends/domain/migrations.js';

const IDS = ['aggregation', 'dynamism', 'scale', 'automation', 'completeness', 'controllability', 'matching', 'uneven'];
const EMPTY_TRENDS = Object.fromEntries(IDS.map((id) => [id, { stage: -1, notes: '' }]));
const EMPTY = { system: '', trends: EMPTY_TRENDS };

const FULL = {
  system: 'Scheinwerfer',
  trends: {
    aggregation: { stage: 3, notes: 'a' },
    dynamism: { stage: 4, notes: 'b' },
    scale: { stage: 0, notes: 'c' },
    automation: { stage: -1, notes: 'd' },
    completeness: { stage: 2, notes: 'e' },
    controllability: { stage: 1, notes: 'f' },
    matching: { stage: 2, notes: '  g\nh ' },
    uneven: { stage: -1, notes: 'i' },
  },
};

/** @param {Record<string, unknown>} entry Eintrag für `aggregation` */
const aggregation = (entry) => from0({ trends: { aggregation: entry } }).trends.aggregation;

suite('triz-evolution-trends Migration 0→1.0', () => {
  test('vollständiger Stand bleibt zeichengleich, in gespeicherter Reihenfolge', () => {
    const out = from0(JSON.parse(JSON.stringify(FULL)));
    assertEqual(JSON.stringify(out), JSON.stringify(FULL));
  });
  test('Trends in fremder Reihenfolge kommen in gespeicherter Reihenfolge heraus', () => {
    const reversed = Object.fromEntries(Object.entries(FULL.trends).reverse());
    const out = from0({ trends: reversed, system: FULL.system });
    assertDeepEqual(Object.keys(out), ['system', 'trends']);
    assertDeepEqual(Object.keys(out.trends), IDS);
    assertDeepEqual(out, FULL);
  });
  test('Stufe als Text "2" wird 2', () => {
    assertEqual(aggregation({ stage: '2', notes: '' }).stage, 2);
  });
  test('Stufe 2.5, -3, 9, Text, fehlend → -1', () => {
    for (const stage of [2.5, -3, 9, 'zwei', undefined]) {
      assertEqual(aggregation({ stage, notes: 'n' }).stage, -1, String(stage));
    }
    assertEqual(aggregation({ notes: 'n' }).stage, -1);
  });
  test('Randwerte: letzte Stufe bleibt, eine darüber wird -1', () => {
    const out = from0({ trends: { dynamism: { stage: 4 }, scale: { stage: 4 }, aggregation: { stage: -1 } } });
    assertEqual(out.trends.dynamism.stage, 4);
    assertEqual(out.trends.scale.stage, -1);
    assertEqual(out.trends.aggregation.stage, -1);
  });
  test('null als Stufe wird wie in der Altform 0 (Number(null))', () => {
    assertEqual(aggregation({ stage: null }).stage, 0);
  });
  test('uneven mit Stufe → -1, die Notiz bleibt', () => {
    const out = from0({ trends: { uneven: { stage: 0, notes: 'Bordnetz' } } });
    assertDeepEqual(out.trends.uneven, { stage: -1, notes: 'Bordnetz' });
  });
  test('uneven ohne Stufe (Beispieldatei) → -1', () => {
    assertDeepEqual(from0({ trends: { uneven: { notes: 'x' } } }).trends.uneven, { stage: -1, notes: 'x' });
  });
  test('Notiz kein Text → leer', () => {
    for (const notes of [42, null, { a: 1 }, ['x'], true]) {
      assertEqual(aggregation({ stage: 1, notes }).notes, '', JSON.stringify(notes));
    }
  });
  test('System kein Text → leer', () => {
    for (const system of [42, null, { a: 1 }, ['x']]) assertEqual(from0({ system }).system, '');
  });
  test('fremder Trend entfällt, fehlender wird Vorgabe', () => {
    const out = from0({ system: 'S', trends: { aggregation: { stage: 1, notes: 'a' }, foo: { stage: 1, notes: 'x' } } });
    assertDeepEqual(out, { system: 'S', trends: { ...EMPTY_TRENDS, aggregation: { stage: 1, notes: 'a' } } });
  });
  test('Trend-Eintrag null oder kein Objekt → Vorgabe', () => {
    for (const entry of [null, 0, '', 'x', 7]) assertDeepEqual(aggregation(entry), { stage: -1, notes: '' });
  });
  test('fremde Schlüssel außerhalb von system und trends entfallen', () => {
    assertDeepEqual(from0({ ...FULL, extra: 1 }), FULL);
  });
  test('trends kein Objekt → alle Trends als Vorgabe', () => {
    for (const trends of [null, 'x', 7, ['a']]) assertDeepEqual(from0({ system: 'S', trends }), { ...EMPTY, system: 'S' });
  });
  test('leeres Objekt und Nicht-Objekt → Vorgabe', () => {
    for (const v of [{}, null, undefined, 'x', 7, []]) assertDeepEqual(from0(v), EMPTY);
  });
  test('Ergebnis ist ein einfaches Objekt', () => {
    const out = from0({});
    assertEqual(Object.getPrototypeOf(out), Object.prototype);
    assertEqual(Object.getPrototypeOf(out.trends), Object.prototype);
    assertEqual(Object.getPrototypeOf(out.trends.uneven), Object.prototype);
  });
});
