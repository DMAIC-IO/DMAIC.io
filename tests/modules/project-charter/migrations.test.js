/**
 * Tests for modules/project-charter/domain/migrations.js — Schritt '0→1.0'
 * aus allen Altformen (rekursives Organigramm, Ziel { id, text, status },
 * Alt-Stilschlüssel, Alt-HTML), die Beispiele und die goldenen Fixtures.
 */
import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { from0 } from '../../../js/modules/project-charter/domain/migrations.js';
import { State } from '../../../js/modules/project-charter/domain/model.js';
import { resolveDateOffset } from '../../../js/core/date-offset.js';

const EXAMPLES = new URL('../../../js/modules/project-charter/resources/examples/projects/', import.meta.url);
const FIXTURES = new URL('../../fixtures/exports/', import.meta.url);

/** @param {URL} base @param {string} file @returns {Promise<any>} */
async function fetchJSON(base, file) {
  const res = await fetch(new URL(file, base), { cache: 'no-cache' });
  return res.json();
}

/** Datumsangaben eines Beispiels wie beim Laden auflösen. @param {any} data @returns {any} */
function resolveDates(data) {
  const out = JSON.parse(JSON.stringify(data));
  for (const g of out.goals ?? []) g.targetDate = resolveDateOffset(g.targetDate);
  return out;
}

/** Alle Charter-Zustände (Objekte mit `orgChart`) in einem Export. @param {any} v @param {any[]} [acc] @returns {any[]} */
function charterStates(v, acc = []) {
  if (Array.isArray(v)) v.forEach((x) => charterStates(x, acc));
  else if (v && typeof v === 'object') {
    if (Array.isArray(v.orgChart) && Array.isArray(v.goals)) acc.push(v);
    else Object.values(v).forEach((x) => charterStates(x, acc));
  }
  return acc;
}

suite('project-charter Migration — Beispiele', () => {
  for (const file of ['charter-pizza-lieferzeit.json', 'project-charter-hubschrauber-flyer.json']) {
    test(`${file}: lädt ohne Reparatur, Felder unverändert`, async () => {
      const raw = resolveDates(await fetchJSON(EXAMPLES, file));
      const reports = [];
      const m = State.fromJSON(raw, { onRepair: (name) => reports.push(name) });
      assertDeepEqual(reports, []);
      assertEqual(m.problemStatement, raw.problemStatement);
      assertDeepEqual(m.goals, raw.goals);
      assertDeepEqual(m.orgChart, raw.orgChart);
      assertDeepEqual(m.orgStyle, { ...m.orgStyle, ...raw.orgStyle });
    });
  }
});

suite('project-charter Migration — goldene Fixtures', () => {
  const files = [
    'v0.2.0_all_projects.json', 'v0.2.0_single_project.json', 'v0.3.0_all_projects.json', 'v0.3.0_single_project.json',
    'v0.5.0_8d_project.json', 'v0.9.0_single_project.json', 'v1.0.0_single_project.json', 'v1.1.0_single_project.json',
    'v1.2.0_single_project.json', 'v1.3.0_single_project.json', 'v1.4.0_single_project.json', 'v1.5.0_single_project.json',
  ];
  for (const file of files) {
    test(`${file}: alle Charter-Zustände laden ohne Wurf`, async () => {
      const states = charterStates(await fetchJSON(FIXTURES, file));
      for (const s of states) {
        const m = State.fromJSON(s);
        assertEqual(m.goals.length, s.goals.length);
        assertEqual(m.orgChart.length, s.orgChart.length);
        for (const g of m.goals) assertEqual(typeof g.id, 'string');
      }
    });
  }
  test('Ziel { id, text, status } wird { description }, status entfällt', async () => {
    const states = charterStates(await fetchJSON(FIXTURES, 'v1.5.0_single_project.json'));
    const s = states.find((x) => x.goals.some((g) => 'text' in g));
    assert(s, 'Fixture mit Alt-Ziel gefunden');
    const m = State.fromJSON(s);
    assertEqual(m.goals[0].description, s.goals[0].text);
    assert(!('status' in m.goals[0]) && !('text' in m.goals[0]));
  });
});

