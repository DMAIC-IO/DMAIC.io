/**
 * Tests for modules/five-why/domain/model.js — Schema und Vorgaben,
 * gespeicherte Stände '1.0', Versionsprüfung, die Invarianten `uniqueIds`,
 * `parentLinks` und `knownCollapsed` (streng, mit Reparatur, beim Schreiben),
 * alle Kommandos samt Ablehnungen mit `param` (Ebene 5 lehnt `addChild` ab),
 * Aufklappen beim Anlegen, Rückfrage beim Löschen, Einklappen nur mit
 * Unterfragen, `hasContent`, die Ableitung `stats`, Lesefläche und Katalog.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../../test-utils.js';
import { State, MAX_LEVEL } from '../../../js/modules/five-why/domain/model.js';
import { allIds, findNode } from '../../../js/modules/five-why/domain/tree.js';
import { setModelName, confirmOf } from '../../../js/core/model.js';
import { loadModel } from '../../../js/core/initial-model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';

setModelName(State, 'five-why');

const SCHEMA = { _schema: { name: 'five-why', version: '1.0' } };

/** Knoten auf Ebene `level` (auf Ebene 5 ohne `children`). */
function node(id, level, parentId, answer = '', children = []) {
  return level < 5 ? { id, level, parentId, answer, children } : { id, level, parentId, answer };
}

/** Das Altprojekt (`legacy-project.json`) nach 0→1.0, ohne `_schema`. */
const LEGACY_STATE = {
  problem: 'Ölverlust an Linie 3 & Prüfstand <B> > Grenzwert',
  nodes: [
    node(3, 1, null, 'Öl tropft aus der Ringleitung', [
      node(7, 2, 3, 'Dichtung am Flansch ist spröde', [
        node(8, 3, 7, 'Falscher Dichtungswerkstoff für 90 °C', [
          node(12, 4, 8, 'Einkauf bestellt nach alter Stückliste\nÄnderung von 2024 nie eingepflegt', [
            node(20, 5, 12, 'Kein Änderungsprozess für Stücklisten & Lieferantendaten'),
          ]),
        ]),
      ]),
      node(11, 2, 3, ''),
    ]),
    node(5, 1, null, 'Prüfstand meldet zu spät', [node(6, 2, 5, 'Grenzwert < 2 bar ist zu weich eingestellt')]),
  ],
  collapsed: [5],
};
const LEGACY = { ...SCHEMA, ...LEGACY_STATE };

const plain = (v) => JSON.parse(JSON.stringify(v));
const json = (v) => JSON.stringify(v);
/** Die gespeicherten Felder ohne `_schema`. @param {object} m */
const fieldsOf = (m) => { const { _schema, ...rest } = plain(m.toJSON()); return rest; };
/** @param {object} m @returns {any} */
const stats = (m) => evaluateDerived(m, /** @type {any} */ (undefined), ['stats']).stats;
/** @returns {any} */
const legacy = () => State.fromJSON(plain(LEGACY));
/** Der gespeicherte Stand mit geänderten Feldern. @param {object} patch */
const legacyWith = (patch) => ({ ...plain(LEGACY), ...patch });

/** @param {() => any} fn @returns {any} der geworfene Fehler oder null */
function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

/** Laden mit Reparatur; meldet die reparierten Felder (ohne Doppel). @param {object} j */
function repaired(j) {
  const fields = [];
  const m = State.fromJSON(j, { repair: true, onRepair: (f) => { if (!fields.includes(f)) fields.push(f); } });
  return { m, fields };
}

