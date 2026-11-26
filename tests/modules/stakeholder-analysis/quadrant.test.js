/**
 * Tests for modules/stakeholder-analysis/domain/quadrant.js — Schwelle 4 je
 * Achse, Zählungen je Quadrant und Haltung (fremde Haltung → other),
 * Schlüssel-Kritiker, stabile Rangfolge; die Wertemengen gleichen den
 * Literalen im Schema.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import {
  SUPPORT_VALUES, CATEGORY_VALUES, QUAD_ORDER, quadrantOf, quadrantCounts, supportCounts,
  isKeyCritic, criticalCritics, byQuadrant,
} from '../../../js/modules/stakeholder-analysis/domain/quadrant.js';
import { State } from '../../../js/modules/stakeholder-analysis/domain/model.js';

/** @param {number} power @param {number} interest @param {string} [support] @param {string} [name] */
const sh = (power, interest, support = 'neutral', name = `${power}${interest}${support}`) => ({ name, power, interest, support });

suite('stakeholder-analysis quadrant — Quadrant je Beteiligtem', () => {
  test('hoch/hoch → manage-closely, hoch/gering → keep-satisfied, gering/hoch → keep-informed, gering/gering → monitor', () => {
    assertEqual(quadrantOf(sh(5, 5)), 'manage-closely');
    assertEqual(quadrantOf(sh(5, 1)), 'keep-satisfied');
    assertEqual(quadrantOf(sh(1, 5)), 'keep-informed');
    assertEqual(quadrantOf(sh(1, 1)), 'monitor');
  });
  test('Schwelle 4: 4/4 ist hoch, 3/3 ist gering', () => {
    assertEqual(quadrantOf(sh(4, 4)), 'manage-closely');
    assertEqual(quadrantOf(sh(3, 4)), 'keep-informed');
    assertEqual(quadrantOf(sh(4, 3)), 'keep-satisfied');
    assertEqual(quadrantOf(sh(3, 3)), 'monitor');
  });
  test('QUAD_ORDER nennt alle vier Quadranten in Rangfolge', () => {
    assertDeepEqual([...QUAD_ORDER], ['manage-closely', 'keep-satisfied', 'keep-informed', 'monitor']);
  });
});

suite('stakeholder-analysis quadrant — Zählungen und Kritiker', () => {
  const list = [sh(5, 5, 'critic'), sh(5, 5, 'supporter'), sh(5, 1, 'neutral'), sh(1, 5, 'resistor'), sh(1, 1, 'critic')];

  test('quadrantCounts deckt alle vier Quadranten ab, in Rangfolge', () => {
    assertEqual(JSON.stringify(quadrantCounts(list)),
      JSON.stringify({ 'manage-closely': 2, 'keep-satisfied': 1, 'keep-informed': 1, monitor: 1 }));
    assertEqual(JSON.stringify(quadrantCounts([])),
      JSON.stringify({ 'manage-closely': 0, 'keep-satisfied': 0, 'keep-informed': 0, monitor: 0 }));
  });
  test('supportCounts zählt fremde Haltungen unter other', () => {
    assertEqual(JSON.stringify(supportCounts(list)), JSON.stringify({ supporter: 1, neutral: 1, critic: 2, other: 1 }));
  });
  test('Schlüssel-Kritiker: nur Kritiker in manage-closely; fremde Haltung zählt nicht', () => {
    assertEqual(isKeyCritic(sh(5, 5, 'critic')), true);
    assertEqual(isKeyCritic(sh(1, 1, 'critic')), false);
    assertEqual(isKeyCritic(sh(5, 5, 'resistor')), false);
    const crit = criticalCritics(list);
    assertEqual(crit.length, 1);
    assertEqual(crit[0], list[0]);
  });
});

suite('stakeholder-analysis quadrant — Rangfolge', () => {
  test('byQuadrant sortiert nach Rang, stabil innerhalb eines Quadranten, ohne die Liste zu ändern', () => {
    const list = [sh(1, 1, 'neutral', 'M1'), sh(5, 5, 'neutral', 'A'), sh(1, 5, 'neutral', 'I'), sh(2, 2, 'neutral', 'M2'), sh(4, 4, 'neutral', 'B'), sh(5, 2, 'neutral', 'S')];
    const before = list.map((s) => s.name);
    assertDeepEqual(byQuadrant(list).map((s) => s.name), ['A', 'B', 'S', 'I', 'M1', 'M2']);
    assertDeepEqual(list.map((s) => s.name), before);
  });
});

suite('stakeholder-analysis quadrant — Wertemengen gleich den Schema-Literalen', () => {
  const cmds = State.schema.commands;
  test('SUPPORT_VALUES gleich support in beiden Kommandos', () => {
    assertDeepEqual([...SUPPORT_VALUES], ['supporter', 'neutral', 'critic']);
    for (const c of ['addStakeholder', 'updateStakeholder']) assertDeepEqual([...cmds[c].params.support.values], [...SUPPORT_VALUES], c);
  });
  test('CATEGORY_VALUES gleich category in beiden Kommandos', () => {
    assertDeepEqual([...CATEGORY_VALUES], ['intern', 'extern', 'kunde', 'lieferant', 'behoerde']);
    for (const c of ['addStakeholder', 'updateStakeholder']) assertDeepEqual([...cmds[c].params.category.values], [...CATEGORY_VALUES], c);
  });
});
