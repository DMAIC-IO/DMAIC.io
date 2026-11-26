/**
 * Tests for modules/todo/domain/model.js — Schema und Vorgaben, gespeicherte
 * Stände '1.0' (auch das Altprojekt), Versionsprüfung, die Invariante
 * `itemIds` (streng, mit Reparatur, beim Schreiben), alle Kommandos samt
 * Ablehnungen, `moveTodo` mit und ohne angezeigte Folge, `updateTodo`,
 * `sortBy`, `hasContent`, die Lesefläche ohne Ansichtsfelder und der
 * Agentenkatalog.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/todo/domain/model.js';
import { setModelName, setFields } from '../../../js/core/model.js';
import { loadModel } from '../../../js/core/initial-model.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';

setModelName(State, 'todo');

const SCHEMA = { _schema: { name: 'todo', version: '1.0' } };
const VIEW = { filterStatus: 'all', filterOwner: 'all', search: '', sortCol: 'due', sortAsc: true };
const EMPTY = { ...SCHEMA, items: [], ...VIEW };

/** Liste 1 des Altprojekts (`legacy-project.json`), gespeichert mit `_schema` '1.0'. */
const LEGACY = {
  ...SCHEMA,
  items: [
    { id: 't-a', text: 'Lieferantenaudit planen', owner: 'Jürgen Weiß', due: '2026-06-05', status: 'open', cal: true },
    { id: 't-b', text: 'Prüfmittel kalibrieren', owner: 'Anna Müller', due: '2026-06-03', status: 'in-progress', cal: true },
    { id: 't-c', text: 'Maßnahmenplan prüfen', owner: 'Jürgen Weiß', due: 'KW 23', status: 'open', cal: false },
    { id: 't-d', text: 'Schulung Öffnungszeiten', owner: 'Anna Müller', due: '2026-06-10', status: 'open', cal: true },
    { id: 't-e', text: 'Abschlussbericht', owner: '', due: '', status: 'done', cal: false },
    { id: 't-f', text: 'Ersatzteile bestellen', owner: 'Björn Groß', due: '2026-06-12', status: 'blocked', cal: true },
  ],
  filterStatus: 'open', filterOwner: 'all', search: 'plan', sortCol: 'manual', sortAsc: true,
};

const plain = (v) => JSON.parse(JSON.stringify(v));
const json = (v) => JSON.stringify(v);
const ids = (m) => m.items.map((i) => i.id);
/** @returns {any} */
const legacy = () => State.fromJSON(plain(LEGACY));

/** @param {() => any} fn @returns {any} */
function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

/** @param {object} j */
function repaired(j) {
  const fields = [];
  const m = State.fromJSON(j, { repair: true, onRepair: (f) => fields.push(f) });
  return { m, fields };
}

/** Model mit Einträgen a, b, c, d (Text = id). @param {...string} list @returns {any} */
function withItems(...list) {
  return State.fromJSON({ ...SCHEMA, items: list.map((id) => ({ id, text: id, owner: '', due: '', status: 'open', cal: false })) });
}

suite('todo Model — Schema und Vorgaben', () => {
  test('Felder, Ansichtsfelder und Version', () => {
    assertDeepEqual(Object.keys(State.schema.fields), ['items']);
    assertDeepEqual(Object.keys(State.schema.view), ['filterStatus', 'filterOwner', 'search', 'sortCol', 'sortAsc']);
    assertEqual(State.schema.version, '1.0');
    assertDeepEqual(Object.keys(State.schema.migrations), ['0→1.0']);
  });
  test('Vorgaben: leer, Filter „alle“, Sortierung nach Zieldatum aufsteigend; kein Inhalt', () => {
    const m = new State();
    assertEqual(json(m.toJSON()), json(EMPTY));
    assertEqual(m.hasContent(), false);
  });
});

