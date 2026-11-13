/**
 * Tests for modules/project-charter/domain/model.js — Vorgaben, Schema,
 * Invarianten (Ablehnung beim Schreiben, Reparatur beim Laden), hasContent.
 */
import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/project-charter/domain/model.js';
import { setFields } from '../../../js/core/model.js';

/** @param {() => void} fn @returns {any} */
function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

const SCHEMA = { _schema: { name: 'project-charter', version: '1.0' } };
const node = (id, pid = null, over = {}) => ({ id, title: id, desc: '', pid, ...over });
const goal = (id, over = {}) => ({ id, description: '', targetDate: '', metric: '', targetValue: '', achievementLevel: 0, ...over });
const saved = (over = {}) => ({
  ...SCHEMA, problemStatement: '', goals: [], orgChart: [],
  orgStyle: {
    nodeBg: '', nodeBorderColor: '', nodeBorderStyle: 'solid', nodeBorderWidth: 1, lineColor: '', lineStyle: 'solid', lineWidth: 2,
  },
  ...over,
});

suite('project-charter Model — Vorgaben', () => {
  test('leeres Model hat die Vorgaben', () => {
    const s = new State();
    assertEqual(s.problemStatement, '');
    assertDeepEqual(s.goals, []);
    assertDeepEqual(s.orgChart, []);
    assertDeepEqual(s.orgStyle, {
      nodeBg: '', nodeBorderColor: '', nodeBorderStyle: 'solid', nodeBorderWidth: 1, lineColor: '', lineStyle: 'solid', lineWidth: 2,
    });
  });
  test('toJSON hat die gespeicherten Schlüssel und _schema 1.0', () => {
    const j = new State().toJSON();
    assertDeepEqual(Object.keys(j).sort(), ['_schema', 'goals', 'orgChart', 'orgStyle', 'problemStatement']);
    assertEqual(j._schema.version, '1.0');
  });
  test('fromJSON(null/undefined/{}) liefert gültigen Leerstand', () => {
    for (const v of [null, undefined, {}]) {
      const s = State.fromJSON(v);
      assertDeepEqual(s.goals, []);
      assertEqual(s.orgStyle.lineWidth, 2);
    }
  });
  test('Rundreise erhält Daten, Stilschlüssel nur wenn gesetzt', () => {
    const raw = saved({
      problemStatement: 'Ein **Problem**',
      goals: [goal('g1', { description: 'D', targetDate: '2026-01-01', achievementLevel: 50 })],
      orgChart: [node('n1'), node('n2', 'n1', { bg: '#abc', borderStyle: 'dashed', borderWidth: 3 })],
    });
    const j = State.fromJSON(raw).toJSON();
    assertDeepEqual({ ...j, _schema: raw._schema }, raw);
    assertDeepEqual(Object.keys(j.orgChart[0]).sort(), ['desc', 'id', 'pid', 'title']);
  });
  test('Altform ohne _schema wird migriert', () => {
    const s = State.fromJSON({ problemStatement: '<b>x</b>', goals: [{ id: 'g', text: 'T' }], orgChart: [], orgStyle: { bgColor: '#fff' } });
    assertEqual(s.problemStatement, '**x**');
    assertEqual(s.goals[0].description, 'T');
    assertEqual(s.orgStyle.nodeBg, '#fff');
  });
});

suite('project-charter Model — hasContent', () => {
  test('leer false, mit Problem, Ziel oder Knoten true', () => {
    assertEqual(new State().hasContent(), false);
    assertEqual(State.fromJSON(saved({ problemStatement: 'x' })).hasContent(), true);
    assertEqual(State.fromJSON(saved({ goals: [goal('g')] })).hasContent(), true);
    assertEqual(State.fromJSON(saved({ orgChart: [node('n')] })).hasContent(), true);
  });
});

