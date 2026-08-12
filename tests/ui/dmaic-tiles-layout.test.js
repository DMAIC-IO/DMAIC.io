/**
 * Tests for js/ui/dmaic-tiles-layout.js — pure collapse-decision helpers.
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { estimateTilesWidth, resolveCollapsed } from '../../js/ui/dmaic-tiles-layout.js';

// Deterministic fake measure: 8px per character.
const measure = (t) => t.length * 8;

const DMAIC = [
  { letter: 'DATA', name: 'Daten', hasZeg: false },
  { letter: 'D', name: 'Define', hasZeg: true },
  { letter: 'M', name: 'Measure', hasZeg: true },
  { letter: 'A', name: 'Analyze', hasZeg: true },
  { letter: 'I', name: 'Improve', hasZeg: true },
  { letter: 'C', name: 'Control', hasZeg: true },
  { letter: '+', name: 'Extras', hasZeg: false },
];
const EIGHTD = Array.from({ length: 11 }, (_, i) => ({
  letter: `D${i}`, name: 'Rootcause', hasZeg: i > 0 && i < 10,
}));

suite('dmaic-tiles-layout', () => {
  test('estimateTilesWidth grows with tile count (8D wider than DMAIC)', () => {
    assertTrue(estimateTilesWidth(EIGHTD, measure) > estimateTilesWidth(DMAIC, measure));
  });

  test('estimateTilesWidth grows with longer names', () => {
    const short = [{ letter: 'D', name: 'Def', hasZeg: true }];
    const long  = [{ letter: 'D', name: 'Definieren', hasZeg: true }];
    assertTrue(estimateTilesWidth(long, measure) > estimateTilesWidth(short, measure));
  });

  test('estimateTilesWidth counts ZEG width only when hasZeg', () => {
    const withZeg    = [{ letter: 'D', name: 'Define', hasZeg: true }];
    const withoutZeg = [{ letter: 'D', name: 'Define', hasZeg: false }];
    assertTrue(estimateTilesWidth(withZeg, measure) > estimateTilesWidth(withoutZeg, measure));
  });

  test('resolveCollapsed auto: true when est exceeds budget', () => {
    assertEqual(resolveCollapsed({ est: 2000, budget: 1280, menuMode: 'auto' }), true);
  });

  test('resolveCollapsed auto: false when est fits budget', () => {
    assertEqual(resolveCollapsed({ est: 900, budget: 1280, menuMode: 'auto' }), false);
  });

  test('resolveCollapsed compact: always true regardless of fit', () => {
    assertEqual(resolveCollapsed({ est: 100, budget: 1280, menuMode: 'compact' }), true);
  });

  test('resolveCollapsed full: always false regardless of overflow', () => {
    assertEqual(resolveCollapsed({ est: 9999, budget: 1280, menuMode: 'full' }), false);
  });

  test('resolveCollapsed defaults menuMode to auto', () => {
    assertEqual(resolveCollapsed({ est: 2000, budget: 1280 }), true);
  });
});