suite('todo Model — gespeicherter Stand 1.0', () => {
  test('lädt streng und ohne Reparatur, toJSON zeichengleich (auch „KW 23“)', () => {
    assertEqual(thrown(() => State.fromJSON(plain(LEGACY))), null);
    const { m, fields } = repaired(plain(LEGACY));
    assertDeepEqual(fields, []);
    assertEqual(json(m.toJSON()), json(LEGACY));
  });
  test('Laden wie beim Einhängen ergibt denselben Stand', () => {
    assertEqual(json(loadModel(State, plain(LEGACY)).toJSON()), json(LEGACY));
  });
  test('Beginn und Dauer dürfen fehlen und bleiben, wenn gesetzt', () => {
    const j = plain(LEGACY);
    j.items[0].time = '14:30';
    j.items[0].duration = 45;
    assertEqual(json(State.fromJSON(plain(j)).toJSON()), json(j));
  });
  test('{} lädt als leeres Model', () => {
    assertEqual(json(State.fromJSON({}).toJSON()), json(EMPTY));
  });
  test('ein Eintrag mit fremdem Status oder Nicht-Text ist streng ungültig und entfällt mit Reparatur', () => {
    for (const bad of [{ status: 'erledigt' }, { text: 3 }, { cal: 'ja' }, { time: '09:03' }, { duration: 2 }]) {
      const j = plain(LEGACY);
      Object.assign(j.items[1], bad);
      assertTrue(thrown(() => State.fromJSON(plain(j))) instanceof Error, json(bad));
      const { m } = repaired(plain(j));
      assertDeepEqual(ids(m), ['t-a', 't-c', 't-d', 't-e', 't-f'], json(bad));
    }
  });
  test('höhere oder unlesbare Version wird abgewiesen', () => {
    assertThrows(() => State.fromJSON({ ...plain(LEGACY), _schema: { name: 'todo', version: '2.0' } }), /_schema\.version/);
    assertThrows(() => State.fromJSON({ ...plain(LEGACY), _schema: { version: 'x' } }, { repair: true }), /_schema\.version/);
  });
});

suite('todo Model — Invariante itemIds', () => {
  const withIds = (...list) => ({ ...SCHEMA, items: list.map((id) => ({ id, text: id, owner: '', due: '', status: 'open', cal: false })) });

  test('leere und doppelte ids sind streng ungültig', () => {
    assertTrue(thrown(() => State.fromJSON(withIds('a', ''))) instanceof Error);
    assertTrue(thrown(() => State.fromJSON(withIds('a', 'a'))) instanceof Error);
  });
  test('Reparatur: Ersatz aus der Position nur für leere und doppelte, Kollision mit „_“; vorhandene bleiben', () => {
    const { m, fields } = repaired(withIds('a', '', 'a', 't2'));
    assertDeepEqual(fields, ['items']);
    assertDeepEqual(ids(m), ['a', 't2_', 't3', 't2']);
    assertDeepEqual(m.items.map((i) => i.text), ['a', '', 'a', 't2']);
  });
  test('Schreiben mit doppelter id wird abgelehnt und lässt den Stand', () => {
    const m = withItems('a', 'b');
    const before = json(m.toJSON());
    const items = plain(m.items);
    items[1].id = 'a';
    const err = thrown(() => setFields(m, { items }));
    assertTrue(err instanceof Error);
    assertEqual(json(m.toJSON()), before);
  });
});

