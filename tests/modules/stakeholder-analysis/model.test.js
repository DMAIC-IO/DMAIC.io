/**
 * Tests for modules/stakeholder-analysis/domain/model.js — Schema und
 * Vorgaben, gespeicherte Stände '1.1', Versionsprüfung, die Invariante
 * `uniqueIds` (streng, mit Reparatur, beim Schreiben), die drei Kommandos
 * samt Ablehnungen, `current` und `confirm`, `hasContent`, die Ableitung
 * `quadrants`, Lesefläche und Agentenkatalog; dazu die 28 Fälle der alten
 * Suite in der neuen Form.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../../test-utils.js';
import { State, SUPPORT_VALUES, CATEGORY_VALUES, QUAD_ORDER } from '../../../js/modules/stakeholder-analysis/domain/model.js';
import { quadrantCounts, supportCounts, criticalCritics } from '../../../js/modules/stakeholder-analysis/domain/quadrant.js';
import { setModelName, confirmOf, currentOf } from '../../../js/core/model.js';
import { loadModel } from '../../../js/core/initial-model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';

setModelName(State, 'stakeholder-analysis');

const SCHEMA = { _schema: { name: 'stakeholder-analysis', version: '1.1' } };
const json = (v) => JSON.stringify(v);
const plain = (v) => JSON.parse(JSON.stringify(v));

/** Ein Eintrag in Normalform. @param {object} e */
const entry = (e) => ({ id: '', name: '', role: '', power: 3, interest: 3, support: 'neutral', category: 'intern', notes: '', ...e });

const LIST = [
  entry({ id: 'a', name: 'Alice', role: 'CEO', power: 5, interest: 5, support: 'supporter' }),
  entry({ id: 'b', name: 'Bob', power: 1, interest: 5, support: 'resistor', category: 'Sponsor', notes: 'n' }),
  entry({ id: 'c', name: 'Carl', power: 5, interest: 1, support: 'critic', category: 'kunde' }),
];
const STORED = { ...SCHEMA, stakeholders: LIST };

/** @returns {any} */
const stored = () => State.fromJSON(plain(STORED));
/** @param {object} m */
const fieldsOf = (m) => { const { _schema, ...rest } = plain(m.toJSON()); return rest; };
/** @param {object} m @returns {any} */
const quadrants = (m) => evaluateDerived(m, /** @type {any} */ (undefined), ['quadrants']).quadrants;

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

suite('stakeholder-analysis Model — Schema und Vorgaben', () => {
  test('ein Feld, keine Ansichtsfelder, drei Kommandos, eine Invariante, eine Ableitung als Massenfeld', () => {
    assertDeepEqual(Object.keys(State.schema.fields), ['stakeholders']);
    assertDeepEqual(Object.keys(State.schema.view), []);
    assertDeepEqual(Object.keys(State.schema.commands), ['addStakeholder', 'updateStakeholder', 'removeStakeholder']);
    assertDeepEqual(Object.keys(State.schema.invariants), ['uniqueIds']);
    assertEqual(typeof State.schema.invariants.uniqueIds.repair, 'function');
    assertDeepEqual([...State.schema.invariants.uniqueIds.fields], ['stakeholders']);
    assertDeepEqual(Object.keys(State.schema.derived), ['quadrants']);
    assertDeepEqual([...State.schema.derivedBulk], ['quadrants']);
  });
  test('Feldart: Liste von Objekten mit acht Schlüsseln, Massenfeld, nicht per instance.set', () => {
    const f = State.schema.fields.stakeholders;
    assertEqual(f.kind, 'list');
    assertEqual(f.bulk, true);
    assertEqual(f.agentWrite, false);
    assertDeepEqual(Object.keys(f.item.shape), ['id', 'name', 'role', 'power', 'interest', 'support', 'category', 'notes']);
    for (const k of ['power', 'interest']) {
      const s = f.item.shape[k];
      assertEqual(s.kind, 'number', k);
      assertEqual(s.integer, true, k);
      assertEqual(s.min, 1, k);
      assertEqual(s.max, 5, k);
    }
    for (const k of ['support', 'category']) assertEqual(f.item.shape[k].kind, 'text', k);
  });
  test('Vorgabe: leer, kein Inhalt, toJSON mit _schema 1.1', () => {
    const m = new State();
    assertEqual(json(m.toJSON()), json({ ...SCHEMA, stakeholders: [] }));
    assertEqual(m.hasContent(), false);
  });
  test('re-exportiert die Wertemengen und die Rangfolge', () => {
    assertDeepEqual([...SUPPORT_VALUES], ['supporter', 'neutral', 'critic']);
    assertDeepEqual([...CATEGORY_VALUES], ['intern', 'extern', 'kunde', 'lieferant', 'behoerde']);
    assertDeepEqual([...QUAD_ORDER], ['manage-closely', 'keep-satisfied', 'keep-informed', 'monitor']);
  });
});

