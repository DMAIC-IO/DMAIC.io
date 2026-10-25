/**
 * Processes of lessons 1 and 2: theory values, value summary, seeded shares,
 * sample draws and variances.
 */
import { suite, test, assertEqual, assertClose, assertTrue } from '../../test-utils.js';
import { mulberry32 } from '../../../js/engines/random-variates-engine.js';
import { POPULATIONS } from '../../../js/pages/training/populations.js';
import { PROCESSES, summarizeValues, drawSample, sampleVariances } from '../../../js/pages/training/processes.js';

const draws = (id, count, seed) => {
  const rng = mulberry32(seed);
  return Array.from({ length: count }, () => PROCESSES[id].draw(rng));
};

suite('processes', () => {
  test('processes have the spec\'s theory values', () => {
    assertClose(PROCESSES['fill-a'].mean, 500, 1e-12);
    assertClose(PROCESSES['fill-a'].sd, 2, 1e-12);
    assertClose(PROCESSES['fill-b'].mean, 500, 1e-12);
    assertClose(PROCESSES['fill-b'].sd, 5, 1e-12);
    for (const id of ['fill-a', 'fill-b']) {
      assertEqual(PROCESSES[id].axis[0], 480);
      assertEqual(PROCESSES[id].axis[1], 520);
      assertEqual(PROCESSES[id].unit, 'g');
    }
    assertClose(PROCESSES.waiting.mean, 35, 1e-12);
    assertClose(PROCESSES.waiting.sd, 15, 1e-12);
    assertEqual(PROCESSES.waiting.axis[0], 0);
    assertEqual(PROCESSES.waiting.axis[1], 130);
    assertEqual(PROCESSES.waiting.unit, 'min');
    assertTrue(PROCESSES.waiting.draw === POPULATIONS.skewed.draw, 'waiting reuses the skewed population');
  });

  test('process ids are not populations', () => {
    for (const id of Object.keys(PROCESSES)) assertTrue(!(id in POPULATIONS), id);
  });

  test('summarizeValues on hand values', () => {
    const s = summarizeValues([498, 500, 502]);
    assertEqual(s.count, 3);
    assertClose(s.mean, 500, 1e-12);
    assertClose(s.sd, 2, 1e-12);
    assertEqual(s.min, 498);
    assertEqual(s.max, 502);
    assertEqual(s.range, 4);
    assertClose(s.belowMean, 1 / 3, 1e-12);
    assertEqual(s.within[1], 1);
    assertEqual(s.within[2], 1);
  });

  test('summary of fewer than two values', () => {
    const empty = summarizeValues([]);
    assertEqual(empty.count, 0);
    assertTrue(Number.isNaN(empty.mean), 'mean NaN');
    assertTrue(Number.isNaN(empty.range), 'range NaN');
    const one = summarizeValues([7]);
    assertEqual(one.mean, 7);
    assertTrue(Number.isNaN(one.sd), 'sd NaN');
    assertEqual(one.range, 0);
    assertTrue(Number.isNaN(one.within[1]), 'within NaN');
    assertTrue(Number.isNaN(one.belowMean), 'belowMean NaN');
  });

  test('seeded draws match theory', () => {
    const a = summarizeValues(draws('fill-a', 100000, 1));
    assertTrue(Math.abs(a.mean - 500) < 0.05, `fill-a mean ${a.mean}`);
    assertTrue(Math.abs(a.sd - 2) < 0.03, `fill-a sd ${a.sd}`);
    assertTrue(Math.abs(a.within[1] - 0.683) < 0.01, `fill-a within 1 ${a.within[1]}`);
    assertTrue(Math.abs(a.within[2] - 0.954) < 0.01, `fill-a within 2 ${a.within[2]}`);
    const b = summarizeValues(draws('fill-b', 100000, 1));
    assertTrue(Math.abs(b.sd - 5) < 0.05, `fill-b sd ${b.sd}`);
    const w = summarizeValues(draws('waiting', 100000, 1));
    assertTrue(Math.abs(w.belowMean - 0.632) < 0.01, `waiting below mean ${w.belowMean}`);
    assertTrue(Math.abs(w.within[1] - 0.865) < 0.01, `waiting within 1 ${w.within[1]}`);
  });

  test('sampleVariances on hand values', () => {
    const v = sampleVariances([498, 500, 502]);
    assertClose(v.byN, 8 / 3, 1e-12);
    assertClose(v.byNMinus1, 4, 1e-12);
    const one = sampleVariances([7]);
    assertTrue(Number.isNaN(one.byN), 'byN NaN');
    assertTrue(Number.isNaN(one.byNMinus1), 'byNMinus1 NaN');
  });

  test('drawSample draws n values of the process', () => {
    const sample = drawSample('fill-a', 3, mulberry32(1));
    assertEqual(sample.length, 3);
    for (const x of sample) assertTrue(x > 480 && x < 520, `value ${x} on the axis`);
  });

  test('seeded running averages match theory', () => {
    const rng = mulberry32(1);
    let byN = 0;
    let byNMinus1 = 0;
    const samples = 20000;
    for (let i = 0; i < samples; i++) {
      const v = sampleVariances(drawSample('fill-a', 3, rng));
      byN += v.byN;
      byNMinus1 += v.byNMinus1;
    }
    assertTrue(Math.abs(byN / samples - 8 / 3) < 0.08, `average byN ${byN / samples}`);
    assertTrue(Math.abs(byNMinus1 / samples - 4) < 0.12, `average byNMinus1 ${byNMinus1 / samples}`);
  });
});