suite('five-why Model — Schema und Vorgaben', () => {
  test('zwei Felder, ein Ansichtsfeld, sechs Kommandos, drei Invarianten, eine Ableitung', () => {
    assertDeepEqual(Object.keys(State.schema.fields), ['problem', 'nodes']);
    assertDeepEqual(Object.keys(State.schema.view), ['collapsed']);
    assertDeepEqual(Object.keys(State.schema.commands), [
      'addRoot', 'addChild', 'setAnswer', 'removeNode', 'toggleCollapse', 'setCollapseAll',
    ]);
    assertDeepEqual(Object.keys(State.schema.invariants), ['uniqueIds', 'parentLinks', 'knownCollapsed']);
    assertDeepEqual(Object.keys(State.schema.derived), ['stats']);
    assertEqual(MAX_LEVEL, 5);
  });
  test('nodes: Massenfeld Baum, fünf Ebenen mit festem level, Ebene 5 ohne children', () => {
    const s = State.schema.fields.nodes;
    assertEqual(s.bulk, true);
    assertEqual(s.bulkKind, 'tree');
    let item = s.item;
    for (let d = 1; d <= 5; d++) {
      assertDeepEqual([...item.shape.level.values], [d]);
      const keys = Object.keys(item.shape);
      assertDeepEqual(keys, d < 5 ? ['id', 'level', 'parentId', 'answer', 'children'] : ['id', 'level', 'parentId', 'answer'], `Ebene ${d}`);
      if (d < 5) item = item.shape.children.item;
    }
  });
  test('Vorgaben: alles leer, kein Inhalt; toJSON mit _schema', () => {
    const m = new State();
    assertEqual(json(m.toJSON()), json({ ...SCHEMA, problem: '', nodes: [], collapsed: [] }));
    assertEqual(m.hasContent(), false);
  });
});

suite('five-why Model — gespeicherter Stand 1.0', () => {
  test('lädt streng und ohne Reparatur, toJSON zeichengleich', () => {
    assertEqual(json(legacy().toJSON()), json(LEGACY));
    assertDeepEqual(repaired(plain(LEGACY)).fields, []);
  });
  test('Laden wie beim Einhängen ergibt denselben Stand', () => {
    assertEqual(json(loadModel(State, plain(LEGACY)).toJSON()), json(LEGACY));
  });
  test('läuft ohne Migrationsschritt: question ist in 1.0 unbekannt', () => {
    const j = legacyWith({ nodes: [{ ...node(1, 1, null), question: '' }] });
    assertTrue(thrown(() => State.fromJSON(j)) instanceof Error);
  });
  test('Ebene 5 mit children ist in 1.0 ungültig, falsches level ebenso', () => {
    const deep = plain(LEGACY);
    deep.nodes[0].children[0].children[0].children[0].children[0].children = [];
    assertTrue(thrown(() => State.fromJSON(deep)) instanceof Error);
    assertTrue(thrown(() => State.fromJSON(legacyWith({ nodes: [node(1, 2, null)] }))) instanceof Error);
  });
  test('Rundweg toJSON → fromJSON ist verlustfrei', () => {
    const m = legacy();
    assertEqual(json(State.fromJSON(plain(m.toJSON())).toJSON()), json(LEGACY));
    assertEqual(json(State.fromJSON(plain(new State().toJSON())).toJSON()), json(new State().toJSON()));
  });
});

suite('five-why Model — Versionsprüfung', () => {
  test('höhere Version 2.0 wird abgewiesen, auch mit Reparatur und beim Einhängen', () => {
    const v2 = { ...plain(LEGACY), _schema: { name: 'five-why', version: '2.0' } };
    assertThrows(() => State.fromJSON(v2), /_schema\.version/);
    assertThrows(() => State.fromJSON(v2, { repair: true }), /_schema\.version/);
    assertThrows(() => loadModel(State, v2), /_schema\.version/);
  });
  test('unlesbare Version wird abgewiesen, auch mit Reparatur', () => {
    const bad = { ...plain(LEGACY), _schema: { version: 'x' } };
    assertThrows(() => State.fromJSON(bad), /_schema\.version/);
    assertThrows(() => State.fromJSON(bad, { repair: true }), /_schema\.version/);
  });
});

