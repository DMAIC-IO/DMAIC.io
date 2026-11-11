/**
 * defineModel: derived und derivedBulk — Ablage, Kollisionen.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../test-utils.js';
import { defineModel, number, text, command } from '../../js/core/model.js';

suite('defineModel derived', () => {
  test('Model.schema.derived und derivedBulk: eingefroren, Vorgabe leer', () => {
    const M = defineModel({ fields: { n: number({ default: 1 }) } });
    assertDeepEqual({ ...M.schema.derived }, {});
    assertDeepEqual([...M.schema.derivedBulk], []);
    assertTrue(Object.isFrozen(M.schema.derived));
    assertTrue(Object.isFrozen(M.schema.derivedBulk));
  });

  test('derived und derivedBulk landen im Schema', () => {
    const fn = function a() { return this.n; };
    const M = defineModel({ fields: { n: number({ default: 1 }) }, derived: { a: fn }, derivedBulk: ['a'] });
    assertEqual(M.schema.derived.a, fn);
    assertDeepEqual([...M.schema.derivedBulk], ['a']);
  });

  test('Name wie ein Feld wirft', () => {
    assertThrows(() => defineModel({ fields: { n: number({ default: 1 }) }, derived: { n() { return 1; } } }), /n/);
  });

  test('Name wie ein Ansichtsfeld wirft', () => {
    assertThrows(() => defineModel({ view: { v: text() }, derived: { v() { return 1; } } }), /v/);
  });

  test('Name wie ein Kommando wirft', () => {
    assertThrows(() => defineModel({ commands: { go: command({ run() {} }) }, derived: { go() { return 1; } } }), /go/);
  });

  test('reservierter Name wirft', () => {
    assertThrows(() => defineModel({ derived: { toJSON() { return 1; } } }), /toJSON/);
  });

  test('derived-Eintrag muss eine Funktion sein', () => {
    assertThrows(() => defineModel({ derived: { a: 1 } }), /a/);
  });

  test('derivedBulk ohne gleichnamigen Eintrag wirft', () => {
    assertThrows(() => defineModel({ derived: { a() { return 1; } }, derivedBulk: ['nope'] }), /nope/);
  });
});
