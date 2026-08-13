/**
 * Deterministic generator for the "Hubschrauber vom Messestand" DoE example.
 *
 * Physics model: t(L,C) = 0.5 + 0.56·L - 0.04·L² + 0.68·C - 0.34·C² + N(0, 0.12²)
 * Seed: 1305 (Mulberry32 + Box-Muller).
 *
 * A single PRNG stream (seeded once) feeds, in order:
 *   1. 18 DoE runs   — 3² full-factorial × 2 replicates, block-major by
 *      rotor length L (block order 8 → 6 → 4, never randomized — the block
 *      factor is physically irreversible: the rotor is cut shorter between
 *      blocks and cannot be lengthened again). Within each block, the 6
 *      (clip, replicate) combinations are shuffled (Fisher-Yates).
 *   2. 10 baseline runs   — all at (L=8, C=0), drawn right after the DoE runs.
 *   3. 5 confirmation runs — all at (L=6, C=1), drawn right after baseline.
 *
 * Consumed by Task 3 (doe-planner example), Task 6 (individual-value-plot /
 * xy-plot baseline example) and Task 8 (control-chart confirmation example).
 *
 * CLI usage:
 *   node hubschrauber-flyer.mjs              → full generator output (JSON)
 *   node hubschrauber-flyer.mjs --worksheet  → shared worksheet JSON only
 *     ({ sheets: [...] }, for app/dev/examples/worksheets/hubschrauber-flyer.json)
 */

/**
 * Mulberry32 PRNG — deterministic, fast, good-enough statistical quality for
 * synthetic example data.
 * @param {number} seed
 * @returns {() => number} function returning a float in [0, 1)
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Box-Muller transform — one standard-normal draw per call, consuming two
 * uniform draws from `rand`.
 * @param {() => number} rand
 * @returns {number}
 */