suite('stakeholder-analysis Model — gespeicherter Stand 1.1', () => {
  test('lädt streng und ohne Reparatur, toJSON zeichengleich; Fremdwerte bleiben', () => {
    assertEqual(thrown(() => State.fromJSON(plain(STORED))), null);
    const { m, fields } = repaired(plain(STORED));
    assertDeepEqual(fields, []);
    assertEqual(json(m.toJSON()), json(STORED));
  });
  test('Laden wie beim Einhängen ergibt denselben Stand', () => {
    assertEqual(json(loadModel(State, plain(STORED)).toJSON()), json(STORED));
  });
  test('läuft ohne Migrationsschritt: power 7 ist in 1.1 ungültig', () => {
    const j = { ...SCHEMA, stakeholders: [entry({ id: 'a', power: 7 })] };
    assertTrue(thrown(() => State.fromJSON(j)) instanceof Error);
  });
  test('Rundweg toJSON → fromJSON ist verlustfrei', () => {
    assertEqual(json(State.fromJSON(plain(stored().toJSON())).toJSON()), json(STORED));
  });
});

suite('stakeholder-analysis Model — Versionsprüfung', () => {
  test('höhere Version 2.0 wird abgewiesen, auch mit Reparatur und beim Einhängen', () => {
    const v2 = { ...plain(STORED), _schema: { name: 'stakeholder-analysis', version: '2.0' } };
    assertThrows(() => State.fromJSON(v2), /_schema\.version/);
    assertThrows(() => State.fromJSON(v2, { repair: true }), /_schema\.version/);
    assertThrows(() => loadModel(State, v2), /_schema\.version/);
  });
  test('unlesbare Version wird abgewiesen', () => {
    assertThrows(() => State.fromJSON({ ...plain(STORED), _schema: { version: 'x' } }), /_schema\.version/);
  });
});

suite('stakeholder-analysis Model — Invariante uniqueIds', () => {
  test('doppelte id: streng abgewiesen; mit Reparatur entfällt die spätere', () => {
    const j = { ...SCHEMA, stakeholders: [...LIST, entry({ id: 'a', name: 'Doppelt' })] };
    const err = thrown(() => State.fromJSON(plain(j)));
    assertEqual(err?.invariant, 'uniqueIds');
    assertEqual(err?.param, 'stakeholders');
    const { m, fields } = repaired(plain(j));
    assertDeepEqual(fields, ['stakeholders']);
    assertEqual(json(fieldsOf(m)), json({ stakeholders: LIST }));
  });
  test('leere id: streng abgewiesen; mit Reparatur entfällt der Eintrag', () => {
    const j = { ...SCHEMA, stakeholders: [entry({ id: '', name: 'Leer' }), ...LIST] };
    assertEqual(thrown(() => State.fromJSON(plain(j)))?.invariant, 'uniqueIds');
    assertEqual(json(fieldsOf(repaired(plain(j)).m)), json({ stakeholders: LIST }));
  });
  test('Schreiben mit doppelter id rollt zurück', () => {
    const m = stored();
    const err = thrown(() => { m.stakeholders = [...LIST, entry({ id: 'b' })]; });
    assertEqual(err?.invariant, 'uniqueIds');
    assertEqual(json(fieldsOf(m)), json({ stakeholders: LIST }));
  });
});