suite('five-why Model — Invarianten beim Laden', () => {
  test('uniqueIds: doppelte id streng abgewiesen; mit Reparatur bekommt die spätere die nächste, Teilbaum bleibt', () => {
    const j = legacyWith({ nodes: [...plain(LEGACY_STATE.nodes), node(7, 1, null, 'Doppelt', [node(30, 2, 7, 'Kind')])] });
    const err = thrown(() => State.fromJSON(plain(j)));
    assertEqual(err?.invariant, 'uniqueIds');
    assertEqual(err?.param, 'nodes');
    const { m, fields } = repaired(j);
    assertDeepEqual(fields, ['nodes']);
    assertDeepEqual(allIds(m.nodes), [3, 7, 8, 12, 20, 11, 5, 6, 31, 30]);
    assertEqual(m.nodes[2].answer, 'Doppelt');
    assertEqual(m.nodes[2].children[0].parentId, 31);
  });
  test('parentLinks: falscher Elternverweis streng abgewiesen; Reparatur schreibt ihn aus der Lage', () => {
    const bad = plain(LEGACY);
    bad.nodes[0].children[0].parentId = 99;
    bad.nodes[1].parentId = 3;
    const err = thrown(() => State.fromJSON(plain(bad)));
    assertEqual(err?.invariant, 'parentLinks');
    assertEqual(err?.param, 'nodes');
    const { m, fields } = repaired(bad);
    assertDeepEqual(fields, ['nodes']);
    assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
  });
  test('knownCollapsed: unbekannte ids heilen still, auch beim strengen Laden', () => {
    const j = legacyWith({ collapsed: [99, 5, 42] });
    assertDeepEqual(State.fromJSON(plain(j)).collapsed, [5]);
    const { m, fields } = repaired(j);
    assertDeepEqual(fields, []);
    assertDeepEqual(m.collapsed, [5]);
  });
  test('collapsed ohne Liste fällt still auf die Vorgabe', () => {
    assertDeepEqual(State.fromJSON(legacyWith({ collapsed: 'x' })).collapsed, []);
  });
  test('ein ungültiger Knoten entfällt beim Reparieren samt Teilbaum', () => {
    const j = plain(LEGACY);
    j.nodes[0].children[0].id = 0;
    const { m, fields } = repaired(j);
    assertDeepEqual(fields, ['nodes']);
    assertDeepEqual(allIds(m.nodes), [3, 11, 5, 6]);
  });
});

suite('five-why Model — Schreiben der Felder (instance.set)', () => {
  test('ganze Felder mit gültigen ids und Verweisen werden angenommen', () => {
    const m = legacy();
    m.problem = 'Neu';
    m.nodes = [node(1, 1, null, 'x', [node(2, 2, 1, 'y')])];
    assertEqual(m.problem, 'Neu');
    assertDeepEqual(allIds(m.nodes), [1, 2]);
  });
  test('doppelte id abgelehnt, alter Wert bleibt', () => {
    const m = legacy();
    const err = thrown(() => { m.nodes = [node(1, 1, null), node(1, 1, null)]; });
    assertEqual(err?.invariant, 'uniqueIds');
    assertEqual(err?.param, 'nodes');
    assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
  });
  test('falscher Elternverweis abgelehnt', () => {
    const m = legacy();
    assertEqual(thrown(() => { m.nodes = [node(1, 1, 5)]; })?.invariant, 'parentLinks');
    assertEqual(thrown(() => { m.nodes = [node(1, 1, null, '', [node(2, 2, null)])]; })?.invariant, 'parentLinks');
    assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
  });
  test('Ebene 5 mit Unterfragen und ein falsches level abgelehnt', () => {
    const m = legacy();
    const deep = plain(LEGACY_STATE.nodes);
    deep[0].children[0].children[0].children[0].children[0].children = [];
    assertTrue(thrown(() => { m.nodes = deep; }) instanceof Error);
    assertTrue(thrown(() => { m.nodes = [node(1, 2, null)]; }) instanceof Error);
    assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
  });
  test('collapsed mit unbekannter id abgelehnt', () => {
    const m = legacy();
    assertEqual(thrown(() => { m.collapsed = [99]; })?.invariant, 'knownCollapsed');
    assertDeepEqual(m.collapsed, [5]);
  });
});

