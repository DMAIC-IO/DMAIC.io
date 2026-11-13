/**
 * Tests for the commands of modules/project-charter/domain/model.js — Ziele,
 * Organigramm (Anlegen, Bearbeiten, Stil, Löschen, Umhängen) und die
 * Metadaten `confirm` und `current`.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/project-charter/domain/model.js';
import { confirmOf, currentOf } from '../../../js/core/model.js';

/** @param {() => void} fn @returns {any} der geworfene Fehler */
function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

const SCHEMA = { _schema: { name: 'project-charter', version: '1.0' } };
const node = (id, pid = null, over = {}) => ({ id, title: id, desc: '', pid, ...over });
const goal = (id) => ({ id, description: id, targetDate: '', metric: '', targetValue: '', achievementLevel: 0 });
const saved = (over = {}) => ({
  ...SCHEMA, problemStatement: '', goals: [], orgChart: [],
  orgStyle: {
    nodeBg: '', nodeBorderColor: '', nodeBorderStyle: 'solid', nodeBorderWidth: 1, lineColor: '', lineStyle: 'solid', lineWidth: 2,
  },
  ...over,
});
const load = (over) => State.fromJSON(saved(over));
const ids = (list) => list.map((x) => x.id);

suite('project-charter Kommandos — Ziele', () => {
  test('addGoal hängt ein leeres Ziel an und liefert die id', () => {
    const m = new State();
    const id = m.addGoal();
    assertEqual(typeof id, 'string');
    assertDeepEqual(m.goals, [{ id, description: '', targetDate: '', metric: '', targetValue: '', achievementLevel: 0 }]);
    assertEqual(m.addGoal() !== id, true);
  });

  test('removeGoal entfernt; unbekannte id → param id', () => {
    const m = load({ goals: [goal('a'), goal('b')] });
    m.removeGoal({ id: 'a' });
    assertDeepEqual(ids(m.goals), ['b']);
    assertEqual(thrown(() => m.removeGoal({ id: 'x' }))?.param, 'id');
  });

  test('moveGoal vor ein Ziel, beforeId null ans Ende, unbekannte id → param', () => {
    const m = load({ goals: [goal('a'), goal('b'), goal('c')] });
    m.moveGoal({ id: 'c', beforeId: 'a' });
    assertDeepEqual(ids(m.goals), ['c', 'a', 'b']);
    m.moveGoal({ id: 'c', beforeId: null });
    assertDeepEqual(ids(m.goals), ['a', 'b', 'c']);
    m.moveGoal({ id: 'b', beforeId: 'b' });
    assertDeepEqual(ids(m.goals), ['a', 'b', 'c']);
    assertEqual(thrown(() => m.moveGoal({ id: 'x', beforeId: null }))?.param, 'id');
    assertEqual(thrown(() => m.moveGoal({ id: 'a', beforeId: 'x' }))?.param, 'beforeId');
  });
});

suite('project-charter Kommandos — addOrgNode', () => {
  test('legt Wurzel und Kind an, trimmt, liefert die id', () => {
    const m = new State();
    const r = m.addOrgNode({ title: '  Chef ' });
    const c = m.addOrgNode({ title: 'Team', desc: ' d ', parentId: r });
    assertDeepEqual(m.orgChart, [
      { id: r, title: 'Chef', desc: '', pid: null },
      { id: c, title: 'Team', desc: 'd', pid: r },
    ]);
  });

  test('leerer Titel, 101 Zeichen, desc 301 Zeichen → param; Grenzen 100/300 gültig', () => {
    const m = new State();
    assertEqual(thrown(() => m.addOrgNode({ title: '' }))?.param, 'title');
    assertEqual(thrown(() => m.addOrgNode({ title: '   ' }))?.param, 'title');
    assertEqual(thrown(() => m.addOrgNode({ title: 'x'.repeat(101) }))?.param, 'title');
    assertEqual(thrown(() => m.addOrgNode({ title: 't', desc: 'y'.repeat(301) }))?.param, 'desc');
    assertEqual(thrown(() => m.addOrgNode({ title: 't', parentId: 'nein' }))?.param, 'parentId');
    assertEqual(m.orgChart.length, 0);
    m.addOrgNode({ title: 'x'.repeat(100), desc: 'y'.repeat(300) });
    assertEqual(m.orgChart.length, 1);
  });
});