suite('stakeholder-analysis Model — addStakeholder', () => {
  test('nur mit Namen: Vorgaben 3/3/neutral/intern, getrimmt, liefert die neue id mit Präfix s', () => {
    const m = new State();
    const id = m.addStakeholder({ name: '  Alice  ' });
    assertTrue(typeof id === 'string' && id.length > 1 && id.startsWith('s'), id);
    assertEqual(json(m.stakeholders), json([entry({ id, name: 'Alice' })]));
  });
  test('alle Angaben, getrimmt; zwei Einträge, zwei verschiedene ids; über execute', () => {
    const m = new State();
    const a = m.addStakeholder({ name: 'A', role: ' CEO ', power: 5, interest: 4, support: 'critic', category: 'behoerde', notes: ' x ' });
    const b = /** @type {string} */ (m.execute({ type: 'addStakeholder', name: 'B' }));
    assertTrue(a !== b);
    assertEqual(json(m.stakeholders[0]), json(entry({ id: a, name: 'A', role: 'CEO', power: 5, interest: 4, support: 'critic', category: 'behoerde', notes: 'x' })));
    assertEqual(m.stakeholders[1].name, 'B');
  });
  test('Zahltext für power und interest wird Zahl', () => {
    const m = new State();
    m.addStakeholder({ name: 'A', power: '4', interest: '2' });
    assertEqual(m.stakeholders[0].power, 4);
    assertEqual(m.stakeholders[0].interest, 2);
  });
  const REJECT = [
    ['leerer Name', { name: '   ' }, 'name'],
    ['ohne Namen', {}, 'name'],
    ['power 0', { name: 'A', power: 0 }, 'power'],
    ['power 6', { name: 'A', power: 6 }, 'power'],
    ['power 2.5', { name: 'A', power: 2.5 }, 'power'],
    ['power Text', { name: 'A', power: 'viel' }, 'power'],
    ['interest 9', { name: 'A', interest: 9 }, 'interest'],
    ['support resistor', { name: 'A', support: 'resistor' }, 'support'],
    ['category Sponsor', { name: 'A', category: 'Sponsor' }, 'category'],
  ];
  for (const [what, args, param] of REJECT) {
    test(`${what}: abgelehnt mit param ${param}, nichts angelegt`, () => {
      const m = new State();
      const err = thrown(() => m.addStakeholder(/** @type {any} */ (args)));
      assertEqual(err?.param, param);
      assertEqual(m.stakeholders.length, 0);
    });
  }
});

suite('stakeholder-analysis Model — updateStakeholder', () => {
  test('ändert nur die genannten Angaben, getrimmt', () => {
    const m = stored();
    m.updateStakeholder({ id: 'b', name: ' Robert ', power: '4' });
    assertEqual(json(m.stakeholders[1]), json({ ...LIST[1], name: 'Robert', power: 4 }));
    assertEqual(json(m.stakeholders[0]), json(LIST[0]));
  });
  test('jede Angabe einzeln', () => {
    const m = stored();
    m.updateStakeholder({ id: 'a', role: ' Chef ' });
    m.updateStakeholder({ id: 'a', interest: 2 });
    m.updateStakeholder({ id: 'a', support: 'neutral' });
    m.updateStakeholder({ id: 'a', category: 'lieferant' });
    m.updateStakeholder({ id: 'a', notes: ' n ' });
    assertEqual(json(m.stakeholders[0]), json(entry({ id: 'a', name: 'Alice', role: 'Chef', power: 5, interest: 2, support: 'neutral', category: 'lieferant', notes: 'n' })));
  });
  test('Fremdwerte des Bestands bleiben, solange sie nicht genannt sind', () => {
    const m = stored();
    m.updateStakeholder({ id: 'b', notes: 'neu' });
    assertEqual(m.stakeholders[1].support, 'resistor');
    assertEqual(m.stakeholders[1].category, 'Sponsor');
  });
  const REJECT = [
    ['ohne eine Angabe neben id', { id: 'a' }, 'command'],
    ['unbekannte id', { id: 'zz', name: 'X' }, 'id'],
    ['leerer Name', { id: 'a', name: ' ' }, 'name'],
    ['power 6', { id: 'a', power: 6 }, 'power'],
    ['support resistor', { id: 'a', support: 'resistor' }, 'support'],
    ['category Sponsor', { id: 'a', category: 'Sponsor' }, 'category'],
  ];
  for (const [what, args, param] of REJECT) {
    test(`${what}: abgelehnt mit param ${param}, Zustand unverändert`, () => {
      const m = stored();
      const err = thrown(() => m.updateStakeholder(/** @type {any} */ (args)));
      assertEqual(err?.param, param);
      assertEqual(json(fieldsOf(m)), json({ stakeholders: LIST }));
    });
  }
  test('current liefert die Werte, Haltung und Kategorie auf die Wertemenge normalisiert', () => {
    const m = stored();
    assertDeepEqual(currentOf(m, 'updateStakeholder', { id: 'a' }),
      { name: 'Alice', role: 'CEO', power: 5, interest: 5, support: 'supporter', category: 'intern', notes: '' });
    assertDeepEqual(currentOf(m, 'updateStakeholder', { id: 'b' }),
      { name: 'Bob', role: '', power: 1, interest: 5, support: 'neutral', category: 'intern', notes: 'n' });
    assertEqual(thrown(() => currentOf(m, 'updateStakeholder', { id: 'nope' }))?.param, 'id');
  });
});

