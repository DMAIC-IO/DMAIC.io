/**
 * Tests for modules/lessons-learned/domain/model.js — Schema und Vorgaben,
 * gespeicherter Stand '1.0', Versionsprüfung, Invariante `uniqueIds`, die
 * sieben Kommandos samt Ablehnungen (mit `param`), Phase nur aus dem aktiven
 * Zyklus, `current` und `confirm`, `updatedAt`, `importLessons`, die
 * Ableitung `stats`, Lesefläche und Agentenkatalog; dazu die Fälle der
 * alten Suite in der neuen Form.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../../test-utils.js';
import { State, CATEGORIES, IMPACTS } from '../../../js/modules/lessons-learned/domain/model.js';
import { setModelName, setModelContext, confirmOf, currentOf, DEFAULT_CONTEXT } from '../../../js/core/model.js';
import { loadModel } from '../../../js/core/initial-model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';

setModelName(State, 'lessons-learned');

const SCHEMA = { _schema: { name: 'lessons-learned', version: '1.0' } };
const json = (v) => JSON.stringify(v);
const plain = (v) => JSON.parse(JSON.stringify(v));

/** Eine Erfahrung in Normalform. @param {object} l */
const entry = (l) => ({
  id: '', title: '', category: 'success', phase: 'control', impact: 'medium', owner: '', description: '',
  rootCause: '', recommendation: '', actions: [], createdAt: 0, updatedAt: 0, ...l,
});

const LIST = [
  entry({ id: 'a', title: 'Alpha', category: 'success', phase: 'define', impact: 'high', owner: 'Anna',
    actions: [{ text: 'A1', done: false }, { text: 'A2', done: true }], createdAt: 10, updatedAt: 20 }),
  entry({ id: 'b', title: 'Beta', category: 'problem', phase: 'verify', impact: 'low', description: 'D', createdAt: 30, updatedAt: 30 }),
  entry({ id: 'c', title: 'Gamma', category: 'improve', actions: [{ text: 'C1', done: false }], createdAt: 40, updatedAt: 40 }),
];
const STORED = { ...SCHEMA, lessons: LIST };

/** @returns {any} */
const stored = () => State.fromJSON(plain(STORED));
/** @param {object} m */
const fieldsOf = (m) => { const { _schema, ...rest } = plain(m.toJSON()); return rest; };
/** @param {object} m @returns {any} */
const stats = (m) => evaluateDerived(m, /** @type {any} */ (undefined), ['stats']).stats;
/** @param {any} m @param {string} cycle */
const inCycle = (m, cycle) => { setModelContext(m, { ...DEFAULT_CONTEXT, cycle }); return m; };

/** @param {() => any} fn @returns {any} der geworfene Fehler oder null */
function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

/** Laden mit Reparatur; meldet die reparierten Felder. @param {object} j */
function repaired(j) {
  const fields = [];
  const m = State.fromJSON(j, { repair: true, onRepair: (f) => fields.push(f) });
  return { m, fields };
}

suite('lessons-learned Model — Schema und Vorgaben', () => {
  test('ein Feld, keine Ansichtsfelder, sieben Kommandos, eine Invariante, eine Ableitung', () => {
    assertDeepEqual(Object.keys(State.schema.fields), ['lessons']);
    assertDeepEqual(Object.keys(State.schema.view), []);
    assertDeepEqual(Object.keys(State.schema.commands), [
      'addLesson', 'updateLesson', 'removeLesson', 'addAction', 'removeAction', 'setActionDone', 'importLessons',
    ]);
    assertDeepEqual(Object.keys(State.schema.invariants), ['uniqueIds']);
    assertEqual(typeof State.schema.invariants.uniqueIds.repair, 'function');
    assertDeepEqual(Object.keys(State.schema.derived), ['stats']);
  });
  test('Feldart: Liste von Objekten mit zwölf Schlüsseln, Massenfeld, nicht per instance.set; Phase ist Text', () => {
    const f = State.schema.fields.lessons;
    assertEqual(f.kind, 'list');
    assertEqual(f.bulk, true);
    assertEqual(f.agentWrite, false);
    assertDeepEqual(Object.keys(f.item.shape), [
      'id', 'title', 'category', 'phase', 'impact', 'owner', 'description', 'rootCause', 'recommendation', 'actions', 'createdAt', 'updatedAt',
    ]);
    assertEqual(f.item.shape.phase.kind, 'text');
    assertDeepEqual(Object.keys(f.item.shape.actions.item.shape), ['text', 'done']);
  });
  test('Vorgabe: leer, kein Inhalt, toJSON mit _schema 1.0', () => {
    const m = new State();
    assertEqual(json(m.toJSON()), json({ ...SCHEMA, lessons: [] }));
    assertEqual(m.hasContent(), false);
  });
  test('re-exportiert die Wertemengen', () => {
    assertDeepEqual([...CATEGORIES], ['success', 'problem', 'improve']);
    assertDeepEqual([...IMPACTS], ['high', 'medium', 'low']);
  });
});