suite('project-charter Model — Schema', () => {
  test('Problembeschreibung: 10 000 Klartextzeichen mit Fettdruck gültig, 10 001 abgelehnt', () => {
    const s = new State();
    setFields(s, { problemStatement: `**${'a'.repeat(10000)}**` });
    const e = thrown(() => setFields(s, { problemStatement: 'a'.repeat(10001) }));
    assert(e, 'Ablehnung');
    assertEqual(s.problemStatement.length, 10004);
  });
  test('A9: achievementLevel 101 und -1 werden über setFields abgelehnt', () => {
    const s = new State();
    assert(thrown(() => setFields(s, { goals: [goal('g', { achievementLevel: 101 })] })));
    assert(thrown(() => setFields(s, { goals: [goal('g', { achievementLevel: -1 })] })));
    setFields(s, { goals: [goal('g', { achievementLevel: 100 })] });
    assertEqual(s.goals[0].achievementLevel, 100);
  });
  test('Knoten-borderStyle und orgStyle-Aufzählungen', () => {
    const s = new State();
    assert(thrown(() => setFields(s, { orgChart: [node('a', null, { borderStyle: 'solid' })] })));
    setFields(s, { orgChart: [node('a', null, { borderStyle: 'dotted' })] });
    assert(thrown(() => setFields(s, { orgStyle: { ...s.orgStyle, nodeBorderStyle: '' } })));
    assert(thrown(() => setFields(s, { orgStyle: { ...s.orgStyle, lineStyle: 'wavy' } })));
    assert(thrown(() => setFields(s, { orgStyle: { ...s.orgStyle, lineWidth: 9 } })));
    assert(thrown(() => setFields(s, { orgChart: [node('a', null, { borderWidth: 9 })] })));
  });
});

suite('project-charter Model — Invarianten', () => {
  test('noCycles: Schreiben mit Zyklus wird abgelehnt', () => {
    const s = State.fromJSON(saved({ orgChart: [node('a'), node('b', 'a')] }));
    const e = thrown(() => setFields(s, { orgChart: [node('a', 'b'), node('b', 'a')] }));
    assert(e, 'Ablehnung');
    assertEqual(e.invariant, 'noCycles');
    assertEqual(s.orgChart[0].pid, null);
  });
  test('noCycles: Knoten, der sein eigener Elternknoten ist, wird abgelehnt', () => {
    const s = new State();
    const e = thrown(() => setFields(s, { orgChart: [node('a', 'a')] }));
    assert(e);
    assert(/noCycles/.test(`${e.message} ${e.invariant}`));
  });
  test('noCycles: Laden mit Zyklus repariert, alle Knoten bleiben', () => {
    const reports = [];
    const s = State.fromJSON(saved({ orgChart: [node('a', 'b'), node('b', 'a'), node('c', 'b')] }), { repair: true, onRepair: (n) => reports.push(n) });
    assertEqual(s.orgChart.length, 3);
    assertEqual(s.orgChart.filter((n) => n.pid === null).length, 1);
    assert(reports.length > 0);
    const byId = new Map(s.orgChart.map((n) => [n.id, n]));
    for (const n of s.orgChart) {
      let p = n; let steps = 0;
      while (p.pid !== null && steps++ < 10) p = byId.get(p.pid);
      assertEqual(p.pid, null);
    }
  });
  test('validParents: unbekannte pid wird beim Schreiben abgelehnt, beim Laden Wurzel', () => {
    const s = new State();
    const e = thrown(() => setFields(s, { orgChart: [node('a', 'nope')] }));
    assert(e);
    assert(/validParents/.test(`${e.message} ${e.invariant}`));
    const l = State.fromJSON(saved({ orgChart: [node('a', 'nope')] }), { repair: true });
    assertEqual(l.orgChart[0].pid, null);
  });
  test('uniqueIds: doppelte Zielid und Knotenid werden abgelehnt bzw. beim Laden vergeben', () => {
    const s = new State();
    assert(thrown(() => setFields(s, { goals: [goal('g'), goal('g')] })));
    assert(thrown(() => setFields(s, { orgChart: [node('a'), node('a')] })));
    const l = State.fromJSON(saved({ goals: [goal('g'), goal('g')], orgChart: [node('a'), node('a')] }), { repair: true });
    assertEqual(new Set(l.goals.map((g) => g.id)).size, 2);
    assertEqual(new Set(l.orgChart.map((n) => n.id)).size, 2);
  });
  test('Zieldatum: auch Freitext ist setzbar und bleibt beim Laden erhalten', () => {
    const s = new State();
    setFields(s, { goals: [goal('g', { targetDate: 'KW 23' })] });
    assertEqual(s.goals[0].targetDate, 'KW 23');
    const l = State.fromJSON(saved({ goals: [goal('g', { targetDate: 'bald' })] }), { onRepair: () => { throw new Error('repair'); } });
    assertEqual(l.goals[0].targetDate, 'bald');
  });
});