suite('five-why Model — addRoot', () => {
  test('hängt eine Wurzel an, liefert die id = größte + 1', () => {
    const m = legacy();
    const id = m.addRoot({});
    assertEqual(id, 21);
    assertEqual(json(m.nodes.at(-1)), json(node(21, 1, null)));
  });
  test('im leeren Baum id 1, dann 2; über execute', () => {
    const m = new State();
    assertEqual(m.addRoot({}), 1);
    assertEqual(m.execute({ type: 'addRoot' }), 2);
    assertDeepEqual(allIds(m.nodes), [1, 2]);
  });
  test('nach Löschen der höchsten id kehrt sie wieder (größte + 1)', () => {
    const m = new State();
    m.addRoot({});
    const id = m.addRoot({});
    m.removeNode({ nodeId: id });
    assertEqual(m.addRoot({}), id);
  });
  test('eine veraltete id in collapsed (nodes allein gesetzt) gilt nicht für die neue Wurzel', () => {
    const m = new State();
    m.addRoot({});
    const id = m.addRoot({});
    m.collapsed = [id];
    m.nodes = [{ id: 1, level: 1, parentId: null, answer: '', children: [] }];
    assertDeepEqual(m.collapsed, [id]);
    assertEqual(m.addRoot({}), id);
    assertDeepEqual(m.collapsed, []);
  });
});

suite('five-why Model — addChild', () => {
  test('hängt unter dem Elternknoten an, Ebene + 1, liefert die id', () => {
    const m = legacy();
    const id = m.addChild({ parentId: 11 });
    assertEqual(id, 21);
    assertEqual(json(findNode(m.nodes, 11)?.children), json([node(21, 3, 11)]));
  });
  test('unter Ebene 4 entsteht ein Knoten der Ebene 5 ohne children', () => {
    const m = legacy();
    const id = m.addChild({ parentId: 12 });
    const child = findNode(m.nodes, id);
    assertEqual(json(child), json(node(id, 5, 12)));
    assertTrue(!Object.hasOwn(/** @type {object} */ (child), 'children'));
  });
  test('klappt den Elternknoten auf', () => {
    const m = legacy();
    m.addChild({ parentId: 5 });
    assertDeepEqual(m.collapsed, []);
  });
  test('eine veraltete id in collapsed (nodes allein gesetzt) gilt nicht für den neuen Knoten', () => {
    const m = new State();
    const a = m.addRoot({});
    const b = m.addChild({ parentId: a });
    m.collapsed = [b];
    m.nodes = [{ id: a, level: 1, parentId: null, answer: '', children: [] }];
    assertDeepEqual(m.collapsed, [b]);
    assertEqual(m.addChild({ parentId: a }), b);
    assertDeepEqual(m.collapsed, []);
  });
  test('Ebene 5 abgelehnt mit param parentId, Zustand unverändert', () => {
    const m = legacy();
    const err = thrown(() => m.addChild({ parentId: 20 }));
    assertEqual(err?.param, 'parentId');
    assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
  });
  test('Zahltext wie aus data-arg-parent-id wird angenommen', () => {
    const m = legacy();
    const id = m.addChild(/** @type {any} */ ({ parentId: '11' }));
    assertEqual(findNode(m.nodes, id)?.parentId, 11);
  });
  test('unbekannte und ungültige parentId abgelehnt mit param parentId', () => {
    for (const parentId of [99, 'x', 1.5, null, undefined]) {
      const m = legacy();
      assertEqual(thrown(() => m.addChild(/** @type {any} */ ({ parentId })))?.param, 'parentId', json(parentId));
      assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
    }
  });
});

suite('five-why Model — setAnswer', () => {
  test('setzt die Antwort, auch auf Ebene 5 und mehrzeilig', () => {
    const m = legacy();
    m.setAnswer({ nodeId: 20, text: 'Neu\nzwei' });
    m.setAnswer({ nodeId: 3, text: '' });
    assertEqual(findNode(m.nodes, 20)?.answer, 'Neu\nzwei');
    assertEqual(findNode(m.nodes, 3)?.answer, '');
  });
  test('unbekannte id abgelehnt mit param nodeId; Text kein Text abgelehnt mit param text', () => {
    const m = legacy();
    assertEqual(thrown(() => m.setAnswer({ nodeId: 99, text: 'x' }))?.param, 'nodeId');
    assertEqual(thrown(() => m.setAnswer(/** @type {any} */ ({ nodeId: 3, text: 5 })))?.param, 'text');
    assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
  });
});