suite('lessons-learned Model — gespeicherter Stand 1.0', () => {
  test('lädt streng und ohne Reparatur, toJSON zeichengleich; Fremdphase bleibt', () => {
    assertEqual(thrown(() => State.fromJSON(plain(STORED))), null);
    const { m, fields } = repaired(plain(STORED));
    assertDeepEqual(fields, []);
    assertEqual(json(m.toJSON()), json(STORED));
  });
  test('Laden wie beim Einhängen ergibt denselben Stand', () => {
    assertEqual(json(loadModel(State, plain(STORED)).toJSON()), json(STORED));
  });
  test('höhere Version wird abgewiesen, auch mit Reparatur und beim Einhängen', () => {
    const v2 = { ...plain(STORED), _schema: { name: 'lessons-learned', version: '2.0' } };
    assertThrows(() => State.fromJSON(v2), /_schema\.version/);
    assertThrows(() => State.fromJSON(v2, { repair: true }), /_schema\.version/);
    assertThrows(() => loadModel(State, v2), /_schema\.version/);
  });
});

suite('lessons-learned Model — Invariante uniqueIds', () => {
  test('doppelte id: streng abgewiesen; mit Reparatur entfällt die spätere', () => {
    const j = { ...SCHEMA, lessons: [...LIST, entry({ id: 'a', title: 'Doppelt' })] };
    const err = thrown(() => State.fromJSON(plain(j)));
    assertEqual(err?.invariant, 'uniqueIds');
    const { m, fields } = repaired(plain(j));
    assertDeepEqual(fields, ['lessons']);
    assertEqual(json(fieldsOf(m)), json({ lessons: LIST }));
  });
  test('leere id: streng abgewiesen; mit Reparatur entfällt der Eintrag', () => {
    const j = { ...SCHEMA, lessons: [entry({ id: '' }), ...LIST] };
    assertEqual(thrown(() => State.fromJSON(plain(j)))?.invariant, 'uniqueIds');
    assertEqual(json(fieldsOf(repaired(plain(j)).m)), json({ lessons: LIST }));
  });
  test('Schreiben mit doppelter id rollt zurück', () => {
    const m = stored();
    const err = thrown(() => { m.lessons = [...LIST, entry({ id: 'b' })]; });
    assertEqual(err?.invariant, 'uniqueIds');
    assertEqual(json(fieldsOf(m)), json({ lessons: LIST }));
  });
});

