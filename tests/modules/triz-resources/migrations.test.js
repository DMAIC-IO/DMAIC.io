/**
 * Tests for modules/triz-resources/domain/migrations.js — Schritt '0→1.0'
 * für Stände ohne `_schema`: wie das alte `State.fromJSON` (System Text oder
 * leer; je bekannter Zelle mit Wert Notiz Text oder leer und Füllstand aus
 * der Liste oder `unknown`, sonst Vorgabe; Fremdes entfällt).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { from0 } from '../../../js/modules/triz-resources/domain/migrations.js';

const CATS = ['substance', 'field', 'space', 'time', 'info', 'function'];
const LVLS = ['sub', 'sys', 'super'];
const STATS = ['unknown', 'unused', 'partial', 'full'];
const emptyCells = () => Object.fromEntries(CATS.map((c) => [c, Object.fromEntries(LVLS.map((l) => [l, { notes: '', status: 'unknown' }]))]));
const EMPTY = { system: '', cells: emptyCells() };

/** Vollständiger Stand: jede Zelle mit eigener Notiz, Füllstände reihum. */
const FULL = {
  system: 'Bandförderer',
  cells: Object.fromEntries(CATS.map((c, ci) => [c, Object.fromEntries(LVLS.map((l, li) => [
    l, { notes: `${c}/${l}${li === 1 ? '\nzweite Zeile' : ''}`, status: STATS[(ci + li) % 4] },
  ]))])),
};

/** @param {unknown} cell Eintrag für `field.sys` */
const fieldSys = (cell) => from0({ cells: { field: { sys: cell } } }).cells.field.sys;

suite('triz-resources Migration 0→1.0', () => {
  test('vollständiger Stand bleibt zeichengleich, in gespeicherter Reihenfolge', () => {
    assertEqual(JSON.stringify(from0(JSON.parse(JSON.stringify(FULL)))), JSON.stringify(FULL));
  });
  test('Kategorien, Ebenen und Zellschlüssel in fremder Reihenfolge kommen geordnet heraus', () => {
    const reversed = Object.fromEntries(Object.entries(FULL.cells).reverse()
      .map(([c, lv]) => [c, Object.fromEntries(Object.entries(lv).reverse()
        .map(([l, cell]) => [l, { status: cell.status, notes: cell.notes }]))]));
    const out = from0({ cells: reversed, system: FULL.system });
    assertEqual(JSON.stringify(out), JSON.stringify(FULL));
  });
  test('Notiz kein Text → leer, der Füllstand bleibt', () => {
    for (const notes of [42, null, { a: 1 }, ['x'], true, undefined]) {
      assertDeepEqual(fieldSys({ notes, status: 'partial' }), { notes: '', status: 'partial' }, JSON.stringify(notes));
    }
  });
  test('Füllstand außerhalb der Liste → unknown, die Notiz bleibt', () => {
    for (const status of ['halb', 'FULL', '', 0, null, undefined, ['full']]) {
      assertDeepEqual(fieldSys({ notes: 'n', status }), { notes: 'n', status: 'unknown' }, JSON.stringify(status));
    }
  });
  test('jeder gültige Füllstand bleibt', () => {
    for (const status of STATS) assertEqual(fieldSys({ status }).status, status);
  });
  test('Zelle null, fehlend oder falsy → Vorgabe', () => {
    for (const cell of [null, undefined, 0, '', false]) {
      assertDeepEqual(fieldSys(cell), { notes: '', status: 'unknown' }, JSON.stringify(cell));
    }
    assertDeepEqual(from0({ cells: { field: {} } }).cells.field.sys, { notes: '', status: 'unknown' });
  });
  test('Zelle als Wert ohne Felder (Text, Zahl, true) → Vorgabe wie in der Altform', () => {
    for (const cell of ['x', 7, true, []]) {
      assertDeepEqual(fieldSys(cell), { notes: '', status: 'unknown' }, JSON.stringify(cell));
    }
  });
  test('fremde Kategorie, Ebene und Zellschlüssel entfallen, fehlende werden Vorgabe', () => {
    const out = from0({
      system: 'S',
      cells: {
        energy: { sub: { notes: 'weg', status: 'full' } },
        field: { mid: { notes: 'weg', status: 'full' }, sys: { notes: 'n', status: 'full', extra: 1 } },
      },
    });
    const expected = { system: 'S', cells: emptyCells() };
    expected.cells.field.sys = { notes: 'n', status: 'full' };
    assertEqual(JSON.stringify(out), JSON.stringify(expected));
  });
  test('Kategorie kein Objekt → ihre Zellen als Vorgabe', () => {
    for (const cat of [null, 'x', 7, ['a']]) {
      assertDeepEqual(from0({ cells: { field: cat } }).cells.field, emptyCells().field, JSON.stringify(cat));
    }
  });
  test('System kein Text → leer', () => {
    for (const system of [42, null, { a: 1 }, ['x']]) assertEqual(from0({ system }).system, '');
  });
  test('fremde Schlüssel außerhalb von system und cells entfallen', () => {
    assertDeepEqual(from0({ ...FULL, extra: 1, _version: '0.0' }), FULL);
  });
  test('cells kein Objekt (auch Liste) → alle Zellen als Vorgabe', () => {
    for (const cells of [null, 'x', 7, true, ['a'], []]) {
      assertDeepEqual(from0({ system: 'S', cells }), { ...EMPTY, system: 'S' }, JSON.stringify(cells));
    }
  });
  test('leeres Objekt und Nicht-Objekt → Vorgabe', () => {
    for (const v of [{}, null, undefined, 'x', 7, []]) assertDeepEqual(from0(v), EMPTY, JSON.stringify(v));
  });
  test('Ergebnis ist ein einfaches Objekt in Schlüsselreihenfolge', () => {
    const out = from0({});
    assertDeepEqual(Object.keys(out), ['system', 'cells']);
    assertDeepEqual(Object.keys(out.cells), CATS);
    assertDeepEqual(Object.keys(out.cells.info), LVLS);
    assertDeepEqual(Object.keys(out.cells.info.sys), ['notes', 'status']);
    assertEqual(Object.getPrototypeOf(out), Object.prototype);
    assertEqual(Object.getPrototypeOf(out.cells), Object.prototype);
    assertEqual(Object.getPrototypeOf(out.cells.info), Object.prototype);
    assertEqual(Object.getPrototypeOf(out.cells.info.sys), Object.prototype);
  });
});