suite('five-why Model — removeNode', () => {
  test('entfernt den Teilbaum und dessen ids aus collapsed', () => {
    const m = legacy();
    m.removeNode({ nodeId: 5 });
    assertDeepEqual(allIds(m.nodes), [3, 7, 8, 12, 20, 11]);
    assertDeepEqual(m.collapsed, []);
  });
  test('eingeklappter Nachfahre fällt mit dem Vorfahren aus collapsed', () => {
    const m = legacy();
    m.toggleCollapse({ nodeId: 8 });
    m.removeNode({ nodeId: 7 });
    assertDeepEqual(allIds(m.nodes), [3, 11, 5, 6]);
    assertDeepEqual(m.collapsed, [5]);
  });
  test('ein Blatt; collapsed bleibt', () => {
    const m = legacy();
    m.removeNode({ nodeId: 20 });
    assertDeepEqual(findNode(m.nodes, 12)?.children, []);
    assertDeepEqual(m.collapsed, [5]);
  });
  test('letztes Kind entfernt: der Elternknoten fällt aus collapsed', () => {
    const m = legacy();
    m.removeNode({ nodeId: 6 });
    assertDeepEqual(findNode(m.nodes, 5)?.children, []);
    assertDeepEqual(m.collapsed, []);
  });
  test('Geschwister bleiben: der Elternknoten bleibt in collapsed', () => {
    const m = legacy();
    m.toggleCollapse({ nodeId: 3 });
    m.removeNode({ nodeId: 11 });
    assertDeepEqual(m.collapsed, [5, 3]);
  });
  test('unbekannte id abgelehnt mit param nodeId', () => {
    const m = legacy();
    assertEqual(thrown(() => m.removeNode({ nodeId: 99 }))?.param, 'nodeId');
    assertEqual(json(fieldsOf(m)), json(LEGACY_STATE));
  });
  test('confirm: mit Unterfragen eigene Frage, sonst null (allgemeine Frage des Kerns)', () => {
    const m = legacy();
    assertDeepEqual(confirmOf(m, 'removeNode', { nodeId: 3 }), { key: 'deleteConfirm' });
    assertDeepEqual(confirmOf(m, 'removeNode', { nodeId: 12 }), { key: 'deleteConfirm' });
    assertEqual(confirmOf(m, 'removeNode', { nodeId: 20 }), null);
    assertEqual(confirmOf(m, 'removeNode', { nodeId: 11 }), null);
    assertEqual(confirmOf(m, 'removeNode', { nodeId: 99 }), null);
  });
});

suite('five-why Model — Einklappen', () => {
  test('toggleCollapse schaltet um', () => {
    const m = legacy();
    m.toggleCollapse({ nodeId: 3 });
    assertDeepEqual(m.collapsed, [5, 3]);
    m.toggleCollapse({ nodeId: 5 });
    assertDeepEqual(m.collapsed, [3]);
  });
  test('toggleCollapse: unbekannte id abgelehnt mit param nodeId', () => {
    const m = legacy();
    assertEqual(thrown(() => m.toggleCollapse({ nodeId: 99 }))?.param, 'nodeId');
    assertDeepEqual(m.collapsed, [5]);
  });
  test('setCollapseAll true: alle Knoten mit Unterfragen, nur diese', () => {
    const m = legacy();
    m.setCollapseAll({ collapsed: true });
    assertDeepEqual(m.collapsed, [5, 3, 7, 8, 12]);
  });
  test('setCollapseAll false: leert collapsed ganz, auch ids ohne Unterfragen', () => {
    const m = legacy();
    m.toggleCollapse({ nodeId: 11 });
    m.toggleCollapse({ nodeId: 3 });
    m.setCollapseAll({ collapsed: false });
    assertDeepEqual(m.collapsed, []);
  });
  test('Einklappen ändert weder Inhalt noch stats', () => {
    const m = legacy();
    const before = { problem: m.problem, nodes: plain(m.nodes), stats: stats(m) };
    m.setCollapseAll({ collapsed: true });
    assertEqual(json({ problem: m.problem, nodes: plain(m.nodes), stats: stats(m) }), json(before));
  });
});