suite('project-charter Kommandos — updateOrgNode, setOrgNodeStyle', () => {
  test('ohne Stilschlüssel bleibt der Knoten auf erben', () => {
    const m = load({ orgChart: [node('a')] });
    m.updateOrgNode({ id: 'a', title: 'Neu', desc: 'D' });
    assertEqual(m.orgChart[0].title, 'Neu');
    assertEqual(m.orgChart[0].desc, 'D');
    assertEqual(m.orgChart[0].borderStyle, '');
    assertEqual(m.orgChart[0].borderWidth, 0);
    assertEqual(m.orgChart[0].bg, '');
  });

  test('setzt Stil; solid → "", Breite 1 → 0; fehlender Schlüssel setzt zurück', () => {
    const m = load({ orgChart: [node('a')] });
    m.updateOrgNode({ id: 'a', title: 'A', bg: '#abc', borderColor: '#def', borderStyle: 'dashed', borderWidth: 3 });
    assertDeepEqual(
      [m.orgChart[0].bg, m.orgChart[0].borderColor, m.orgChart[0].borderStyle, m.orgChart[0].borderWidth],
      ['#abc', '#def', 'dashed', 3],
    );
    m.updateOrgNode({ id: 'a', title: 'A', borderStyle: 'solid', borderWidth: 1 });
    assertDeepEqual(
      [m.orgChart[0].bg, m.orgChart[0].borderStyle, m.orgChart[0].borderWidth],
      ['', '', 0],
    );
  });

  test('Ablehnungen: unbekannte id, leerer Titel, zu lang, ungültiger Stil', () => {
    const m = load({ orgChart: [node('a')] });
    assertEqual(thrown(() => m.updateOrgNode({ id: 'x', title: 'A' }))?.param, 'id');
    assertEqual(thrown(() => m.updateOrgNode({ id: 'a', title: '' }))?.param, 'title');
    assertEqual(thrown(() => m.updateOrgNode({ id: 'a', title: 'x'.repeat(101) }))?.param, 'title');
    assertEqual(thrown(() => m.updateOrgNode({ id: 'a', title: 'A', desc: 'y'.repeat(301) }))?.param, 'desc');
    assertEqual(thrown(() => m.updateOrgNode({ id: 'a', title: 'A', borderStyle: 'wavy' }))?.param, 'borderStyle');
    assertEqual(thrown(() => m.updateOrgNode({ id: 'a', title: 'A', borderWidth: 9 }))?.param, 'borderWidth');
    assertEqual(m.orgChart[0].title, 'a');
  });

  test('current liefert die Vorbelegung, Stilschlüssel leer = erben', () => {
    const m = load({ orgChart: [node('a', null, { title: 'T', desc: 'D' }), node('b', null, { bg: '#abc', borderStyle: 'dotted', borderWidth: 4, borderColor: '#111' })] });
    assertDeepEqual(currentOf(m, 'updateOrgNode', { id: 'a' }), {
      title: 'T', desc: 'D', bg: '', borderColor: '', borderStyle: '', borderWidth: 0,
    });
    assertDeepEqual(currentOf(m, 'updateOrgNode', { id: 'b' }), {
      title: 'b', desc: '', bg: '#abc', borderColor: '#111', borderStyle: 'dotted', borderWidth: 4,
    });
  });

  test('setOrgNodeBorderWidth: Zahl 3 gilt, 0 und 1 erben, 9 und Text abgelehnt', () => {
    const m = load({ orgChart: [node('a')] });
    m.setOrgNodeBorderWidth({ id: 'a', value: 3 });
    assertEqual(m.orgChart[0].borderWidth, 3);
    m.setOrgNodeBorderWidth({ id: 'a', value: 1 });
    assertEqual(m.orgChart[0].borderWidth, 0);
    m.setOrgNodeBorderWidth({ id: 'a', value: 8 });
    m.setOrgNodeBorderWidth({ id: 'a', value: 0 });
    assertEqual(m.orgChart[0].borderWidth, 0);
    assertEqual(thrown(() => m.setOrgNodeBorderWidth({ id: 'a', value: 9 }))?.param, 'value');
    assertEqual(thrown(() => m.setOrgNodeBorderWidth({ id: 'a', value: 'drei' }))?.param, 'value');
    assertEqual(thrown(() => m.setOrgNodeBorderWidth({ id: 'x', value: 3 }))?.param, 'id');
  });

  test('setOrgNodeStyle lehnt borderWidth ab (param key)', () => {
    const m = load({ orgChart: [node('a')] });
    assertEqual(thrown(() => m.setOrgNodeStyle({ id: 'a', key: 'borderWidth', value: '3' }))?.param, 'key');
  });

  test('setOrgNodeStyle: Linienart solid → "", Farben, Ablehnungen', () => {
    const m = load({ orgChart: [node('a')] });
    m.setOrgNodeStyle({ id: 'a', key: 'borderStyle', value: 'dashed' });
    assertEqual(m.orgChart[0].borderStyle, 'dashed');
    m.setOrgNodeStyle({ id: 'a', key: 'borderStyle', value: 'solid' });
    assertEqual(m.orgChart[0].borderStyle, '');
    m.setOrgNodeStyle({ id: 'a', key: 'bg', value: '#123' });
    m.setOrgNodeStyle({ id: 'a', key: 'borderColor', value: '#456' });
    assertDeepEqual([m.orgChart[0].bg, m.orgChart[0].borderColor], ['#123', '#456']);
    assertEqual(thrown(() => m.setOrgNodeStyle({ id: 'a', key: 'borderStyle', value: 'wavy' }))?.param, 'value');
    assertEqual(thrown(() => m.setOrgNodeStyle({ id: 'a', key: 'color', value: 'x' }))?.param, 'key');
    assertEqual(thrown(() => m.setOrgNodeStyle({ id: 'x', key: 'bg', value: 'x' }))?.param, 'id');
  });
});

