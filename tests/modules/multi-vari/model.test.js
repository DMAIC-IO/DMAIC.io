import { suite, test, assert, assertEqual, assertDeepEqual, assertThrows } from '../../test-utils.js';
import { State } from '../../../js/modules/multi-vari/domain/model.js';
import { setFields, checkInvariantsAfter } from '../../../js/core/model.js';

const ref = (col) => ({ instanceId: 'ws1', sheetId: 's1', columnId: col });
const row = (id) => ({ id, ref: null });

/** Zustand mit gegebenen Faktorzeilen. @param {string[]} ids */
function withRows(ids) {
  const m = new State();
  setFields(m, { factors: ids.map(row) });
  return m;
}

suite('Multi-Vari Model — Vorgabe und Kommandos', () => {
  test('die Vorgabe hat zwei leere Zeilen und keinen Inhalt', () => {
    const s = new State();
    assertDeepEqual(s.factors, [{ id: 'f1', ref: null }, { id: 'f2', ref: null }]);
    assertEqual(s.hasContent(), false);
  });

  test('addFactor liefert die neue id; die fünfte Zeile wird abgelehnt', () => {
    const s = new State();
    const id = s.addFactor();
    assertEqual(s.factors.length, 3);
    assertEqual(s.factors[2].id, id);
    s.addFactor();
    const before = JSON.stringify(s.toJSON());
    let err;
    try { s.addFactor(); } catch (e) { err = e; }
    assertEqual(err?.invariant, 'factorCount');
    assertEqual(JSON.stringify(s.toJSON()), before);
  });

  test('removeFactor: bei zwei Zeilen abgelehnt, unbekannte id mit available', () => {
    const s = new State();
    let err;
    try { s.removeFactor({ id: 'f1' }); } catch (e) { err = e; }
    assertEqual(err?.invariant, 'factorCount');
    assertEqual(s.factors.length, 2);
    const t = withRows(['a', 'b', 'c']);
    assertThrows(() => t.removeFactor({ id: 'zz' }), /available: a, b, c/);
    t.removeFactor({ id: 'b' });
    assertDeepEqual(t.factors.map(f => f.id), ['a', 'c']);
  });

  test('moveFactor mit Endindex: [a,b,c] 0→2 ergibt [b,c,a]', () => {
    const s = withRows(['a', 'b', 'c']);
    s.moveFactor({ fromIdx: 0, toIdx: 2 });
    assertDeepEqual(s.factors.map(f => f.id), ['b', 'c', 'a']);
    s.moveFactor({ fromIdx: 2, toIdx: 0 });
    assertDeepEqual(s.factors.map(f => f.id), ['a', 'b', 'c']);
  });

  test('setFactorColumn setzt und löscht den Bezug', () => {
    const s = new State();
    s.setFactorColumn({ id: 'f2', ref: ref('x') });
    assertDeepEqual(s.factors[1].ref, ref('x'));
    s.setFactorColumn({ id: 'f2', ref: null });
    assertEqual(s.factors[1].ref, null);
    assertThrows(() => s.setFactorColumn({ id: 'nope', ref: null }), /available: f1, f2/);
  });
});

suite('Multi-Vari Model — Invarianten', () => {
  const strict = (rows) => ({ _schema: { version: '1.0' }, measurement: null, factors: rows, modelForm: 'nested', estimator: 'anova', showPoints: true, connectMeans: true, showGroupMean: true, showRefLine: true, exampleWorksheetId: null });
  const load1 = (rows) => {
    const reports = [];
    const m = State.fromJSON(strict(rows), { repair: true, onRepair: (n) => reports.push(n) });
    return { m, reports };
  };

  test('leere id bekommt eine neue', () => {
    const { m, reports } = load1([row(''), row('b')]);
    assert(m.factors[0].id !== '' && m.factors[0].id !== 'b');
    assert(reports.length > 0, 'onRepair meldet');
  });

  test('doppelte id: die spätere Zeile entfällt (dann Auffüllen auf zwei)', () => {
    const { m, reports } = load1([row('a'), row('a'), row('c')]);
    assertDeepEqual(m.factors.map(f => f.id), ['a', 'c']);
    assert(reports.length > 0);
  });

  test('sechs Zeilen werden vier', () => {
    const { m, reports } = load1(['a', 'b', 'c', 'd', 'e', 'f'].map(row));
    assertDeepEqual(m.factors.map(f => f.id), ['a', 'b', 'c', 'd']);
    assert(reports.length > 0);
  });

  test('eine Zeile wird zwei', () => {
    const { m, reports } = load1([row('a')]);
    assertEqual(m.factors.length, 2);
    assertEqual(m.factors[0].id, 'a');
    assert(m.factors[1].id !== '' && m.factors[1].id !== 'a');
    assert(reports.length > 0);
  });

  test('unrepariert wird der Zustand beim Laden abgelehnt', () => {
    let err;
    try { State.fromJSON(strict(['a', 'b', 'c', 'd', 'e'].map(row))); } catch (e) { err = e; }
    assertEqual(err?.invariant, 'factorCount');
  });

  test('Schreiben einer Dublette über factors[i].id wird abgelehnt', () => {
    const s = withRows(['a', 'b']);
    let err;
    try { checkInvariantsAfter(s, 'factors', () => { s.factors[1].id = 'a'; }); } catch (e) { err = e; }
    assertEqual(err?.invariant, 'factorIds');
    assertEqual(s.factors[1].id, 'b');
  });
});