function boxMuller(rand) {
  const u1 = Math.max(rand(), 1e-12);
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * In-place-safe Fisher-Yates shuffle, driven by the shared `rand` stream.
 * @template T
 * @param {T[]} arr
 * @param {() => number} rand
 * @returns {T[]} new shuffled array
 */
function fisherYates(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Noise-free model mean for a given (rotor length L, clip count C).
 * t(L,C) = 0.5 + 0.56·L - 0.04·L² + 0.68·C - 0.34·C²
 * @param {number} L rotor length in cm
 * @param {number} C number of paper clips
 * @returns {number}
 */
function modelMean(L, C) {
  return 0.5 + 0.56 * L - 0.04 * L * L + 0.68 * C - 0.34 * C * C;
}

const SIGMA = 0.12;

/**
 * Draw one noisy flight time from the model at (L, C), consuming the shared
 * `rand` stream. Clipped at 0.5s (a flight cannot have negative/zero
 * duration; the physical minimum is well above zero anyway).
 * @param {number} L
 * @param {number} C
 * @param {() => number} rand
 * @returns {number}
 */
function drawFlightTime(L, C, rand) {
  const mean = modelMean(L, C);
  return Math.max(0.5, Math.round((mean + SIGMA * boxMuller(rand)) * 1000) / 1000);
}

/**
 * Build the shared worksheet payload (3 sheets: baseline, doe, confirmation)
 * consumed via `sourceWorksheetFile` by the worksheet-backed modules
 * (individual-value-plot, xy-plot, control-chart — see schema recon §3).
 *
 * @param {object} data
 * @param {ReturnType<typeof buildRuns>} data.runs
 * @param {object[]} data.baselineRuns
 * @param {object[]} data.confirmationRuns
 * @returns {{ sheets: object[] }}
 */
function buildWorksheet({ runs, baselineRuns, confirmationRuns }) {
  const doeSheet = {
    id: 'sheet-hubschrauber-doe',
    name: 'Hubschrauber – DoE (3² Volldesign)',
    state: {
      columns: [
        { id: 'c-lauf', name: 'Lauf', shortName: 'Lauf', type: 'numeric', values: runs.map((r) => r.runOrder) },
        { id: 'c-block', name: 'Block', shortName: 'Blk', type: 'numeric', values: runs.map((r) => r.block) },
        { id: 'c-rotorlaenge', name: 'Rotorlänge_cm', shortName: 'L', type: 'numeric', values: runs.map((r) => r.L) },
        { id: 'c-klammern', name: 'Klammern', shortName: 'C', type: 'numeric', values: runs.map((r) => r.C) },
        { id: 'c-replikat', name: 'Replikat', shortName: 'Rep', type: 'numeric', values: runs.map((r) => r.replicate) },
        { id: 'c-flugzeit', name: 'Flugzeit_s', shortName: 't', type: 'numeric', values: runs.map((r) => r.flightTime) },
      ],
      rowCount: runs.length,
    },
  };

  const baselineSheet = {
    id: 'sheet-hubschrauber-baseline',
    name: 'Hubschrauber – Baseline (L=8, C=0)',
    state: {
      columns: [
        { id: 'c-lauf', name: 'Lauf', shortName: 'Lauf', type: 'numeric', values: baselineRuns.map((r) => r.index) },
        { id: 'c-rotorlaenge', name: 'Rotorlänge_cm', shortName: 'L', type: 'numeric', values: baselineRuns.map((r) => r.L) },
        { id: 'c-klammern', name: 'Klammern', shortName: 'C', type: 'numeric', values: baselineRuns.map((r) => r.C) },
        { id: 'c-flugzeit', name: 'Flugzeit_s', shortName: 't', type: 'numeric', values: baselineRuns.map((r) => r.flightTime) },
      ],
      rowCount: baselineRuns.length,
    },
  };

  const confirmationSheet = {
    id: 'sheet-hubschrauber-confirmation',
    name: 'Hubschrauber – Bestätigung (L=6, C=1)',
    state: {
      columns: [
        { id: 'c-lauf', name: 'Lauf', shortName: 'Lauf', type: 'numeric', values: confirmationRuns.map((r) => r.index) },
        { id: 'c-rotorlaenge', name: 'Rotorlänge_cm', shortName: 'L', type: 'numeric', values: confirmationRuns.map((r) => r.L) },
        { id: 'c-klammern', name: 'Klammern', shortName: 'C', type: 'numeric', values: confirmationRuns.map((r) => r.C) },
        { id: 'c-flugzeit', name: 'Flugzeit_s', shortName: 't', type: 'numeric', values: confirmationRuns.map((r) => r.flightTime) },
      ],
      rowCount: confirmationRuns.length,
    },
  };

  return { sheets: [baselineSheet, doeSheet, confirmationSheet] };
}

/**
 * Generate the full deterministic Hubschrauber-Flyer dataset: 18 DoE runs
 * (block-major, clip order randomized per block), 10 baseline runs, 5
 * confirmation runs, cell means, and the shared worksheet payload.
 *
 * @param {number} [seed=1305]
 * @returns {{
 *   runs: object[],
 *   baselineRuns: object[],
 *   confirmationRuns: object[],
 *   cellMeans: Record<string, number>,
 *   worksheet: { sheets: object[] },
 *   seed: number,
 *   model: string,
 * }}
 */
export function generateHelicopterData(seed = 1305) {
  const rand = mulberry32(seed);
  const L_levels = [8, 6, 4]; // block order — irreversible cut, never randomized
  const C_levels = [0, 1, 2];
  const replicates = 2;

  // 1. 18 DoE runs, block-major by L, clip order randomized within block.
  const runs = [];
  let runOrder = 1;
  for (let b = 0; b < L_levels.length; b++) {
    const L = L_levels[b];
    const pairs = [];
    for (const C of C_levels) {
      for (let r = 1; r <= replicates; r++) pairs.push({ C, replicate: r });
    }
    const shuffled = fisherYates(pairs, rand);
    for (const { C, replicate } of shuffled) {
      const flightTime = drawFlightTime(L, C, rand);
      runs.push({ runOrder: runOrder++, block: b + 1, L, C, replicate, flightTime });
    }
  }

  // 2. 10 baseline runs at (L=8, C=0) — same rand() stream, continued.
  const baselineRuns = [];
  for (let i = 1; i <= 10; i++) {
    baselineRuns.push({ index: i, L: 8, C: 0, flightTime: drawFlightTime(8, 0, rand) });
  }

  // 3. 5 confirmation runs at (L=6, C=1) — same rand() stream, continued.
  const confirmationRuns = [];
  for (let i = 1; i <= 5; i++) {
    confirmationRuns.push({ index: i, L: 6, C: 1, flightTime: drawFlightTime(6, 1, rand) });
  }

  const cellMeans = {};
  for (const L of L_levels) {
    for (const C of C_levels) {
      cellMeans[`L=${L},C=${C}`] = modelMean(L, C);
    }
  }

  const result = {
    runs,
    baselineRuns,
    confirmationRuns,
    cellMeans,
    seed,
    model: 't(L,C) = 0.5 + 0.56*L - 0.04*L² + 0.68*C - 0.34*C² + N(0, 0.12²)',
  };
  result.worksheet = buildWorksheet(result);
  return result;
}

// CLI: emit JSON to stdout when run directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--worksheet')) {
    console.log(JSON.stringify(generateHelicopterData().worksheet, null, 2));
  } else {
    console.log(JSON.stringify(generateHelicopterData(), null, 2));
  }
}