suite('project-charter Kommandos — removeOrgNode', () => {
  test('entfernt den Teilbaum und liefert die Anzahl', () => {
    const m = load({ orgChart: [node('r'), node('a', 'r'), node('b', 'a'), node('c', 'r'), node('z')] });
    assertEqual(m.removeOrgNode({ id: 'a' }), 2);
    assertDeepEqual(ids(m.orgChart), ['r', 'c', 'z']);
    assertEqual(m.removeOrgNode({ id: 'r' }), 2);
    assertDeepEqual(ids(m.orgChart), ['z']);
    assertEqual(thrown(() => m.removeOrgNode({ id: 'x' }))?.param, 'id');
  });

  test('confirm fragt mit dem Titel; unbekannte id wirft vor der Frage', () => {
    const m = load({ orgChart: [node('a', null, { title: 'Chef' })] });
    assertDeepEqual(confirmOf(m, 'removeOrgNode', { id: 'a' }), { key: 'orgDeleteConfirm', params: { name: 'Chef' } });
    assertEqual(thrown(() => confirmOf(m, 'removeOrgNode', { id: 'x' }))?.param, 'id');
  });
});

suite('project-charter Kommandos — moveOrgNode', () => {
  const tree = () => load({ orgChart: [node('r'), node('a', 'r'), node('b', 'a'), node('c', 'r'), node('d', 'r'), node('z')] });

  test('auf den eigenen Nachfahren oder sich selbst → param parentId, nichts geändert', () => {
    const m = tree();
    const before = JSON.stringify(m.orgChart);
    assertEqual(thrown(() => m.moveOrgNode({ id: 'a', parentId: 'b', index: null }))?.param, 'parentId');
    assertEqual(thrown(() => m.moveOrgNode({ id: 'r', parentId: 'b', index: 0 }))?.param, 'parentId');
    assertEqual(thrown(() => m.moveOrgNode({ id: 'a', parentId: 'a', index: null }))?.param, 'parentId');
    assertEqual(JSON.stringify(m.orgChart), before);
  });

  test('unbekannte id, unbekannter Elternknoten, index außerhalb → param', () => {
    const m = tree();
    assertEqual(thrown(() => m.moveOrgNode({ id: 'x', parentId: null, index: null }))?.param, 'id');
    assertEqual(thrown(() => m.moveOrgNode({ id: 'a', parentId: 'x', index: null }))?.param, 'parentId');
    assertEqual(thrown(() => m.moveOrgNode({ id: 'a', parentId: 'z', index: 2 }))?.param, 'index');
    assertEqual(thrown(() => m.moveOrgNode({ id: 'a', parentId: 'z', index: -1 }))?.param, 'index');
  });

  test('index null hängt ans Ende der neuen Geschwister', () => {
    const m = tree();
    m.moveOrgNode({ id: 'a', parentId: 'z', index: null });
    assertEqual(m.orgChart.find((n) => n.id === 'a').pid, 'z');
    m.moveOrgNode({ id: 'c', parentId: 'z', index: null });
    assertDeepEqual(ids(m.orgChart).filter((i) => ['a', 'c'].includes(i)), ['a', 'c']);
    m.moveOrgNode({ id: 'b', parentId: null, index: null });
    assertDeepEqual(ids(m.orgChart.filter((n) => n.pid === null)), ['r', 'z', 'b']);
  });

  test('Endindex unter den neuen Geschwistern ohne den Knoten selbst', () => {
    const m = tree();
    // Kinder von r: a, c, d. c an Index 0 → c, a, d.
    m.moveOrgNode({ id: 'c', parentId: 'r', index: 0 });
    assertDeepEqual(ids(m.orgChart.filter((n) => n.pid === 'r')), ['c', 'a', 'd']);
    // a an Index 1 unter den übrigen (c, d) → c, a, d bleibt
    m.moveOrgNode({ id: 'a', parentId: 'r', index: 1 });
    assertDeepEqual(ids(m.orgChart.filter((n) => n.pid === 'r')), ['c', 'a', 'd']);
    // a an Index 2 (= Ende) → c, d, a
    m.moveOrgNode({ id: 'a', parentId: 'r', index: 2 });
    assertDeepEqual(ids(m.orgChart.filter((n) => n.pid === 'r')), ['c', 'd', 'a']);
    // in die Mitte unter einen anderen Elternknoten, Teilbaum zieht mit
    m.moveOrgNode({ id: 'a', parentId: null, index: 0 });
    assertDeepEqual(ids(m.orgChart.filter((n) => n.pid === null)), ['a', 'r', 'z']);
    assertEqual(m.orgChart.find((n) => n.id === 'b').pid, 'a');
  });

  test('Knoten ohne Geschwister: nur der Elternknoten ändert sich', () => {
    const m = tree();
    m.moveOrgNode({ id: 'b', parentId: 'z', index: 0 });
    assertEqual(m.orgChart.find((n) => n.id === 'b').pid, 'z');
    assertEqual(m.orgChart.length, 6);
  });
});