suite('todo Model — Kommandos', () => {
  test('addTodo legt einen leeren offenen Eintrag am Ende an und liefert seine id', () => {
    const m = withItems('a');
    const id = m.addTodo({});
    assertEqual(typeof id, 'string');
    assertTrue(id !== '' && id !== 'a');
    assertDeepEqual(plain(m.items.at(-1)), { id, text: '', owner: '', due: '', status: 'open', cal: false });
    assertEqual(m.hasContent(), true);
  });
  test('Setter schreiben genau einen Eintrag', () => {
    const m = withItems('a', 'b');
    m.setTodoText({ itemId: 'b', text: 'Teigruhe messen' });
    m.setTodoOwner({ itemId: 'b', owner: 'L. Becker' });
    m.setTodoDue({ itemId: 'b', isoDate: '2026-12-31' });
    m.setTodoStatus({ itemId: 'b', status: 'in-progress' });
    m.setTodoCalendar({ itemId: 'b', inCalendar: true });
    assertDeepEqual(plain(m.items[1]), { id: 'b', text: 'Teigruhe messen', owner: 'L. Becker', due: '2026-12-31', status: 'in-progress', cal: true });
    assertDeepEqual(plain(m.items[0]), { id: 'a', text: 'a', owner: '', due: '', status: 'open', cal: false });
    m.setTodoDue({ itemId: 'b', isoDate: '' });
    m.setTodoText({ itemId: 'b', text: '' });
    assertEqual(m.items[1].due, '');
    assertEqual(m.items[1].text, '');
  });
  test('Ablehnungen: unbekannte id, Status außerhalb, Datum nicht ISO, kein Wahrheitswert, fehlendes Argument', () => {
    const m = withItems('a');
    const before = json(m.toJSON());
    for (const [cmd, args] of [
      ['setTodoText', { itemId: 'fehlt', text: 'x' }],
      ['setTodoOwner', { itemId: 'fehlt', owner: 'x' }],
      ['setTodoDue', { itemId: 'fehlt', isoDate: '2026-01-01' }],
      ['setTodoStatus', { itemId: 'fehlt', status: 'done' }],
      ['setTodoCalendar', { itemId: 'fehlt', inCalendar: true }],
      ['removeTodo', { itemId: 'fehlt' }],
      ['moveTodo', { itemId: 'fehlt', to: 0 }],
      ['updateTodo', { itemId: 'fehlt', text: 'x' }],
      ['setTodoStatus', { itemId: 'a', status: 'erledigt' }],
      ['setTodoDue', { itemId: 'a', isoDate: '31.12.2026' }],
      ['setTodoDue', { itemId: 'a', isoDate: '2026-02-30' }],
      ['setTodoCalendar', { itemId: 'a', inCalendar: 'ja' }],
      ['setTodoText', { itemId: 'a' }],
      ['setTodoCalendar', { itemId: 'a' }],
      ['setTodoDue', { itemId: 'a' }],
    ]) {
      const err = thrown(() => m[cmd](args));
      assertTrue(err instanceof Error, `${cmd} ${json(args)}`);
      assertTrue(typeof err.param === 'string', `${cmd}: param`);
    }
    assertEqual(json(m.toJSON()), before);
  });
  test('removeTodo entfernt genau den Eintrag', () => {
    const m = withItems('a', 'b', 'c');
    m.removeTodo({ itemId: 'b' });
    assertDeepEqual(ids(m), ['a', 'c']);
  });
  test('updateTodo ändert die genannten Angaben, die übrigen bleiben; prüft Datum, Raster und Dauer', () => {
    const m = withItems('a');
    m.updateTodo({ itemId: 'a', text: 'Neu', due: '2026-06-10', time: '14:05', duration: 45 });
    assertDeepEqual(plain(m.items[0]), { id: 'a', text: 'Neu', owner: '', due: '2026-06-10', status: 'open', cal: false, time: '14:05', duration: 45 });
    m.updateTodo({ itemId: 'a', time: '08:00' });
    assertEqual(m.items[0].text, 'Neu');
    assertEqual(m.items[0].duration, 45);
    for (const bad of [{ due: '10.06.2026' }, { time: '14:03' }, { duration: 4 }, { duration: 30.5 }]) {
      const err = thrown(() => m.updateTodo({ itemId: 'a', ...bad }));
      assertTrue(err instanceof Error && typeof err.param === 'string', json(bad));
    }
    assertEqual(m.items[0].time, '08:00');
  });
});