suite('lessons-learned Model — addLesson', () => {
  test('nur mit Titel: Vorgaben, getrimmt, neue id ohne Präfix, Zeitstempel', () => {
    const m = new State();
    const before = Date.now();
    const id = m.addLesson({ title: '  Neu  ' });
    assertTrue(typeof id === 'string' && id.length > 0, id);
    const l = m.lessons[0];
    assertEqual(json({ ...l, createdAt: 0, updatedAt: 0 }), json(entry({ id, title: 'Neu' })));
    assertTrue(l.createdAt >= before && l.createdAt === l.updatedAt, 'Zeitstempel');
  });
  test('alle Angaben, getrimmt; Maßnahmen ohne Haken offen; über execute', () => {
    const m = new State();
    const a = m.addLesson({
      title: 'A', category: 'problem', impact: 'high', phase: 'define', owner: ' O ', description: ' D ',
      rootCause: ' R ', recommendation: ' E ', actions: [{ text: ' x ' }, { text: 'y', done: true }],
    });
    const b = /** @type {string} */ (m.execute({ type: 'addLesson', title: 'B' }));
    assertTrue(a !== b);
    const l = m.lessons[0];
    assertEqual(json({ ...l, createdAt: 0, updatedAt: 0 }), json(entry({
      id: a, title: 'A', category: 'problem', impact: 'high', phase: 'define', owner: 'O', description: 'D',
      rootCause: 'R', recommendation: 'E', actions: [{ text: 'x', done: false }, { text: 'y', done: true }],
    })));
  });
  test('ohne Phase: letzte Phase des aktiven Zyklus (DMAIC, DMADV, 8D)', () => {
    for (const [cycle, p] of [['dmaic', 'control'], ['dmadv', 'verify'], ['eightd', 'recognize']]) {
      const m = inCycle(new State(), cycle);
      m.addLesson({ title: 'X' });
      assertEqual(m.lessons[0].phase, p, cycle);
    }
  });
  test('Phase nur aus dem aktiven Zyklus', () => {
    const m = inCycle(new State(), 'dmadv');
    m.addLesson({ title: 'X', phase: 'design' });
    assertEqual(m.lessons[0].phase, 'design');
    assertEqual(thrown(() => m.addLesson({ title: 'Y', phase: 'control' }))?.param, 'phase');
    assertEqual(m.lessons.length, 1);
  });
  const REJECT = [
    ['leerer Titel', { title: '   ' }, 'title'],
    ['ohne Titel', { owner: 'O' }, 'title'],
    ['Kategorie Methodik', { title: 'A', category: 'Methodik' }, 'category'],
    ['Wirkung riesig', { title: 'A', impact: 'riesig' }, 'impact'],
    ['Phase verify in DMAIC', { title: 'A', phase: 'verify' }, 'phase'],
    ['Maßnahmen als Texte', { title: 'A', actions: ['x'] }, 'actions'],
    ['Maßnahme mit Fremdschlüssel', { title: 'A', actions: [{ text: 'x', owner: 'O' }] }, 'actions'],
    ['Haken als Text', { title: 'A', actions: [{ text: 'x', done: 'true' }] }, 'actions'],
    ['unbekannter Schlüssel', { title: 'A', data: {} }, 'data'],
  ];
  for (const [what, args, param] of REJECT) {
    test(`${what}: abgelehnt mit param ${param}, nichts angelegt`, () => {
      const m = new State();
      const err = thrown(() => m.addLesson(/** @type {any} */ (args)));
      assertEqual(err?.param, param);
      assertEqual(m.lessons.length, 0);
    });
  }
});

