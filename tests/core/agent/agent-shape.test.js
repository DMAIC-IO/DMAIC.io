/**
 * Tests for core/agent/agent-shape.js — the closed shape grammar that makes
 * Prüfstufe 4 (path existence against a declared result shape) static.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import { pathExistsInShape, getAtPath } from '../../../js/core/agent/agent-shape.js';
import { OPS, CONTRACT_VERSION, ERRORS } from '../../../js/core/agent/agent-contract.js';

const SHAPE = {
  instanceId: 'string',
  view: { module: 'string', phase: 'string' },
  instances: [{ id: 'string', module: 'string' }],
  payload: 'any',
};

suite('agent shape grammar', () => {
  test('accepts a top-level key', () => {
    assertTrue(pathExistsInShape(SHAPE, 'instanceId').ok);
  });

  test('accepts a nested key', () => {
    assertTrue(pathExistsInShape(SHAPE, 'view.phase').ok);
  });

  test('accepts a numeric index into an array shape', () => {
    assertTrue(pathExistsInShape(SHAPE, 'instances.0.module').ok);
  });

  test('rejects a non-numeric segment on an array shape and names the fault', () => {
    const r = pathExistsInShape(SHAPE, 'instances.first.module');
    assertEqual(r.ok, false);
    assertEqual(r.segment, 'first');
  });

  test('unknown key reports the available keys of that level', () => {
    const r = pathExistsInShape(SHAPE, 'view.module.deep');
    assertEqual(r.ok, false);
    assertEqual(r.segment, 'deep');
    assertDeepEqual(r.available, []);
  });

  test('unknown top-level key lists the sibling keys', () => {
    const r = pathExistsInShape(SHAPE, 'viw');
    assertEqual(r.ok, false);
    assertEqual(r.segment, 'viw');
    assertDeepEqual(r.available, ['instanceId', 'view', 'instances', 'payload']);
  });

  test("'any' swallows the rest of the path", () => {
    assertTrue(pathExistsInShape(SHAPE, 'payload.a.b.17.c').ok);
  });

  test('empty path is not a path', () => {
    assertEqual(pathExistsInShape(SHAPE, '').ok, false);
  });

  // Die Nullable-Form. `view` ist zur Laufzeit null, wenn kein Modul offen
  // ist; ohne diese Form ließ Stufe 4 `path: 'view.module'` passieren, und der
  // Aufruf scheiterte erst zur Laufzeit als `unresolved_ref` — ein Fehler, den
  // der statische Prüfer hätte fangen können.
  const NULLABLE = { view: { $nullable: { instanceId: 'string', module: 'string' } } };

  test('ein Abstieg durch eine Nullable-Form wird statisch abgelehnt', () => {
    const deep = pathExistsInShape(NULLABLE, 'view.module');
    assertEqual(deep.ok, false);
    assertEqual(deep.segment, 'module');
    assertEqual(deep.nullable, true);
  });

  test('die Ablehnung nennt die inneren Schlüssel, damit der Agent weiß, was in view steckt', () => {
    // `available: []` wäre nicht von „Skalar hat keine Tiefe" zu
    // unterscheiden. Der gültige Weg ist, `view` selbst zu referenzieren —
    // dann ist die nützliche Auskunft, was darin zu finden ist.
    assertDeepEqual(pathExistsInShape(NULLABLE, 'view.module').available,
      ['instanceId', 'module']);
  });

  test('die Nullable-Form selbst ist ein gültiger Pfad — lies sie und verzweige', () => {
    assertEqual(pathExistsInShape(NULLABLE, 'view').ok, true);
  });

  test('eine Nullable-Form um ein Array verhält sich gleich', () => {
    const shape = { rows: { $nullable: ['any'] } };
    assertEqual(pathExistsInShape(shape, 'rows').ok, true);
    assertEqual(pathExistsInShape(shape, 'rows.0').ok, false);
  });
});

suite('agent runtime path access', () => {
  const VALUE = { a: { b: [{ c: 7 }] }, nil: null };

  test('reads a nested value through an array index', () => {
    assertDeepEqual(getAtPath(VALUE, 'a.b.0.c'), { ok: true, value: 7 });
  });

  test('missing key reports the keys actually present', () => {
    const r = getAtPath(VALUE, 'a.z');
    assertEqual(r.ok, false);
    assertEqual(r.segment, 'z');
    assertDeepEqual(r.available, ['b']);
  });

  test('null mid-path fails rather than throwing', () => {
    const r = getAtPath(VALUE, 'nil.x');
    assertEqual(r.ok, false);
    assertEqual(r.segment, 'x');
    assertDeepEqual(r.available, []);
  });
});

suite('agent contract', () => {
  test('contract version is 1', () => {
    assertEqual(CONTRACT_VERSION, 1);
  });

  test('exactly the seven core ops are declared', () => {
    assertDeepEqual(Object.keys(OPS).sort(), [
      'catalog.read', 'instance.call', 'instance.open',
      'module.add', 'module.describe', 'module.remove', 'project.read',
    ]);
  });

  test('every op declares a result shape every declared path can be checked against', () => {
    for (const [op, spec] of Object.entries(OPS)) {
      assertTrue(spec.result !== undefined, `${op} has no result shape`);
      assertTrue(spec.params !== undefined, `${op} has no params`);
    }
  });

  test('module.add declares instanceId in its result shape', () => {
    assertTrue(pathExistsInShape(OPS['module.add'].result, 'instanceId').ok);
  });

  test('die Fläche kündigt keinen Code an, den sie nicht produziert', () => {
    // `not_connected` und `unknown_field` wurden von keiner Codezeile erzeugt,
    // standen aber über `buildUsage().errors` als mögliche Codes in der
    // Zusage. Jetzt kostenlos weg, später die Rücknahme einer Zusage.
    assertEqual('NOT_CONNECTED' in ERRORS, false);
    assertEqual('UNKNOWN_FIELD' in ERRORS, false);
  });

  test('project.read deklariert view als Nullable-Form, nicht als sicheres Objekt', () => {
    assertEqual(pathExistsInShape(OPS['project.read'].result, 'view').ok, true);
    assertEqual(pathExistsInShape(OPS['project.read'].result, 'view.phase').nullable, true);
  });

  test('error codes are unique and equal to their keys lowercased', () => {
    const values = Object.values(ERRORS);
    assertEqual(new Set(values).size, values.length);
    for (const [key, value] of Object.entries(ERRORS)) {
      assertEqual(value, key.toLowerCase(), `ERRORS[${key}] !== ${key.toLowerCase()}`);
    }
  });
});