suite('stakeholder-analysis Model — removeStakeholder', () => {
  test('entfernt nur den Eintrag', () => {
    const m = stored();
    m.removeStakeholder({ id: 'b' });
    assertEqual(json(m.stakeholders), json([LIST[0], LIST[2]]));
  });
  test('unbekannte id: abgelehnt mit param id', () => {
    const m = stored();
    assertEqual(thrown(() => m.removeStakeholder({ id: 'x' }))?.param, 'id');
    assertEqual(m.stakeholders.length, 3);
  });
  test('confirm nennt den Namen', () => {
    assertDeepEqual(confirmOf(stored(), 'removeStakeholder', { id: 'b' }), { key: 'confirm.removeStakeholder', params: { name: 'Bob' } });
  });
});

suite('stakeholder-analysis Model — hasContent und quadrants', () => {
  test('hasContent: leer false, ein Eintrag true, wieder entfernt false', () => {
    const m = new State();
    assertEqual(m.hasContent(), false);
    const id = m.addStakeholder({ name: 'A' });
    assertEqual(m.hasContent(), true);
    m.removeStakeholder({ id });
    assertEqual(m.hasContent(), false);
  });
  test('quadrants: id und Quadrant je Eintrag, in Listenreihenfolge, folgt den Kommandos', () => {
    const m = stored();
    assertEqual(json(quadrants(m)), json([
      { id: 'a', quadrant: 'manage-closely' }, { id: 'b', quadrant: 'keep-informed' }, { id: 'c', quadrant: 'keep-satisfied' },
    ]));
    m.updateStakeholder({ id: 'b', power: 4 });
    assertEqual(quadrants(m)[1].quadrant, 'manage-closely');
    assertEqual(json(quadrants(new State())), json([]));
  });
});