suite('lessons-learned Model — updateLesson', () => {
  test('ändert nur die genannten Angaben, getrimmt; setzt updatedAt', () => {
    const m = stored();
    const before = Date.now();
    m.updateLesson({ lessonId: 'b', title: ' Bravo ', impact: 'high' });
    const l = m.lessons[1];
    assertEqual(json({ ...l, updatedAt: 0 }), json({ ...LIST[1], title: 'Bravo', impact: 'high', updatedAt: 0 }));
    assertTrue(l.updatedAt >= before);
    assertEqual(json(m.lessons[0]), json(LIST[0]));
  });
  test('jede Angabe einzeln; Maßnahmen ersetzen die Liste', () => {
    const m = stored();
    m.updateLesson({ lessonId: 'a', category: 'improve' });
    m.updateLesson({ lessonId: 'a', phase: 'analyze' });
    m.updateLesson({ lessonId: 'a', owner: ' X ' });
    m.updateLesson({ lessonId: 'a', description: 'd' });
    m.updateLesson({ lessonId: 'a', rootCause: 'r' });
    m.updateLesson({ lessonId: 'a', recommendation: 'e' });
    m.updateLesson({ lessonId: 'a', actions: [{ text: 'neu' }] });
    const l = m.lessons[0];
    assertDeepEqual([l.category, l.phase, l.owner, l.description, l.rootCause, l.recommendation],
      ['improve', 'analyze', 'X', 'd', 'r', 'e']);
    assertEqual(json(l.actions), json([{ text: 'neu', done: false }]));
  });
  const REJECT = [
    ['unbekannte id', { lessonId: 'x', title: 'T' }, 'lessonId'],
    ['nur lessonId', { lessonId: 'a' }, 'command'],
    ['leerer Titel', { lessonId: 'a', title: '  ' }, 'title'],
    ['Phase verify in DMAIC', { lessonId: 'a', phase: 'verify' }, 'phase'],
    ['Kategorie Methodik', { lessonId: 'a', category: 'Methodik' }, 'category'],
  ];
  for (const [what, args, param] of REJECT) {
    test(`${what}: abgelehnt mit param ${param}, nichts geändert`, () => {
      const m = stored();
      assertEqual(thrown(() => m.updateLesson(/** @type {any} */ (args)))?.param, param);
      assertEqual(json(fieldsOf(m)), json({ lessons: LIST }));
    });
  }
  test('current: alle Angaben, Maßnahmen als eigene Kopie', () => {
    const m = stored();
    const cur = currentOf(m, 'updateLesson', { lessonId: 'a' });
    assertEqual(json(cur), json({
      title: 'Alpha', category: 'success', impact: 'high', phase: 'define', owner: 'Anna', description: '', rootCause: '',
      recommendation: '', actions: [{ text: 'A1', done: false }, { text: 'A2', done: true }],
    }));
    cur.actions.push({ text: 'x', done: false });
    assertEqual(m.lessons[0].actions.length, 2);
  });
  test('current: Phase außerhalb des aktiven Zyklus wird dessen letzte', () => {
    assertEqual(currentOf(stored(), 'updateLesson', { lessonId: 'b' }).phase, 'control');
    assertEqual(currentOf(inCycle(stored(), 'dmadv'), 'updateLesson', { lessonId: 'b' }).phase, 'verify');
    assertEqual(currentOf(inCycle(stored(), 'dmadv'), 'updateLesson', { lessonId: 'a' }).phase, 'define');
  });
  test('current mit unbekannter id: abgelehnt mit param lessonId', () => {
    assertEqual(thrown(() => currentOf(stored(), 'updateLesson', { lessonId: 'x' }))?.param, 'lessonId');
  });
});

suite('lessons-learned Model — removeLesson', () => {
  test('entfernt nur die Erfahrung', () => {
    const m = stored();
    m.removeLesson({ lessonId: 'b' });
    assertEqual(json(m.lessons), json([LIST[0], LIST[2]]));
  });
  test('unbekannte id: abgelehnt mit param lessonId', () => {
    const m = stored();
    assertEqual(thrown(() => m.removeLesson({ lessonId: 'x' }))?.param, 'lessonId');
    assertEqual(m.lessons.length, 3);
  });
  test('confirm: eigene Frage', () => {
    assertDeepEqual(confirmOf(stored(), 'removeLesson', { lessonId: 'b' }), { key: 'confirm.removeLesson' });
  });
});

suite('lessons-learned Model — Maßnahmen', () => {
  test('addAction hängt getrimmt an, liefert die Position, setzt updatedAt', () => {
    const m = stored();
    const before = Date.now();
    assertEqual(m.addAction({ lessonId: 'a', text: ' A3 ' }), 2);
    assertEqual(json(m.lessons[0].actions.at(-1)), json({ text: 'A3', done: false }));
    assertTrue(m.lessons[0].updatedAt >= before);
  });
  test('addAction: leerer Text und fehlender Text abgelehnt mit param text', () => {
    const m = stored();
    assertEqual(thrown(() => m.addAction({ lessonId: 'a', text: '  ' }))?.param, 'text');
    assertEqual(thrown(() => m.addAction(/** @type {any} */ ({ lessonId: 'a' })))?.param, 'text');
    assertEqual(m.lessons[0].actions.length, 2);
  });
  test('removeAction trifft genau eine Position', () => {
    const m = stored();
    m.removeAction({ lessonId: 'a', actionIndex: 0 });
    assertEqual(json(m.lessons[0].actions), json([{ text: 'A2', done: true }]));
  });
  test('setActionDone hakt ab und zurück, setzt updatedAt', () => {
    const m = stored();
    m.setActionDone({ lessonId: 'a', actionIndex: 0, done: true });
    assertEqual(m.lessons[0].actions[0].done, true);
    m.setActionDone({ lessonId: 'a', actionIndex: 0, done: false });
    assertEqual(m.lessons[0].actions[0].done, false);
    assertTrue(m.lessons[0].updatedAt > 20);
  });
  const REJECT = [
    ['removeAction', { lessonId: 'a', actionIndex: 2 }, 'actionIndex'],
    ['removeAction', { lessonId: 'b', actionIndex: 0 }, 'actionIndex'],
    ['removeAction', { lessonId: 'a', actionIndex: -1 }, 'actionIndex'],
    ['removeAction', { lessonId: 'a', actionIndex: 0.5 }, 'actionIndex'],
    ['removeAction', { lessonId: 'x', actionIndex: 0 }, 'lessonId'],
    ['setActionDone', { lessonId: 'a', actionIndex: 5, done: true }, 'actionIndex'],
    ['setActionDone', { lessonId: 'a', actionIndex: 0, done: 'true' }, 'done'],
    ['setActionDone', { lessonId: 'a', actionIndex: 0 }, 'done'],
  ];
  for (const [cmd, args, param] of REJECT) {
    test(`${cmd} ${json(args)}: abgelehnt mit param ${param}`, () => {
      const m = stored();
      assertEqual(thrown(() => m[cmd](args))?.param, param);
      assertEqual(json(fieldsOf(m)), json({ lessons: LIST }));
    });
  }
});

