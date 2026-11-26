/**
 * Tests for modules/raci-matrix/domain/check.js — Rollen, Zellschlüssel,
 * Rollenzyklus und die Prüfung je Aktivität (`noR`, `noA`, `multiA`).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { ROLES, cellKey, nextRole, checkRows } from '../../../js/modules/raci-matrix/domain/check.js';
import { State } from '../../../js/modules/raci-matrix/domain/model.js';

/** @param {string[]} acts @param {string[]} shs @param {Record<string, string>} [assignments] */
const matrix = (acts, shs, assignments = {}) => ({
  activities: acts.map((id) => ({ id, name: id.toUpperCase() })),
  stakeholders: shs.map((id) => ({ id, name: id.toUpperCase() })),
  assignments,
});

suite('raci-matrix check — Rollen und Schlüssel', () => {
  test('ROLES ist R, A, C, I und gleich der Wertemenge von assignments im Schema', () => {
    assertDeepEqual([...ROLES], ['R', 'A', 'C', 'I']);
    assertDeepEqual([...State.schema.fields.assignments.value.values], [...ROLES]);
  });
  test('setRole nimmt die Rollen und den leeren Text', () => {
    assertDeepEqual([...State.schema.commands.setRole.params.role.values], ['', ...ROLES]);
  });
  test('cellKey verbindet die ids mit einem Doppelpunkt', () => {
    assertEqual(cellKey('a1', 's2'), 'a1:s2');
  });
});

suite('raci-matrix check — nextRole', () => {
  test("Zyklus '' → R → A → C → I → ''", () => {
    const seen = [];
    let r = '';
    for (let i = 0; i < 5; i++) { r = nextRole(r); seen.push(r); }
    assertDeepEqual(seen, ['R', 'A', 'C', 'I', '']);
  });
  test('ein fremder Wert gilt als ohne Rolle und wird R', () => {
    for (const v of ['X', 'r', ' R', undefined]) assertEqual(nextRole(/** @type {any} */ (v)), 'R', String(v));
  });
});

suite('raci-matrix check — checkRows', () => {
  test('Zeile ohne Rollen: noR und noA in dieser Reihenfolge', () => {
    assertDeepEqual(checkRows(matrix(['a'], ['p', 'q'])), [{ activityId: 'a', issues: ['noR', 'noA'] }]);
  });
  test('zwei A in einer Zeile: noR, multiA', () => {
    assertDeepEqual(checkRows(matrix(['a'], ['p', 'q'], { 'a:p': 'A', 'a:q': 'A' })),
      [{ activityId: 'a', issues: ['noR', 'multiA'] }]);
  });
  test('R und genau ein A: kein Befund', () => {
    assertDeepEqual(checkRows(matrix(['a'], ['p', 'q'], { 'a:p': 'R', 'a:q': 'A' })), []);
  });
  test('C und I zählen nicht als R oder A', () => {
    assertDeepEqual(checkRows(matrix(['a'], ['p', 'q'], { 'a:p': 'C', 'a:q': 'I' })),
      [{ activityId: 'a', issues: ['noR', 'noA'] }]);
  });
  test('nur Zeilen mit Befund, in Zeilenreihenfolge', () => {
    const m = matrix(['a', 'b', 'c'], ['p', 'q'], { 'a:p': 'R', 'a:q': 'A', 'b:p': 'A', 'c:p': 'R' });
    assertDeepEqual(checkRows(m), [{ activityId: 'b', issues: ['noR'] }, { activityId: 'c', issues: ['noA'] }]);
  });
  test('ohne Beteiligte: jede Aktivität mit noR und noA', () => {
    assertDeepEqual(checkRows(matrix(['a', 'b'], [])),
      [{ activityId: 'a', issues: ['noR', 'noA'] }, { activityId: 'b', issues: ['noR', 'noA'] }]);
  });
  test('ohne Aktivitäten: keine Befunde', () => {
    assertDeepEqual(checkRows(matrix([], ['p'])), []);
  });
  test('Rollen fremder Zeilen und Spalten zählen nicht', () => {
    assertDeepEqual(checkRows(matrix(['a'], ['p'], { 'b:p': 'R', 'a:x': 'A' })),
      [{ activityId: 'a', issues: ['noR', 'noA'] }]);
  });
});