suite('five-why Model — hasContent', () => {
  test('false, wenn leer; collapsed zählt nicht', () => {
    assertEqual(new State().hasContent(), false);
  });
  test('true mit Problemtext', () => {
    const m = new State();
    m.problem = 'P';
    assertEqual(m.hasContent(), true);
  });
  test('true mit einem Knoten; wieder entfernt → false', () => {
    const m = new State();
    const id = m.addRoot({});
    assertEqual(m.hasContent(), true);
    m.removeNode({ nodeId: id });
    assertEqual(m.hasContent(), false);
  });
});

suite('five-why Model — Ableitung stats', () => {
  test('Altprojekt: 8 Fragen, Tiefe 5, eine Verzweigung, 7 beantwortet', () => {
    assertDeepEqual(stats(legacy()), { totalNodes: 8, maxDepth: 5, branches: 1, answered: 7 });
  });
  test('folgt den Kommandos', () => {
    const m = legacy();
    m.addChild({ parentId: 6 });
    m.addChild({ parentId: 6 });
    m.setAnswer({ nodeId: 11, text: 'jetzt' });
    assertDeepEqual(stats(m), { totalNodes: 10, maxDepth: 5, branches: 2, answered: 8 });
  });
  test('leer', () => {
    assertDeepEqual(stats(new State()), { totalNodes: 0, maxDepth: 0, branches: 0, answered: 0 });
  });
});

suite('five-why Model — Lesefläche und Agentenkatalog', () => {
  const entry = schemaAgentEntry(State);
  /** @param {object} m @param {object} [options] */
  const read = (m, options) => readSchemaModel(entry, m, options, evaluateDerived(m, /** @type {any} */ (undefined)));

  test('read() ohne Parameter: problem, Umfang von nodes, stats; collapsed fehlt', () => {
    const out = read(legacy());
    assertDeepEqual(Object.keys(out), ['problem', 'nodes', 'stats']);
    assertEqual(out.problem, LEGACY_STATE.problem);
    assertDeepEqual(out.nodes, { $bulk: true, kind: 'tree', nodeCount: 8, depth: 5 });
    assertDeepEqual(out.stats, { totalNodes: 8, maxDepth: 5, branches: 1, answered: 7 });
  });
  test('read({ fields: [nodes] }): der Baum ohne question/collapsed, Ebene 5 ohne children', () => {
    const out = read(legacy(), { fields: ['nodes'] });
    assertEqual(json(out.nodes), json(LEGACY_STATE.nodes));
  });
  test('Katalog: read und vier Kommandos mit Objekt-Argumenten; Einklappen bleibt der Oberfläche', () => {
    assertDeepEqual(Object.keys(entry.actions), ['read', 'addRoot', 'addChild', 'setAnswer', 'removeNode']);
    assertDeepEqual(Object.keys(entry.actions.addChild.keys), ['parentId']);
    assertDeepEqual(Object.keys(entry.actions.setAnswer.keys), ['nodeId', 'text']);
    assertDeepEqual(Object.keys(entry.actions.removeNode.keys), ['nodeId']);
  });
  test('instance.set: problem und nodes; stats ist abgeleitet', () => {
    assertDeepEqual(entry.settable, ['problem', 'nodes']);
    assertDeepEqual(entry.invariants, ['uniqueIds', 'parentLinks', 'knownCollapsed']);
    assertEqual(entry.fields.stats.derived, true);
    assertEqual(entry.fields.nodes.bulkKind, 'tree');
  });
});
