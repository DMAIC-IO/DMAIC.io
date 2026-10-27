/**
 * Interval helpers of lesson 4: z and t factors, half-widths with known and
 * unknown σ, the hit check and seeded coverage against theory.
 */
import { suite, test, assertClose, assertTrue } from '../../test-utils.js';
import { mulberry32 } from '../../../js/engines/random-variates-engine.js';
import { drawSample } from '../../../js/pages/training/processes.js';
import { intervalFactor, meanInterval, covers } from '../../../js/pages/training/intervals.js';

const HAND = [498, 500, 502, 501, 499];

/** Share of seeded samples whose interval contains μ = 500. */
function coverage(n, opts, seed = 1, samples = 10000) {
  const rng = mulberry32(seed);
  let hits = 0;
  for (let i = 0; i < samples; i++) {
    if (covers(meanInterval(drawSample('fill-a', n, rng), opts), 500)) hits++;
  }
  return hits / samples;
}

suite('intervals', () => {
  test('factors match the tables', () => {
    assertClose(intervalFactor(0.90), 1.645, 1e-3);
    assertClose(intervalFactor(0.95), 1.960, 1e-3);
    assertClose(intervalFactor(0.99), 2.576, 1e-3);
    assertClose(intervalFactor(0.95, 4), 2.776, 1e-3);
    assertClose(intervalFactor(0.95, 9), 2.262, 1e-3);
  });

  test('known sigma half-width', () => {
    const ten = Array.from({ length: 10 }, () => 500);
    assertClose(meanInterval(ten, { level: 0.95, sigma: 2 }).half, 1.2396, 1e-3);
    const forty = Array.from({ length: 40 }, () => 500);
    assertClose(meanInterval(forty, { level: 0.95, sigma: 2 }).half, 0.6198, 1e-3);
  });

  test('unknown sigma on hand values', () => {
    const z = meanInterval(HAND, { level: 0.95, method: 'z' });
    assertClose(z.mean, 500, 1e-12);
    assertClose(z.sd, Math.sqrt(2.5), 1e-12);
    assertClose(z.half, 1.386, 1e-3);
    assertClose(z.lo, 500 - z.half, 1e-12);
    assertClose(z.hi, 500 + z.half, 1e-12);
    assertClose(meanInterval(HAND, { level: 0.95, method: 't' }).half, 1.963, 1e-3);
  });

  test('unknown sigma below two values is NaN', () => {
    const one = meanInterval([500], { level: 0.95, method: 't' });
    assertTrue(Number.isNaN(one.half) && Number.isNaN(one.lo), 'NaN half and bounds');
  });

  test('t can hit where 1.96·s misses', () => {
    assertTrue(!covers(meanInterval(HAND, { level: 0.95, method: 'z' }), 501.5), 'z misses');
    assertTrue(covers(meanInterval(HAND, { level: 0.95, method: 't' }), 501.5), 't hits');
  });

  test('seeded coverage matches theory', () => {
    assertClose(coverage(10, { level: 0.95, sigma: 2 }), 0.95, 0.01);
    assertClose(coverage(5, { level: 0.95, method: 'z' }), 0.878, 0.012);
    assertClose(coverage(5, { level: 0.95, method: 't' }), 0.95, 0.01);
  });
});
