/**
 * Tests for modules/project-charter/domain/goals.js — Zielerreichungsstufe und
 * Datum in der Vergangenheit (lokales Datum).
 */
import { suite, test, assertEqual } from '../../test-utils.js';
import { zegLevel, isDateInPast } from '../../../js/modules/project-charter/domain/goals.js';

suite('project-charter goals — zegLevel', () => {
  test('100 done, 75 high, 74 mid, 25 mid, 24 low', () => {
    assertEqual(zegLevel(100), 'done');
    assertEqual(zegLevel(75), 'high');
    assertEqual(zegLevel(74), 'mid');
    assertEqual(zegLevel(25), 'mid');
    assertEqual(zegLevel(24), 'low');
    assertEqual(zegLevel(0), 'low');
  });
  test('Werte außerhalb 0..100 werden geklemmt', () => {
    assertEqual(zegLevel(150), 'done');
    assertEqual(zegLevel(-5), 'low');
  });
});

suite('project-charter goals — isDateInPast', () => {
  test('heute ist nicht vergangen, der Vortag schon', () => {
    assertEqual(isDateInPast('2026-11-13', '2026-11-13'), false);
    assertEqual(isDateInPast('2026-11-12', '2026-11-13'), true);
    assertEqual(isDateInPast('2026-11-14', '2026-11-13'), false);
  });
  test('leer oder ungültig ist nie vergangen', () => {
    assertEqual(isDateInPast('', '2026-11-13'), false);
    assertEqual(isDateInPast('morgen', '2026-11-13'), false);
  });
  test('ohne zweites Argument gilt das lokale heute', () => {
    assertEqual(isDateInPast('1999-01-01'), true);
    assertEqual(isDateInPast('2999-01-01'), false);
  });
});
