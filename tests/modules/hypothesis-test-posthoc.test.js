import { suite, test, assertEqual, assertDeepEqual, assertClose } from '../test-utils.js';
import { simultaneousPairwise, bonferroniPairwise, compactLetterDisplay } from '../../js/modules/hypothesis-test/domain/posthoc.js';

async function loadFixture(path) {
  const resp = await fetch(new URL(path, import.meta.url));
  return resp.json();
}

const tukey = await loadFixture('../fixtures/hypothesis/tukey-hsd.fixtures.json');

suite('posthoc', () => {
  test('Buchstaben: keine Unterschiede → alle a', () => {
    const cmp = [{ i: 0, j: 1, equal: true }, { i: 0, j: 2, equal: true }, { i: 1, j: 2, equal: true }];
    assertDeepEqual(compactLetterDisplay(3, cmp), ['a', 'a', 'a']);
  });
  test('Buchstaben: 0 ≠ 2', () => {
    const cmp = [{ i: 0, j: 1, equal: true }, { i: 0, j: 2, equal: false }, { i: 1, j: 2, equal: true }];
    assertDeepEqual(compactLetterDisplay(3, cmp), ['a', 'ab', 'b']);
  });
  test('Tukey über die Fixture', () => {
    const c = tukey.test_cases[0];
    const r = simultaneousPairwise(c.inputs.groups, c.inputs.alpha ?? 0.05, 'fisher');
    assertEqual(r.simultaneous, true);
    assertEqual(r.m, r.comparisons.length);
    assertClose(r.comparisons[0].pAdj, c.expected.comparisons[0].pAdj, 1e-6);
  });
  test('Bonferroni Rangweg hat Hodges-Lehmann-Intervalle', () => {
    const g = [[1, 2, 3, 4], [2, 3, 4, 5], [6, 7, 8, 9]];
    const r = bonferroniPairwise(g, 0.05, false, false);
    assertEqual(r.m, 3);
    assertEqual(r.isRank, true);
    assertEqual(r.comparisons.every((x) => Array.isArray(x.ci)), true);
  });
});
