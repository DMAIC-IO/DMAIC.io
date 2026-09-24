import { suite, test, assertEqual } from '../test-utils.js';
import { actionPriority, AP_RANK, AP_CATEGORY, bandLabel } from '../../js/modules/fmea/fmea-ap.js';

const fixture = await (await fetch(new URL('../fixtures/fmea/fmea-ap-table.fixtures.json', import.meta.url))).json();

/** Expand a band label like '7-10' or '1' into its integer ratings. */
function expand(label) {
  const [lo, hi = lo] = label.split('-').map(Number);
  const out = [];
  for (let v = lo; v <= hi; v++) out.push(v);
  return out;
}

/** Expected S-O-D → AP map built from the fixture, plus the raw assignment count. */
function expected() {
  const map = new Map();
  let assignments = 0;
  for (const row of fixture.rows) {
    for (const s of expand(row.s)) {
      for (const o of expand(row.o)) {
        fixture.dBands.forEach((band, i) => {
          for (const d of expand(band)) { map.set(`${s}-${o}-${d}`, row.ap[i]); assignments++; }
        });
      }
    }
  }
  return { map, assignments };
}

suite('FMEA AP — reference table', () => {
  test('fixture covers all 1000 S/O/D combinations exactly once', () => {
    const { map, assignments } = expected();
    assertEqual(map.size, 1000);
    assertEqual(assignments, 1000);
  });

  test('actionPriority matches the fixture for all 1000 combinations', () => {
    const { map } = expected();
    const wrong = [];
    for (let s = 1; s <= 10; s++) {
      for (let o = 1; o <= 10; o++) {
        for (let d = 1; d <= 10; d++) {
          const key = `${s}-${o}-${d}`;
          const got = actionPriority(s, o, d);
          if (got !== map.get(key)) wrong.push(`${key}: ${got} ≠ ${map.get(key)}`);
        }
      }
    }
    assertEqual(wrong.length, 0, wrong.slice(0, 10).join(', '));
  });
});

suite('FMEA AP — input handling', () => {
  test('accepts numeric strings (persisted S/O/D are strings)', () => {
    assertEqual(actionPriority('9', '4', '1'), 'M');
    assertEqual(actionPriority(' 10 ', '8', '7'), 'H');
  });

  test('invalid or missing values yield null', () => {
    for (const bad of [0, 11, -1, 2.5, '', 'x', '5a', null, undefined, NaN]) {
      assertEqual(actionPriority(bad, 5, 5), null, `S=${bad}`);
      assertEqual(actionPriority(5, bad, 5), null, `O=${bad}`);
      assertEqual(actionPriority(5, 5, bad), null, `D=${bad}`);
    }
  });

  test('AP_RANK orders H > M > L', () => {
    assertEqual(AP_RANK.H > AP_RANK.M && AP_RANK.M > AP_RANK.L, true);
  });

  test('AP_CATEGORY maps to the existing CSS category keys', () => {
    assertEqual(AP_CATEGORY.H, 'high');
    assertEqual(AP_CATEGORY.M, 'medium');
    assertEqual(AP_CATEGORY.L, 'low');
  });

  test('bandLabel formats single values and ranges', () => {
    assertEqual(bandLabel([1, 1]), '1');
    assertEqual(bandLabel([7, 10]), '7–10');
  });
});