suite('lessons-learned Model — importLessons', () => {
  test('Liste: hängt an, behält freie ids und Zeitpunkte, liefert count', () => {
    const m = stored();
    const r = m.importLessons({ json: json([
      { id: 'n1', title: 'Neu', category: 'problem', phase: 'verify', createdAt: 5, updatedAt: 6 },
      { title: 'Ohne id' },
    ]) });
    assertDeepEqual(r, { count: 2 });
    assertEqual(m.lessons.length, 5);
    assertEqual(json(m.lessons[3]), json(entry({ id: 'n1', title: 'Neu', category: 'problem', phase: 'verify', createdAt: 5, updatedAt: 6 })));
    assertTrue(m.lessons[4].id !== '' && !['a', 'b', 'c', 'n1'].includes(m.lessons[4].id));
  });
  test('doppelte ids (zum Bestand und in der Datei) bekommen neue ids; Nicht-Objekte entfallen', () => {
    const m = stored();
    const r = m.importLessons({ json: json([{ id: 'a', title: 'X' }, null, 5, { id: 'n', title: 'Y' }, { id: 'n', title: 'Z' }]) });
    assertDeepEqual(r, { count: 3 });
    const ids = m.lessons.map((l) => l.id);
    assertEqual(new Set(ids).size, ids.length);
    assertEqual(m.lessons[3].title, 'X');
    assertTrue(m.lessons[3].id !== 'a');
    assertEqual(m.lessons[4].id, 'n');
    assertTrue(m.lessons[5].id !== 'n');
  });
  test('Fremdwerte wie beim Laden', () => {
    const m = new State();
    m.importLessons({ json: json([{ id: 'q', category: 'Methodik', impact: 'x', phase: 3, actions: [null, { text: 't', done: true, owner: 'O' }] }]) });
    assertEqual(json(m.lessons[0]), json(entry({ id: 'q', actions: [{ text: '', done: false }, { text: 't', done: true }] })));
  });
  for (const [what, text] of [['Parsefehler', 'this is not valid json'], ['Objekt statt Liste', '{"lessons":[]}'], ['Zahl', '5']]) {
    test(`${what}: abgelehnt mit param json und Hinweis importError, nichts geändert`, () => {
      const m = stored();
      const err = thrown(() => m.importLessons({ json: text }));
      assertEqual(err?.param, 'json');
      assertEqual(err?.hintKey, 'importError');
      assertEqual(json(fieldsOf(m)), json({ lessons: LIST }));
    });
  }
  test('leere Liste: count 0', () => {
    assertDeepEqual(new State().importLessons({ json: '[]' }), { count: 0 });
  });
});

suite('lessons-learned Model — hasContent und stats', () => {
  test('hasContent: leer false, eine Erfahrung true, wieder entfernt false', () => {
    const m = new State();
    const id = m.addLesson({ title: 'A' });
    assertEqual(m.hasContent(), true);
    m.removeLesson({ lessonId: id });
    assertEqual(m.hasContent(), false);
  });
  test('stats: je Kategorie und offene Maßnahmen; folgt den Kommandos', () => {
    const m = stored();
    assertDeepEqual(stats(m), { total: 3, success: 1, problem: 1, improve: 1, openActions: 2 });
    m.setActionDone({ lessonId: 'c', actionIndex: 0, done: true });
    assertEqual(stats(m).openActions, 1);
    assertDeepEqual(stats(new State()), { total: 0, success: 0, problem: 0, improve: 0, openActions: 0 });
  });
});