suite('stakeholder-analysis Model — Lesefläche und Katalog', () => {
  const entryOf = schemaAgentEntry(State);
  /** @param {object} m @param {object} [options] */
  const read = (m, options) => readSchemaModel(entryOf, m, options, evaluateDerived(m, /** @type {any} */ (undefined)));

  test('read() mit allen Zeilen: stakeholders und quadrants', () => {
    const out = read(stored(), { fields: ['stakeholders', 'quadrants'] });
    assertDeepEqual(Object.keys(out).filter((k) => !k.endsWith('Columns')).slice(0, 2), ['stakeholders', 'quadrants']);
    assertEqual(json(out.stakeholders), json(LIST));
    assertEqual(json(out.quadrants), json(quadrants(stored())));
  });
  test('Katalog: read und die drei Kommandos mit Objekt-Argumenten', () => {
    assertDeepEqual(Object.keys(entryOf.actions), ['read', 'addStakeholder', 'updateStakeholder', 'removeStakeholder']);
    const keys = ['name', 'role', 'power', 'interest', 'support', 'category', 'notes'];
    assertDeepEqual(Object.keys(entryOf.actions.addStakeholder.keys), keys);
    assertDeepEqual(Object.keys(entryOf.actions.updateStakeholder.keys), ['id', ...keys]);
    assertDeepEqual(Object.keys(entryOf.actions.removeStakeholder.keys), ['id']);
  });
  test('instance.set: kein Feld; quadrants ist abgeleitet', () => {
    assertDeepEqual(entryOf.settable, []);
    assertDeepEqual(entryOf.invariants, ['uniqueIds']);
    assertEqual(entryOf.fields.quadrants.derived, true);
  });
});

