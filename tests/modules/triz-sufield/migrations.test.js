/**
 * Tests for modules/triz-sufield/domain/migrations.js — '0→1.0' bildet das
 * alte `State.fromJSON` nach: Texte, Feldart, Verknüpfung, Listenfilter,
 * Klassen, Notizen und Vormerkungen je Fall, `null`/`undefined`/`{}`, fremde
 * Schlüssel, Reihenfolge. Dazu das Beispiel in der Form ohne `_schema` über
 * das Model.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { from0 } from '../../../js/modules/triz-sufield/domain/migrations.js';
import { State } from '../../../js/modules/triz-sufield/domain/model.js';
import { setModelName } from '../../../js/core/model.js';

setModelName(State, 'triz-sufield');

const SCHEMA = { _schema: { name: 'triz-sufield', version: '1.0' } };
const EMPTY = {
  s1: '', s2: '', field: '', link: '', problemNote: '', notes: {}, selected: {}, filterMode: 'auto', expandedClasses: [],
};
const KEYS = Object.keys(EMPTY);
const json = (v) => JSON.stringify(v);
const plain = (v) => JSON.parse(JSON.stringify(v));

suite('triz-sufield Migration 0→1.0 — vollständiger Stand', () => {
  test('ein gültiger Stand bleibt unverändert, Schlüssel in gespeicherter Reihenfolge', () => {
    const full = {
      s1: 'Bohrer', s2: 'Beton', field: 'M', link: 'insufficient', problemNote: 'zu langsam',
      notes: { '2.2.5': 'Schlagbohren' }, selected: { '2.2.5': true }, filterMode: 'all', expandedClasses: [2, 5],
    };
    const reversed = Object.fromEntries(Object.entries(full).reverse());
    assertEqual(json(from0(reversed)), json(full));
  });
  test('Ergebnis ist ein einfaches Objekt ohne geteilte Bezüge', () => {
    const old = { notes: { a: 'x' }, selected: { a: true }, expandedClasses: [1] };
    const out = from0(old);
    assertEqual(Object.getPrototypeOf(out), Object.prototype);
    assertTrue(out.notes !== old.notes && out.selected !== old.selected && out.expandedClasses !== old.expandedClasses);
  });
});

suite('triz-sufield Migration 0→1.0 — kein Objekt', () => {
  for (const [name, v] of [['null', null], ['undefined', undefined], ['{}', {}], ['Liste', []], ['Text', 'x'], ['Zahl', 7]]) {
    test(`${name} → Vorgabe`, () => {
      assertEqual(json(from0(v)), json(EMPTY));
    });
  }
});

suite('triz-sufield Migration 0→1.0 — je Feld wie das alte fromJSON', () => {
  test('Texte: Text bleibt (auch leer, mit Leerzeichen), sonst leer', () => {
    assertEqual(from0({ s1: '  a  ' }).s1, '  a  ');
    assertEqual(from0({ s2: '' }).s2, '');
    assertEqual(from0({ problemNote: 'x\ny' }).problemNote, 'x\ny');
    for (const v of [42, null, true, ['a'], { a: 1 }]) {
      const out = from0({ s1: v, s2: v, problemNote: v });
      assertEqual(json([out.s1, out.s2, out.problemNote]), json(['', '', '']), json(v));
    }
  });
  test('Feldart aus der Liste, sonst leer', () => {
    for (const f of ['M', 'A', 'T', 'C', 'E', 'Mg']) assertEqual(from0({ field: f }).field, f);
    for (const v of ['INVALID', 'm', 'MG', '', 1, null]) assertEqual(from0({ field: v }).field, '', json(v));
  });
  test('Verknüpfung aus der Liste, sonst leer', () => {
    for (const l of ['useful', 'insufficient', 'excessive', 'harmful', 'missing']) assertEqual(from0({ link: l }).link, l);
    for (const v of ['INVALID', 'Useful', '', 0, null]) assertEqual(from0({ link: v }).link, '', json(v));
  });
  test('Listenfilter auto oder all, sonst auto', () => {
    assertEqual(from0({ filterMode: 'all' }).filterMode, 'all');
    assertEqual(from0({ filterMode: 'auto' }).filterMode, 'auto');
    for (const v of ['everything', '', null, 1]) assertEqual(from0({ filterMode: v }).filterMode, 'auto', json(v));
  });
  test('Klassen: nur ganze Zahlen; Doppelte und Nummern außerhalb 1–5 bleiben stehen', () => {
    assertDeepEqual(from0({ expandedClasses: [1, 'x', 3, null, 5, 1.5, '2'] }).expandedClasses, [1, 3, 5]);
    assertDeepEqual(from0({ expandedClasses: [5, 2, 2, 7, 0] }).expandedClasses, [5, 2, 2, 7, 0]);
  });
  test('Klassen keine Liste → leer', () => {
    for (const v of ['invalid', 2, { 0: 1 }, null]) assertDeepEqual(from0({ expandedClasses: v }).expandedClasses, [], json(v));
  });
  test('Notizen: nur Einträge mit Textwert; unbekannte ids bleiben stehen', () => {
    assertEqual(
      json(from0({ notes: { '2.2.5': 'a', '9.9.9': 'b', x: 7, y: null, z: { t: 1 }, w: '' } }).notes),
      json({ '2.2.5': 'a', '9.9.9': 'b', w: '' }),
    );
  });
  test('Notizen kein Objekt → leer', () => {
    for (const v of ['x', ['a'], 3, null]) assertEqual(json(from0({ notes: v }).notes), '{}', json(v));
  });
  test('Vormerkungen: Wert als Wahrheitswert; unbekannte ids bleiben stehen', () => {
    assertEqual(
      json(from0({ selected: { '2.2.5': true, '1.1.1': 1, '1.1.2': 0, '1.1.3': 'ja', '9.9.9': true } }).selected),
      json({ '2.2.5': true, '1.1.1': true, '1.1.2': false, '1.1.3': true, '9.9.9': true }),
    );
  });
  test('Vormerkungen kein Objekt → leer', () => {
    for (const v of ['x', [true], 3, null]) assertEqual(json(from0({ selected: v }).selected), '{}', json(v));
  });
  test('fremde Schlüssel entfallen, Reihenfolge wie gespeichert', () => {
    const out = from0({ extra: 1, _schema: { version: '0' }, s2: 'b', s1: 'a' });
    assertDeepEqual(Object.keys(out), KEYS);
  });
});

suite('triz-sufield Migration 0→1.0 — über das Model', () => {
  test('Stand ohne _schema mit unbekannter id und Klasse 7: streng wirft, mit Reparatur entfallen nur sie', () => {
    const old = { s1: 'a', notes: { '2.2.5': 'n', '9.9.9': 'x' }, selected: { '9.9.9': true }, expandedClasses: [7, 2, 2] };
    let err = null;
    try { State.fromJSON(plain(old)); } catch (e) { err = e; }
    assertEqual(err?.invariant, 'knownNotes');
    const fields = [];
    const m = State.fromJSON(plain(old), { repair: true, onRepair: (f) => fields.push(f) });
    assertDeepEqual(fields, ['notes', 'selected']);
    assertEqual(json(m.notes), json({ '2.2.5': 'n' }));
    assertEqual(json(m.selected), '{}');
    assertDeepEqual([...m.expandedClasses], [2]);
  });
});

suite('triz-sufield Migration — Beispiel ohne _schema', () => {
  test('bohrer-beton ohne _schema lädt über 0→1.0 ohne Reparatur, toJSON = _schema + Datei', async () => {
    const url = new URL('../../../js/modules/triz-sufield/resources/examples/projects/triz-sufield-bohrer-beton.json', import.meta.url);
    const res = await fetch(url, { cache: 'no-cache' });
    assertTrue(res.ok, `could not fetch example: HTTP ${res.status}`);
    const { _schema, ...file } = await res.json();
    assertDeepEqual(_schema, SCHEMA._schema);
    assertDeepEqual(Object.keys(file), KEYS);
    const fields = [];
    const m = State.fromJSON(plain(file), { repair: true, onRepair: (f) => fields.push(f) });
    assertDeepEqual(fields, []);
    assertEqual(json(m.toJSON()), json({ ...SCHEMA, ...file }));
    assertEqual(json(from0(plain(file))), json(file));
  });
});
