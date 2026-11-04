/**
 * Tests for core/model.js — Version, Migrationskette, _schema.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../test-utils.js';
import { defineModel, text, list, setModelName, compareVersions } from '../../js/core/model.js';

const toV1 = (j) => ({ items: Array.isArray(j.list) ? j.list : [] });
const toV2 = (j) => ({ ...j, items: j.items.map((s) => s.toUpperCase()) });

const Two = defineModel({
  version: '2.0',
  migrations: { '0→1.0': toV1, '1.0→2.0': toV2 },
  fields: { items: list(text()) },
});

suite('compareVersions', () => {
  test('ordnet 0 < 0.1 < 1.0 < 1.2 < 1.10 < 2.0', () => {
    const sorted = ['1.10', '2.0', '0', '1.0', '0.1', '1.2'].sort(compareVersions);
    assertDeepEqual(sorted, ['0', '0.1', '1.0', '1.2', '1.10', '2.0']);
    assertEqual(compareVersions('1.0', '1.0'), 0);
  });
});

suite('defineModel — Migrationskette', () => {
  test('ohne _schema gilt 0: beide Schritte laufen', () => {
    assertDeepEqual(Two.fromJSON({ list: ['a', 'b'] }).items, ['A', 'B']);
  });

  test('ab 1.0 läuft nur der zweite Schritt', () => {
    assertDeepEqual(Two.fromJSON({ _schema: { version: '1.0' }, items: ['x'] }).items, ['X']);
  });

  test('aktuelle Version: kein Schritt', () => {
    assertDeepEqual(Two.fromJSON({ _schema: { version: '2.0' }, items: ['x'] }).items, ['x']);
  });

  test('neuere Version wird abgelehnt, auch mit repair', () => {
    const msg = /^invalid _schema\.version "2\.1"; allowed: up to 2\.0 \(saved by a newer version of this module\)$/;
    assertThrows(() => Two.fromJSON({ _schema: { version: '2.1' }, items: [] }), msg);
    assertThrows(() => Two.fromJSON({ _schema: { version: '3.0' }, items: [] }, { repair: true }), /allowed: up to 2\.0/);
  });

  test('unbekannte Zwischenversion wird abgelehnt', () => {
    assertThrows(() => Two.fromJSON({ _schema: { version: '0.5' }, items: [] }),
      /^unknown _schema\.version "0\.5"; available: 0, 1\.0, 2\.0$/);
  });

  test('Migration bekommt eine Kopie, der Eingang bleibt unverändert', () => {
    const input = { list: ['a'] };
    const Spy = defineModel({
      version: '1.0',
      migrations: { '0→1.0': (j) => { j.list.push('mutiert'); return { items: j.list }; } },
      fields: { items: list(text()) },
    });
    assertDeepEqual(Spy.fromJSON(input).items, ['a', 'mutiert']);
    assertDeepEqual(input, { list: ['a'] });
  });

  test('strenge Prüfung nach der Migration; repair setzt nur das kaputte Feld zurück', () => {
    const Bad = defineModel({
      version: '1.0',
      migrations: { '0→1.0': (j) => ({ items: j.list, title: 5 }) },
      fields: { items: list(text()), title: text() },
    });
    assertThrows(() => Bad.fromJSON({ list: ['a'] }), /^invalid title 5/);
    const m = Bad.fromJSON({ list: ['a'] }, { repair: true });
    assertDeepEqual(m.items, ['a']);
    assertEqual(m.title, '');
  });

  test('kein Objekt → Vorgabewerte, keine Migration', () => {
    assertDeepEqual(Two.fromJSON(null).items, []);
  });
});

suite('defineModel — Kette beim Definieren prüfen', () => {
  const f = { items: list(text()) };
  test('migrations ohne version', () => {
    assertThrows(() => defineModel({ migrations: { '0→1.0': toV1 }, fields: f }),
      /^defineModel: version is required when migrations are set$/);
  });
  test('version in falscher Form', () => {
    assertThrows(() => defineModel({ version: '1', fields: f }), /^defineModel: invalid version "1"; allowed: MAJOR\.MINOR$/);
  });
  test('Schlüssel in falscher Form', () => {
    assertThrows(() => defineModel({ version: '1.0', migrations: { '0-1.0': toV1 }, fields: f }),
      /^defineModel: invalid migration key "0-1\.0"; allowed: 'a→b' with a = 0 or MAJOR\.MINOR, b = MAJOR\.MINOR$/);
  });
  test('Schritt rückwärts oder auf der Stelle (Zyklus)', () => {
    assertThrows(() => defineModel({ version: '1.0', migrations: { '0→1.0': toV1, '1.0→0': toV1 }, fields: f }),
      /^defineModel: invalid migration key "1\.0→0"/);
    assertThrows(() => defineModel({ version: '2.0', migrations: { '0→2.0': toV1, '2.0→2.0': toV1 }, fields: f }),
      /^defineModel: migration 2\.0→2\.0 does not move forward$/);
  });
  test('Lücke: Kette erreicht version nicht', () => {
    assertThrows(() => defineModel({ version: '2.0', migrations: { '0→1.0': toV1 }, fields: f }),
      /^defineModel: migration chain from 0 ends at 1\.0, not at version 2\.0$/);
  });
  test('zwei Schritte ab derselben Version', () => {
    assertThrows(() => defineModel({ version: '2.0', migrations: { '0→1.0': toV1, '0→2.0': toV2, '1.0→2.0': toV2 }, fields: f }),
      /^defineModel: two migrations start at 0$/);
  });
  test('Schritt über version hinaus', () => {
    assertThrows(() => defineModel({ version: '1.0', migrations: { '0→2.0': toV1 }, fields: f }),
      /^defineModel: migration 0→2\.0 goes beyond version 1\.0$/);
  });
  test('Migration ist keine Funktion', () => {
    assertThrows(() => defineModel({ version: '1.0', migrations: { '0→1.0': 'x' }, fields: f }),
      /^defineModel: migration 0→1\.0 must be a function$/);
  });
});

suite('defineModel — _schema', () => {
  const Plain = defineModel({ fields: { t: text() } });

  test('ohne Angaben: version 1.0, laden ohne Schritt', () => {
    assertEqual(Plain.schema.version, '1.0');
    assertEqual(Plain.fromJSON({ t: 'x' }).t, 'x');
    assertEqual(Plain.fromJSON({ _schema: { version: '0.3' }, t: 'x' }).t, 'x');
  });

  test('toJSON: _schema zuerst, ohne Namen nur version', () => {
    const json = new Plain().toJSON();
    assertDeepEqual(Object.keys(json), ['_schema', 't']);
    assertDeepEqual(json._schema, { version: '1.0' });
  });

  test('setModelName: name erscheint in _schema, nicht aufzählbar am Model', () => {
    const Named = defineModel({ version: '1.0', fields: { t: text() } });
    setModelName(Named, 'sipoc');
    assertDeepEqual(new Named().toJSON()._schema, { name: 'sipoc', version: '1.0' });
    assertTrue(!Object.keys(Named).includes('moduleName'));
  });

  test('Rundlauf mit _schema', () => {
    const json = Two.fromJSON({ list: ['a'] }).toJSON();
    assertDeepEqual(json, { _schema: { version: '2.0' }, items: ['A'] });
    assertDeepEqual(Two.fromJSON(json).toJSON(), json);
  });

  test('hasContent ignoriert _schema', () => {
    assertEqual(new Plain().hasContent(), false);
  });

  test('_schema ist als Feldname reserviert', () => {
    assertThrows(() => defineModel({ fields: { _schema: text() } }), /^defineModel: _schema is a reserved name$/);
  });
});