suite('lessons-learned Model — Lesefläche und Katalog', () => {
  const entryOf = schemaAgentEntry(State);
  /** @param {object} m @param {object} [options] */
  const read = (m, options) => readSchemaModel(entryOf, m, options, evaluateDerived(m, /** @type {any} */ (undefined)));

  test('read() mit allen Zeilen: lessons und stats', () => {
    const out = read(stored(), { fields: ['lessons', 'stats'] });
    assertEqual(json(out.lessons), json(LIST));
    assertDeepEqual(out.stats, { total: 3, success: 1, problem: 1, improve: 1, openActions: 2 });
  });
  test('Katalog: read und die sieben Kommandos mit Objekt-Argumenten', () => {
    assertDeepEqual(Object.keys(entryOf.actions), [
      'read', 'addLesson', 'updateLesson', 'removeLesson', 'addAction', 'removeAction', 'setActionDone', 'importLessons',
    ]);
    const keys = ['title', 'category', 'impact', 'phase', 'owner', 'description', 'rootCause', 'recommendation', 'actions'];
    assertDeepEqual(Object.keys(entryOf.actions.addLesson.keys), keys);
    assertDeepEqual(Object.keys(entryOf.actions.updateLesson.keys), ['lessonId', ...keys]);
    assertDeepEqual(Object.keys(entryOf.actions.setActionDone.keys), ['lessonId', 'actionIndex', 'done']);
    assertDeepEqual(Object.keys(entryOf.actions.importLessons.keys), ['json']);
  });
  test('instance.set: kein Feld; stats ist abgeleitet', () => {
    assertDeepEqual(entryOf.settable, []);
    assertDeepEqual(entryOf.invariants, ['uniqueIds']);
    assertEqual(entryOf.fields.stats.derived, true);
  });
});

// Die Fälle der alten Suite (tests/modules/lessons-learned.test.js), auf die
// neue Form übertragen: Lesson/Action.fromJSON → Migration über
// State.fromJSON ohne `_schema`, computeStats → derived `stats`.
suite('lessons-learned Model — Fälle der Altsuite', () => {
  /** @param {any} lessons @returns {any} */
  const load = (lessons) => State.fromJSON({ lessons });
  test('fromJSON(null|undefined|ohne Liste): leer', () => {
    for (const v of [null, undefined, { lessons: 'invalid' }]) assertEqual(State.fromJSON(/** @type {any} */ (v)).lessons.length, 0);
  });
  test('Maßnahme: Vorgaben, Text und Haken bereinigt', () => {
    const m = load([{ id: 'a', actions: [null, undefined, { text: 'Do', done: true }, { text: 123, done: 'yes' }] }]);
    assertEqual(json(m.lessons[0].actions), json([
      { text: '', done: false }, { text: '', done: false }, { text: 'Do', done: true }, { text: '', done: false },
    ]));
  });
  test('Erfahrung mit Mindestangaben: Vorgaben success/control/medium', () => {
    const l = load([{ id: 'a', title: 'T' }]).lessons[0];
    assertDeepEqual([l.category, l.phase, l.impact], ['success', 'control', 'medium']);
  });
  test('alle Angaben bleiben; Rundweg verlustfrei', () => {
    const full = entry({ id: 'a', title: 'T', category: 'improve', phase: 'analyze', impact: 'low', owner: 'O', description: 'D',
      rootCause: 'R', recommendation: 'E', actions: [{ text: 'A1', done: false }], createdAt: 5000, updatedAt: 6000 });
    const m = load([full]);
    assertEqual(json(m.lessons[0]), json(full));
    assertEqual(json(State.fromJSON(plain(m.toJSON())).toJSON()), json(m.toJSON()));
  });
  test('neue ids sind verschieden', () => {
    const m = new State();
    const ids = new Set(Array.from({ length: 20 }, (_, i) => m.addLesson({ title: `L${i}` })));
    assertEqual(ids.size, 20);
  });
});
