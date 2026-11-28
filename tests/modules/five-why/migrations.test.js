/**
 * Tests for modules/five-why/domain/migrations.js — '0→1.0' übernimmt jeden
 * Stand des alten `State.fromJSON`: Problemtext, Baum mit Ebene und
 * Elternverweis aus der Lage, `collapsed` als id-Liste, ohne `question` und
 * fremde Schlüssel; Nicht-Objekte entfallen samt Teilbaum, fehlende ids werden
 * ergänzt, Knoten unter Ebene 5 rücken als Geschwister auf Ebene 5. Dazu die
 * flache Altform der goldenen Fixtures, das Altprojekt und beide Beispiele
 * über das Model.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { from0 } from '../../../js/modules/five-why/domain/migrations.js';
import { State } from '../../../js/modules/five-why/domain/model.js';
import { allIds } from '../../../js/modules/five-why/domain/tree.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';

setModelName(State, 'five-why');

const SCHEMA = { _schema: { name: 'five-why', version: '1.0' } };
const FIXTURES = new URL('../../fixtures/exports/', import.meta.url);
const EXAMPLES = new URL('../../../js/modules/five-why/resources/examples/projects/', import.meta.url);
const json = (v) => JSON.stringify(v);
const plain = (v) => JSON.parse(JSON.stringify(v));

/** @param {URL} url @returns {Promise<any>} */
async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${url}: HTTP ${res.status}`);
  return res.json();
}

/** Laden mit Reparatur; meldet die reparierten Felder. @param {object} j */
function repaired(j) {
  const fields = [];
  const m = State.fromJSON(j, { repair: true, onRepair: (f) => fields.push(f) });
  return { m, fields };
}

/** Alle 5-Why-Zustände eines Exports (Instanzen mit moduleId `five-why`). @param {any} v @param {any[]} [acc] @returns {any[]} */
function fiveWhyStates(v, acc = []) {
  if (Array.isArray(v)) v.forEach((x) => fiveWhyStates(x, acc));
  else if (v && typeof v === 'object') {
    if (v.phases && v.moduleStates) {
      for (const list of Object.values(v.phases)) {
        for (const e of Array.isArray(list) ? list : []) {
          if (e?.moduleId === 'five-why') acc.push(v.moduleStates[e.instanceId] ?? e.state);
        }
      }
    }
    Object.values(v).forEach((x) => fiveWhyStates(x, acc));
  }
  return acc;
}

/** Ein Altknoten wie ihn `State.createNode` schrieb. */
function oldNode(id, level, parentId, answer, children = [], collapsed = false) {
  return { id, level, parentId, question: '', answer, children, collapsed };
}

/** Zustand der Instanz aus der Fixture „Altprojekt“ (`legacy-project.json`), ohne `_schema`. */
const LEGACY_OLD = {
  problem: 'Ölverlust an Linie 3 & Prüfstand <B> > Grenzwert',
  nodes: [
    oldNode(3, 1, null, 'Öl tropft aus der Ringleitung', [
      oldNode(7, 2, 3, 'Dichtung am Flansch ist spröde', [
        oldNode(8, 3, 7, 'Falscher Dichtungswerkstoff für 90 °C', [
          oldNode(12, 4, 8, 'Einkauf bestellt nach alter Stückliste\nÄnderung von 2024 nie eingepflegt', [
            oldNode(20, 5, 12, 'Kein Änderungsprozess für Stücklisten & Lieferantendaten'),
          ]),
        ]),
      ]),
      oldNode(11, 2, 3, ''),
    ]),
    oldNode(5, 1, null, 'Prüfstand meldet zu spät', [
      oldNode(6, 2, 5, 'Grenzwert < 2 bar ist zu weich eingestellt'),
    ], true),
  ],
};

/** Das Altprojekt nach '0→1.0'. */
const LEGACY_NEW = {
  problem: 'Ölverlust an Linie 3 & Prüfstand <B> > Grenzwert',
  nodes: [
    { id: 3, level: 1, parentId: null, answer: 'Öl tropft aus der Ringleitung', children: [
      { id: 7, level: 2, parentId: 3, answer: 'Dichtung am Flansch ist spröde', children: [
        { id: 8, level: 3, parentId: 7, answer: 'Falscher Dichtungswerkstoff für 90 °C', children: [
          { id: 12, level: 4, parentId: 8, answer: 'Einkauf bestellt nach alter Stückliste\nÄnderung von 2024 nie eingepflegt', children: [
            { id: 20, level: 5, parentId: 12, answer: 'Kein Änderungsprozess für Stücklisten & Lieferantendaten' },
          ] },
        ] },
      ] },
      { id: 11, level: 2, parentId: 3, answer: '', children: [] },
    ] },
    { id: 5, level: 1, parentId: null, answer: 'Prüfstand meldet zu spät', children: [
      { id: 6, level: 2, parentId: 5, answer: 'Grenzwert < 2 bar ist zu weich eingestellt', children: [] },
    ] },
  ],
  collapsed: [5],
};

/** Eine Altkette der Tiefe `depth` mit ids 1…depth und Antworten `A1`…. */
function chain(depth) {
  let child = [];
  for (let d = depth; d >= 1; d--) child = [oldNode(d, d, d > 1 ? d - 1 : null, `A${d}`, child)];
  return child;
}

suite('five-why Migration 0→1.0 — Grundfälle', () => {
  test('kein Objekt, {}, falsche Typen: leerer Stand', () => {
    const empty = { problem: '', nodes: [], collapsed: [] };
    for (const old of [null, undefined, 7, 'x', [], {}]) assertDeepEqual(from0(old), empty, json(old));
    assertDeepEqual(from0({ problem: 42, nodes: 'x' }), empty);
    assertDeepEqual(from0({ problem: null, nodes: { 0: oldNode(1, 1, null, 'a') } }), empty);
  });
  test('Altprojekt: Baum, Ebenen, Elternverweise, collapsed als Liste, ohne question', () => {
    assertEqual(json(from0(plain(LEGACY_OLD))), json(LEGACY_NEW));
  });
  test('Altprojekt über das Model: lädt streng, ohne Reparatur, gleich', () => {
    assertEqual(json(State.fromJSON(plain(LEGACY_OLD)).toJSON()), json({ ...SCHEMA, ...LEGACY_NEW }));
    const { fields } = repaired(plain(LEGACY_OLD));
    assertDeepEqual(fields, []);
  });
  test('fremde Schlüssel und question entfallen, auch am Stand', () => {
    const out = from0({ problem: 'P', extra: 1, _idCounter: 9, nodes: [{ ...oldNode(1, 1, null, 'a'), question: 'Q?', color: 'red' }] });
    assertEqual(json(out), json({ problem: 'P', nodes: [{ id: 1, level: 1, parentId: null, answer: 'a', children: [] }], collapsed: [] }));
  });
  test('Ebene und Elternverweis kommen aus der Lage, nicht aus der Datei', () => {
    const out = from0({ nodes: [oldNode(1, 4, 77, 'a', [oldNode(2, 1, null, 'b', [oldNode(3, 9, 1, 'c')])])] });
    assertDeepEqual(out.nodes, [{ id: 1, level: 1, parentId: null, answer: 'a', children: [
      { id: 2, level: 2, parentId: 1, answer: 'b', children: [{ id: 3, level: 3, parentId: 2, answer: 'c', children: [] }] },
    ] }]);
  });
  test('answer: Text bleibt (auch leer und mehrzeilig), sonst leer', () => {
    const out = from0({ nodes: [
      { id: 1, answer: 'x\ny' }, { id: 2, answer: '' }, { id: 3, answer: 5 }, { id: 4 }, { id: 5, answer: null },
    ] });
    assertDeepEqual(out.nodes.map((n) => n.answer), ['x\ny', '', '', '', '']);
  });
  test('children keine Liste wird [], Nicht-Objekte entfallen samt Teilbaum', () => {
    const out = from0({ nodes: [
      { id: 1, answer: 'a', children: 'x' },
      'kaputt', null, 4, [oldNode(9, 1, null, 'in Liste')],
      { id: 2, answer: 'b', children: [null, 'x', { id: 3, answer: 'c', children: { id: 4 } }] },
    ] });
    assertEqual(json(out.nodes), json([
      { id: 1, level: 1, parentId: null, answer: 'a', children: [] },
      { id: 2, level: 1, parentId: null, answer: 'b', children: [{ id: 3, level: 2, parentId: 2, answer: 'c', children: [] }] },
    ]));
  });
  test('collapsed: true wandert nach collapsed, Tiefe zuerst; false und andere Werte nicht', () => {
    const out = from0({ nodes: [
      oldNode(1, 1, null, '', [
        oldNode(2, 2, 1, '', [oldNode(5, 3, 2, '')], true),
        oldNode(3, 2, 1, '', [oldNode(6, 3, 3, '')], 'true'),
      ], true),
      oldNode(4, 1, null, '', [oldNode(7, 2, 4, '')], true),
    ] });
    assertDeepEqual(out.collapsed, [1, 2, 4]);
  });
  test('collapsed: true ohne Unterfragen entfällt', () => {
    const out = from0({ nodes: [
      oldNode(1, 1, null, '', [oldNode(2, 2, 1, '', [], true)], true),
      oldNode(3, 1, null, '', [], true),
      oldNode(4, 1, null, '', ['kaputt'], true),
    ] });
    assertDeepEqual(out.collapsed, [1]);
  });
  test('collapsed auf Ebene 5 entfällt (die Grundursache hat keine Unterfragen)', () => {
    const old = chain(5);
    old[0].children[0].children[0].children[0].children[0].collapsed = true;
    old[0].collapsed = true;
    assertDeepEqual(from0({ nodes: old }).collapsed, [1]);
  });
});

suite('five-why Migration 0→1.0 — ids', () => {
  test('ganzzahlige ids ab 1 bleiben, auch nicht fortlaufend', () => {
    assertDeepEqual(allIds(from0(plain(LEGACY_OLD)).nodes), [3, 7, 8, 12, 20, 11, 5, 6]);
  });
  test('fehlende oder ungültige ids bekommen eine neue hinter der größten, in Reihenfolge', () => {
    const out = from0({ nodes: [
      { answer: 'ohne' }, { id: 0, answer: 'null' }, { id: 4, answer: 'vier' }, { id: '7', answer: 'text' },
      { id: 2.5, answer: 'bruch' }, { id: -1, answer: 'negativ' },
    ] });
    assertDeepEqual(allIds(out.nodes), [5, 6, 4, 7, 8, 9]);
  });
  test('Ersatz weicht vorhandenen ids aus, auch tiefer im Baum', () => {
    const out = from0({ nodes: [{ answer: 'neu', children: [{ id: 30, answer: 'x' }] }, { id: 12 }] });
    assertDeepEqual(allIds(out.nodes), [31, 30, 12]);
  });
  test('doppelte ids bleiben in der Migration; das Laden mit Reparatur vergibt der späteren eine neue', () => {
    const old = { nodes: [oldNode(1, 1, null, 'a', [oldNode(2, 2, 1, 'b')]), oldNode(2, 1, null, 'c', [oldNode(3, 2, 2, 'd')])] };
    assertDeepEqual(allIds(from0(plain(old)).nodes), [1, 2, 2, 3]);
    const { m, fields } = repaired(plain(old));
    assertDeepEqual([...new Set(fields)], ['nodes']);
    assertDeepEqual(allIds(m.nodes), [1, 2, 4, 3]);
    assertEqual(m.nodes[1].children[0].parentId, 4);
    assertEqual(m.nodes[1].answer, 'c');
  });
});

suite('five-why Migration 0→1.0 — tiefer als Ebene 5', () => {
  test('Tiefe 7: Ebene 6 und 7 rücken als Geschwister hinter Ebene 5, Antworten bleiben', () => {
    const out = from0({ nodes: chain(7) });
    const l4 = out.nodes[0].children[0].children[0].children[0];
    assertEqual(json(l4.children), json([
      { id: 5, level: 5, parentId: 4, answer: 'A5' },
      { id: 6, level: 5, parentId: 4, answer: 'A6' },
      { id: 7, level: 5, parentId: 4, answer: 'A7' },
    ]));
    assertDeepEqual(allIds(out.nodes), [1, 2, 3, 4, 5, 6, 7]);
  });
  test('verzweigt unter Ebene 5: Tiefe zuerst, direkt hinter dem Vorfahren, vor seinem nächsten Geschwister', () => {
    const old = chain(4);
    const l4 = old[0].children[0].children[0].children[0];
    l4.children = [
      oldNode(10, 5, 4, 'X', [oldNode(11, 6, 10, 'X1', [oldNode(12, 7, 11, 'X11')]), oldNode(13, 6, 10, 'X2')]),
      oldNode(14, 5, 4, 'Y'),
    ];
    const out = from0({ nodes: old });
    const kids = out.nodes[0].children[0].children[0].children[0].children;
    assertDeepEqual(kids.map((n) => [n.id, n.level, n.parentId, n.answer]), [
      [10, 5, 4, 'X'], [11, 5, 4, 'X1'], [12, 5, 4, 'X11'], [13, 5, 4, 'X2'], [14, 5, 4, 'Y'],
    ]);
    assertTrue(kids.every((n) => !Object.hasOwn(n, 'children')));
  });
  test('lädt danach streng; die Statistik zählt jeden Knoten', () => {
    const m = State.fromJSON({ nodes: chain(7) });
    const { stats } = evaluateDerived(m, /** @type {any} */ (undefined), ['stats']);
    assertDeepEqual(stats, { totalNodes: 7, maxDepth: 5, branches: 2, answered: 7 });
  });
});

suite('five-why Migration 0→1.0 — flache Altform', () => {
  test('Baum aus parent, text wird answer, Reihenfolge der Quelle', () => {
    const out = from0({ problem: 'P', nodes: [
      { id: 1, level: 0, parent: 0, text: 'a' },
      { id: 2, level: 1, parent: 1, text: 'b' },
      { id: 3, level: 1, parent: 1, text: 'c' },
      { id: 4, level: 2, parent: 3, text: 'd' },
      { id: 5, level: 0, parent: 0, text: 'e' },
    ] });
    assertEqual(json(out), json({ problem: 'P', nodes: [
      { id: 1, level: 1, parentId: null, answer: 'a', children: [
        { id: 2, level: 2, parentId: 1, answer: 'b', children: [] },
        { id: 3, level: 2, parentId: 1, answer: 'c', children: [{ id: 4, level: 3, parentId: 3, answer: 'd', children: [] }] },
      ] },
      { id: 5, level: 1, parentId: null, answer: 'e', children: [] },
    ], collapsed: [] }));
  });
  test('Kind vor dem Elternknoten in der Liste hängt trotzdem darunter', () => {
    const out = from0({ nodes: [{ id: 2, parent: 1, text: 'b' }, { id: 1, parent: 0, text: 'a' }] });
    assertDeepEqual(allIds(out.nodes), [1, 2]);
    assertEqual(out.nodes[0].children[0].answer, 'b');
  });
  test('unbekannter Elternknoten, Verweis auf sich selbst und Kreis werden Wurzeln', () => {
    const out = from0({ nodes: [
      { id: 1, parent: 99, text: 'waise' },
      { id: 2, parent: 2, text: 'selbst' },
      { id: 3, parent: 4, text: 'k1' },
      { id: 4, parent: 3, text: 'k2' },
    ] });
    // Der Kreis bricht am zweiten Knoten: er wird Wurzel, der erste hängt darunter.
    assertDeepEqual(out.nodes.map((n) => n.answer), ['waise', 'selbst', 'k2']);
    assertEqual(out.nodes[2].children[0].answer, 'k1');
  });
  for (const file of [
    'v0.2.0_single_project.json', 'v0.3.0_single_project.json', 'v0.3.0_all_projects.json', 'v0.5.0_8d_project.json',
  ]) {
    test(`goldene Fixture ${file}: flache Altform als Baum, lädt ohne Reparatur`, async () => {
      const states = fiveWhyStates(await fetchJSON(new URL(file, FIXTURES)));
      assertEqual(states.length, 1);
      const old = states[0];
      assertTrue(old.nodes.length > 0 && old.nodes.every((n) => Object.hasOwn(n, 'parent') && !Object.hasOwn(n, 'children')));
      const out = from0(plain(old));
      const answers = [];
      const walk = (list) => list.forEach((n) => { answers.push([n.id, n.answer]); walk(n.children ?? []); });
      walk(out.nodes);
      // Jeder Altknoten bleibt mit seinem Text; Tiefe = Altebene + 1.
      assertDeepEqual(answers.map(([id]) => id).sort((a, b) => a - b), old.nodes.map((n) => n.id).sort((a, b) => a - b));
      for (const n of old.nodes) assertEqual(answers.find(([id]) => id === n.id)?.[1], n.text);
      const levelOf = new Map();
      const walkLevels = (list) => list.forEach((n) => { levelOf.set(n.id, n.level); walkLevels(n.children ?? []); });
      walkLevels(out.nodes);
      for (const n of old.nodes) assertEqual(levelOf.get(n.id), n.level + 1, `id ${n.id}`);
      assertEqual(out.problem, old.problem);
      const { m, fields } = repaired(plain(old));
      assertDeepEqual(fields, []);
      assertEqual(json(m.toJSON()), json({ ...SCHEMA, ...out }));
    });
  }
  test('v0.3.0_single_project: Verzweigung unter der Wurzel', async () => {
    const [old] = fiveWhyStates(await fetchJSON(new URL('v0.3.0_single_project.json', FIXTURES)));
    const out = from0(plain(old));
    assertEqual(out.nodes.length, 1);
    assertDeepEqual(out.nodes[0].children.map((n) => n.id), [2, 6]);
    assertDeepEqual(out.nodes[0].children[1].children.map((n) => n.id), [7]);
  });
});

suite('five-why Migration 0→1.0 — Beispiele', () => {
  for (const [file, last] of [
    ['five-why-lieferzeit.json', 'Bestellsystem wurde ursprünglich nur für Kassenbetrieb angeschafft; Logistikfunktion fehlt'],
    ['five-why-hubschrauber-flyer.json', 'Wurftechnik nicht standardisiert'],
  ]) {
    test(`${file}: lädt ohne Reparatur; Stand gleich der Altform ohne question/collapsed, Ebene 5 ohne children`, async () => {
      const old = await fetchJSON(new URL(file, EXAMPLES));
      assertEqual(old._schema, undefined);
      const { m, fields } = repaired(plain(old));
      assertDeepEqual(fields, []);
      const strip = (list) => list.map((n) => {
        const { question: _question, collapsed: _collapsed, children, ...rest } = n;
        return n.level < 5 ? { ...rest, children: strip(children) } : rest;
      });
      assertEqual(json(m.nodes), json(strip(old.nodes)));
      assertEqual(m.problem, old.problem);
      assertDeepEqual(m.collapsed, []);
      assertDeepEqual(allIds(m.nodes), [1, 2, 3, 4, 5]);
      assertEqual(m.nodes[0].children[0].children[0].children[0].children[0].answer, last);
      const { stats } = evaluateDerived(m, /** @type {any} */ (undefined), ['stats']);
      assertDeepEqual(stats, { totalNodes: 5, maxDepth: 5, branches: 0, answered: 5 });
    });
  }
});
