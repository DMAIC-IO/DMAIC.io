/**
 * Tests for modules/triz-sufield/domain/diagnosis.js — `diagnose` je Lage
 * (die Fälle der früheren Altform-Tests), die Listen der Feldarten und
 * Verknüpfungen und ihre Gleichheit mit den Literalen im Schema.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { FIELD_TYPES, LINK_TYPES, diagnose } from '../../../js/modules/triz-sufield/domain/diagnosis.js';
import { State } from '../../../js/modules/triz-sufield/domain/model.js';

suite('triz-sufield Diagnose — diagnose()', () => {
  test('partial ohne S1', () => {
    assertDeepEqual(diagnose('', 's2', 'M', 'useful'), { situation: 'partial', suggestedClasses: [1] });
  });
  test('partial ohne S2', () => {
    assertEqual(diagnose('s1', '', 'M', 'useful').situation, 'partial');
  });
  test('partial ohne beide Stoffe', () => {
    assertEqual(diagnose('', '', '', '').situation, 'partial');
  });
  test('incomplete ohne Feldart', () => {
    assertDeepEqual(diagnose('s1', 's2', '', 'useful'), { situation: 'incomplete', suggestedClasses: [1] });
  });
  test('incomplete bei Verknüpfung missing', () => {
    assertDeepEqual(diagnose('s1', 's2', 'M', 'missing'), { situation: 'incomplete', suggestedClasses: [1] });
  });
  test('complete-useful → Klassen 2 und 3', () => {
    assertDeepEqual(diagnose('s1', 's2', 'M', 'useful'), { situation: 'complete-useful', suggestedClasses: [2, 3] });
  });
  test('complete-insufficient → Klasse 2', () => {
    assertDeepEqual(diagnose('s1', 's2', 'T', 'insufficient'), { situation: 'complete-insufficient', suggestedClasses: [2] });
  });
  test('complete-excessive → Klassen 2 und 5', () => {
    assertDeepEqual(diagnose('s1', 's2', 'E', 'excessive'), { situation: 'complete-excessive', suggestedClasses: [2, 5] });
  });
  test('complete-harmful → Klassen 1 und 5', () => {
    assertDeepEqual(diagnose('s1', 's2', 'C', 'harmful'), { situation: 'complete-harmful', suggestedClasses: [1, 5] });
  });
  test('incomplete ohne gewählte Verknüpfung', () => {
    assertDeepEqual(diagnose('s1', 's2', 'Mg', ''), { situation: 'incomplete', suggestedClasses: [1] });
  });
  test('Stoff nur aus Leerzeichen gilt als leer', () => {
    assertEqual(diagnose('  ', 's2', 'M', 'useful').situation, 'partial');
    assertEqual(diagnose('s1', '\n\t', 'M', 'useful').situation, 'partial');
  });
  test('je Aufruf eine eigene Klassenliste', () => {
    const a = diagnose('s1', 's2', 'M', 'useful');
    a.suggestedClasses.push(9);
    assertDeepEqual(diagnose('s1', 's2', 'M', 'useful').suggestedClasses, [2, 3]);
  });
});

suite('triz-sufield Diagnose — Listen', () => {
  test('sechs Feldarten und fünf Verknüpfungen, eingefroren', () => {
    assertDeepEqual([...FIELD_TYPES], ['M', 'A', 'T', 'C', 'E', 'Mg']);
    assertDeepEqual([...LINK_TYPES], ['useful', 'insufficient', 'excessive', 'harmful', 'missing']);
    assertTrue(Object.isFrozen(FIELD_TYPES));
    assertTrue(Object.isFrozen(LINK_TYPES));
  });
  test('gleich den Literalen im Schema, dort mit leerem Text vorweg', () => {
    assertDeepEqual([...State.schema.fields.field.values], ['', ...FIELD_TYPES]);
    assertDeepEqual([...State.schema.fields.link.values], ['', ...LINK_TYPES]);
  });
});