suite('project-charter Migration — Altformen', () => {
  test('rekursives orgChart mit zwei Wurzeln wird flach, Reihenfolge bleibt', () => {
    const out = from0({
      orgChart: [
        { id: 'a', title: 'A', description: 'dA', children: [{ id: 'a1', title: 'A1', children: [{ id: 'a1x', title: 'X' }] }, { id: 'a2', title: 'A2' }] },
        { id: 'b', title: 'B', children: [{ id: 'b1', title: 'B1' }] },
      ],
    });
    assertDeepEqual(out.orgChart.map((n) => [n.id, n.pid]), [
      ['a', null], ['a1', 'a'], ['a1x', 'a1'], ['a2', 'a'], ['b', null], ['b1', 'b'],
    ]);
    assertEqual(out.orgChart[0].desc, 'dA');
    assert(!('description' in out.orgChart[0]));
    assert(!('children' in out.orgChart[0]));
    State.fromJSON(out);
  });

  test('Knoten ohne id bekommt eine id, Kinder zeigen darauf', () => {
    const out = from0({ orgChart: [{ title: 'A', children: [{ title: 'B' }] }] });
    assert(typeof out.orgChart[0].id === 'string' && out.orgChart[0].id !== '');
    assertEqual(out.orgChart[1].pid, out.orgChart[0].id);
  });

  test('Ziel { id, text, status } → { description }, ohne id → uid()', () => {
    const out = from0({ goals: [{ id: 'g1', text: 'T', status: 'open' }, { text: 'U' }] });
    assertDeepEqual(out.goals[0], { id: 'g1', description: 'T', targetDate: '', metric: '', targetValue: '', achievementLevel: 0 });
    assert(typeof out.goals[1].id === 'string' && out.goals[1].id !== '');
    assertEqual(out.goals[1].description, 'U');
  });

  test('achievementLevel 150 → 100, -3 → 0, Text → 0', () => {
    const out = from0({ goals: [{ id: 'a', achievementLevel: 150 }, { id: 'b', achievementLevel: -3 }, { id: 'c', achievementLevel: 'x' }] });
    assertDeepEqual(out.goals.map((g) => g.achievementLevel), [100, 0, 0]);
  });

  test('orgStyle: Altschlüssel, Breite 12 → 8, fremder Schlüssel weg', () => {
    const out = from0({ orgStyle: { bgColor: '#fff', borderColor: '#000', borderWidth: 12, foo: 1 } });
    assertEqual(out.orgStyle.nodeBg, '#fff');
    assertEqual(out.orgStyle.nodeBorderColor, '#000');
    assertEqual(out.orgStyle.nodeBorderWidth, 8);
    assert(!('foo' in out.orgStyle) && !('bgColor' in out.orgStyle));
    assertEqual(out.orgStyle.lineWidth, 2);
    assertEqual(out.orgStyle.nodeBorderStyle, 'solid');
    State.fromJSON(out);
  });

  test('orgStyle: Breite 0 → 1, Text → Vorgabe', () => {
    const out = from0({ orgStyle: { nodeBorderWidth: 0, lineWidth: 'x' } });
    assertEqual(out.orgStyle.nodeBorderWidth, 1);
    assertEqual(out.orgStyle.lineWidth, 2);
  });

  test('verwaiste pid → Wurzel', () => {
    const out = from0({ orgChart: [{ id: 'a', title: 'A', desc: '', pid: 'gone' }] });
    assertEqual(out.orgChart[0].pid, null);
  });

  test('Alt-HTML <b>x</b> → **x**', () => {
    assertEqual(from0({ problemStatement: '<b>x</b>' }).problemStatement, '**x**');
  });

  test('Knotenstil: nur gesetzte Schlüssel, solid und Breite 1 entfallen, Breite begrenzt', () => {
    const out = from0({ orgChart: [
      { id: 'a', title: 'A', bg: '#abc', borderStyle: 'solid', borderWidth: 1 },
      { id: 'b', title: 'B', borderStyle: 'dashed', borderWidth: 20 },
    ] });
    assertDeepEqual(Object.keys(out.orgChart[0]).sort(), ['bg', 'desc', 'id', 'pid', 'title']);
    assertEqual(out.orgChart[1].borderStyle, 'dashed');
    assertEqual(out.orgChart[1].borderWidth, 8);
  });

  test('leere und fremde Eingaben ergeben den Leerstand', () => {
    for (const bad of [null, undefined, 5, 'x', []]) {
      const out = from0(bad);
      assertEqual(out.problemStatement, '');
      assertDeepEqual(out.goals, []);
      assertDeepEqual(out.orgChart, []);
      assertEqual(out.orgStyle.lineWidth, 2);
    }
  });

  test('Ziele: fremde Schlüssel entfallen, Text-Felder werden Text', () => {
    const out = from0({ goals: [{ id: 'a', description: 'D', foo: 1, metric: 5 }, 'x', null] });
    assertEqual(out.goals.length, 1);
    assert(!('foo' in out.goals[0]));
    assertEqual(out.goals[0].metric, '');
  });
});