suite('todo Model — moveTodo (Endindex)', () => {
  test('verschiebt nach unten und oben in der gespeicherten Folge und schaltet auf manuell', () => {
    const m = withItems('a', 'b', 'c', 'd');
    assertEqual(m.sortCol, 'due');
    m.moveTodo({ itemId: 'a', to: 2 });
    assertDeepEqual(ids(m), ['b', 'c', 'a', 'd']);
    assertEqual(m.sortCol, 'manual');
    m.moveTodo({ itemId: 'd', to: 0 });
    assertDeepEqual(ids(m), ['d', 'b', 'c', 'a']);
  });
  test('ans Ende ist möglich (die Altform konnte nur „vor ein Ziel“)', () => {
    const m = withItems('a', 'b', 'c');
    m.moveTodo({ itemId: 'a', to: 2 });
    assertDeepEqual(ids(m), ['b', 'c', 'a']);
  });
  test('am Ausgangsplatz ändert sich nichts, auch nicht die Sortierung', () => {
    const m = withItems('a', 'b', 'c');
    m.moveTodo({ itemId: 'b', to: 1 });
    assertDeepEqual(ids(m), ['a', 'b', 'c']);
    assertEqual(m.sortCol, 'due');
  });
  test('Stelle außerhalb wird abgelehnt', () => {
    const m = withItems('a', 'b');
    for (const to of [2, -1, 0.5]) assertTrue(thrown(() => m.moveTodo({ itemId: 'a', to })) instanceof Error, String(to));
  });
  test('mit shownIds wird die angezeigte Folge zuerst gespeichert, Ausgeblendete folgen', () => {
    const m = withItems('a', 'b', 'c', 'd');
    // angezeigt (sortiert): c, b, d, a — a kommt an Stelle 1
    m.moveTodo({ itemId: 'a', to: 1, shownIds: ['c', 'b', 'd', 'a'] });
    assertDeepEqual(ids(m), ['c', 'a', 'b', 'd']);
    const f = withItems('a', 'b', 'c', 'd');
    // gefiltert: nur d und c sichtbar; d nach unten
    f.moveTodo({ itemId: 'd', to: 1, shownIds: ['d', 'c'] });
    assertDeepEqual(ids(f), ['c', 'd', 'a', 'b']);
    assertEqual(f.sortCol, 'manual');
  });
  test('mit shownIds: Stelle nur unter den angezeigten; unbekannte ids in der Folge zählen nicht', () => {
    const m = withItems('a', 'b', 'c');
    assertTrue(thrown(() => m.moveTodo({ itemId: 'a', to: 2, shownIds: ['a', 'b'] })) instanceof Error);
    m.moveTodo({ itemId: 'b', to: 0, shownIds: ['a', 'x', 'b'] });
    assertDeepEqual(ids(m), ['b', 'a', 'c']);
  });
});

suite('todo Model — sortBy', () => {
  test('neue Spalte aufsteigend, dieselbe Spalte dreht die Richtung, nach manuell wieder aufsteigend', () => {
    const m = withItems('a');
    m.sortBy({ column: 'text' });
    assertEqual(json([m.sortCol, m.sortAsc]), json(['text', true]));
    m.sortBy({ column: 'text' });
    assertEqual(json([m.sortCol, m.sortAsc]), json(['text', false]));
    m.sortBy({ column: 'status' });
    assertEqual(json([m.sortCol, m.sortAsc]), json(['status', true]));
    m.moveTodo({ itemId: 'a', to: 0, shownIds: ['a'] });
    m.sortBy({ column: 'due' });
    assertEqual(json([m.sortCol, m.sortAsc]), json(['due', true]));
    assertTrue(thrown(() => m.sortBy({ column: 'manual' })) instanceof Error);
  });
  test('Sortieren und Filtern sind kein Inhalt', () => {
    const m = new State();
    m.sortBy({ column: 'owner' });
    assertEqual(m.hasContent(), false);
  });
});

suite('todo Model — Lesefläche und Agentenkatalog', () => {
  const entry = schemaAgentEntry(State);
  /** @param {object} m @param {object} [options] */
  const read = (m, options) => readSchemaModel(entry, m, options);

  test('read() ohne Ansichtsfelder; items ohne Parameter nur als Umfang', () => {
    const lean = read(legacy());
    assertDeepEqual(Object.keys(lean), ['items']);
    assertEqual(lean.items.$bulk, true);
    assertEqual(lean.items.rowCount, 6);
    const full = read(legacy(), { fields: ['items'] });
    assertEqual(json(full.items), json(LEGACY.items));
  });
  test('Katalog: read und die Kommandos mit Objekt-Argumenten, ohne sortBy', () => {
    assertDeepEqual(Object.keys(entry.actions), [
      'read', 'addTodo', 'setTodoText', 'setTodoOwner', 'setTodoDue', 'setTodoStatus',
      'setTodoCalendar', 'removeTodo', 'moveTodo', 'updateTodo',
    ]);
    assertDeepEqual(Object.keys(entry.actions.moveTodo.keys), ['itemId', 'to', 'shownIds']);
    assertDeepEqual(Object.keys(entry.actions.updateTodo.keys), ['itemId', 'text', 'due', 'time', 'duration']);
  });
  test('instance.set: items; Invariante itemIds', () => {
    assertDeepEqual(entry.settable, ['items']);
    assertDeepEqual(entry.invariants, ['itemIds']);
  });
});