// Die 28 Fälle der alten Suite (tests/modules/stakeholder-analysis.test.js),
// je auf die neue Form übertragen: Stakeholder.fromJSON → Migration über
// State.fromJSON ohne `_schema`, `s.quadrant` → derived `quadrants`.
suite('stakeholder-analysis Model — Fälle der Altsuite', () => {
  /** Ein Eintrag über die Migration. @param {object} d */
  const one = (d) => State.fromJSON({ stakeholders: [d] }).stakeholders[0];
  /** @param {object} d */
  const quadOf = (d) => quadrants(State.fromJSON({ stakeholders: [{ id: 'q', ...d }] }))[0].quadrant;

  test('1 Vorgaben eines Eintrags', () => {
    const s = one({});
    assertEqual(json({ ...s, id: '' }), json(entry({})));
  });
  test('2 hoch/hoch → manage-closely', () => assertEqual(quadOf({ power: 5, interest: 5 }), 'manage-closely'));
  test('3 hoch/gering → keep-satisfied', () => assertEqual(quadOf({ power: 5, interest: 1 }), 'keep-satisfied'));
  test('4 gering/hoch → keep-informed', () => assertEqual(quadOf({ power: 1, interest: 5 }), 'keep-informed'));
  test('5 gering/gering → monitor', () => assertEqual(quadOf({ power: 1, interest: 1 }), 'monitor'));
  test('6 Grenze 4/4 → manage-closely', () => assertEqual(quadOf({ power: 4, interest: 4 }), 'manage-closely'));
  test('7 toJSON liefert alle gespeicherten Angaben', () => {
    const d = { id: 'x1', name: 'Alice', role: 'CEO', power: 5, interest: 4, support: 'supporter', category: 'extern', notes: 'hi' };
    assertEqual(json(one(d)), json(d));
  });
  test('8 gültige Daten bleiben', () => {
    const s = one({ id: 'i', name: 'Bob', power: 2, interest: 3, support: 'critic', category: 'kunde' });
    assertEqual(s.name, 'Bob');
    assertEqual(s.power, 2);
    assertEqual(s.support, 'critic');
    assertEqual(s.category, 'kunde');
  });
  test('9 fremde Haltung bleibt wörtlich (resistor)', () => assertEqual(one({ name: 'X', support: 'resistor' }).support, 'resistor'));
  test('10 Haltung neutral nur ohne oder bei Nicht-Text', () => {
    assertEqual(one({ name: 'X' }).support, 'neutral');
    assertEqual(one({ name: 'X', support: 42 }).support, 'neutral');
  });
  test('11 fremde Kategorie bleibt wörtlich (Sponsor)', () => assertEqual(one({ name: 'X', category: 'Sponsor' }).category, 'Sponsor'));
  test('12 Kategorie intern nur ohne oder bei Nicht-Text', () => {
    assertEqual(one({ name: 'X' }).category, 'intern');
    assertEqual(one({ name: 'X', category: null }).category, 'intern');
  });
  test('13 Stufen auf 1–5 geklemmt, Unlesbares wird 3', () => {
    const lo = one({ name: 'X', power: 0, interest: 99 });
    assertEqual(lo.power, 1);
    assertEqual(lo.interest, 5);
    const bad = one({ name: 'X', power: 'abc', interest: null });
    assertEqual(bad.power, 3);
    assertEqual(bad.interest, 3);
  });
  test('14 vorhandene id bleibt', () => assertEqual(one({ id: 'keep-me', name: 'X' }).id, 'keep-me'));
  test('15 fehlende id: eine feste Ersatz-id (statt bei jedem Laden einer neuen)', () => {
    assertEqual(one({ name: 'X' }).id, 's1');
    assertEqual(one({ name: 'X' }).id, 's1');
  });
  test('16 Rundweg eines Eintrags ist verlustfrei', () => {
    const a = State.fromJSON({ stakeholders: [{ id: 'r1', name: 'Carol', role: 'Lead', power: 4, interest: 2, support: 'supporter', category: 'lieferant', notes: 'n' }] });
    assertEqual(json(State.fromJSON(plain(a.toJSON())).toJSON()), json(a.toJSON()));
  });
  test('17 neues Model: leere Liste', () => {
    const s = new State();
    assertTrue(Array.isArray(s.stakeholders));
    assertEqual(s.stakeholders.length, 0);
  });
  test('18 hasContent leer false', () => assertEqual(new State().hasContent(), false));
  test('19 hasContent mit einem Eintrag true', () => assertEqual(State.fromJSON({ stakeholders: [{ name: 'A' }] }).hasContent(), true));
  test('20 fromJSON(null) ist leer', () => assertEqual(State.fromJSON(null).stakeholders.length, 0));
  test('21 fromJSON(undefined) ist leer', () => assertEqual(State.fromJSON(undefined).stakeholders.length, 0));
  test('22 Einträge geladen, Quadrant abgeleitet', () => {
    const s = State.fromJSON({ stakeholders: [{ id: '1', name: 'A', power: 5, interest: 5 }] });
    assertEqual(s.stakeholders.length, 1);
    assertEqual(quadrants(s)[0].quadrant, 'manage-closely');
  });
  test('23 Nicht-Liste als stakeholders: leer', () => assertEqual(State.fromJSON({ stakeholders: 'oops' }).stakeholders.length, 0));
  test('24 Rundweg des Ganzen ist verlustfrei', () => {
    const a = State.fromJSON({ stakeholders: [
      { id: '1', name: 'A', role: 'r', power: 5, interest: 1, support: 'supporter', category: 'intern', notes: '' },
      { id: '2', name: 'B', role: '', power: 1, interest: 1, support: 'neutral', category: 'kunde', notes: 'x' },
    ] });
    assertEqual(json(State.fromJSON(plain(a.toJSON())).toJSON()), json(a.toJSON()));
  });
  test('25 QUAD_ORDER nennt alle vier Quadranten', () => {
    assertEqual(QUAD_ORDER.length, 4);
    assertTrue(QUAD_ORDER.includes('manage-closely'));
    assertTrue(QUAD_ORDER.includes('monitor'));
  });
  const list = State.fromJSON({ stakeholders: [
    { id: '1', power: 5, interest: 5, support: 'critic' }, { id: '2', power: 5, interest: 5, support: 'supporter' },
    { id: '3', power: 5, interest: 1, support: 'neutral' }, { id: '4', power: 1, interest: 5, support: 'resistor' },
    { id: '5', power: 1, interest: 1, support: 'critic' },
  ] }).stakeholders;
  test('26 quadrantCounts deckt alle vier Quadranten ab', () => {
    assertEqual(json(quadrantCounts(list)), json({ 'manage-closely': 2, 'keep-satisfied': 1, 'keep-informed': 1, monitor: 1 }));
  });
  test('27 supportCounts zählt Fremdes unter other', () => {
    assertEqual(json(supportCounts(list)), json({ supporter: 1, neutral: 1, critic: 2, other: 1 }));
  });
  test('28 criticalCritics: nur Kritiker in manage-closely', () => {
    assertEqual(criticalCritics(list).length, 1);
    assertEqual(criticalCritics(list)[0].power, 5);
  });
});
