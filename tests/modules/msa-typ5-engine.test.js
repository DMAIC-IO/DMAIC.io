/**
 * D.Mike — MSA Typ 5 Engine Tests (msa-typ5-engine.test.js)
 * Unit tests for kappa-based attribute MSA engine.
 * See docs/superpowers/specs/2026-07-15-msa-typ5-design.md for the module spec.
 */

import { suite, test, assert, assertClose } from '../test-utils.js';
import { validate, ERR, WARN, cohenKappa, fleissKappa, wilsonCI, effectiveness, missAndFA } from '../../js/engines/msa-typ5-engine.js';

// Fixture-Loader — löst relativ zur eigenen JS-URL auf, damit
// runner.html-Pfad (../fixtures/...) das richtige Verzeichnis erreicht.
async function loadFixture(name) {
  const resp = await fetch(new URL(`../fixtures/msa/${name}.fixtures.json`, import.meta.url));
  return resp.json();
}

// ─── validate() ────────────────────────────────────────────────
const base = { type: 'binary', levels: ['ok','nok'], ratings: [
  { part: 1, appraiser: 'A', rep: 1, value: 'ok' },
  { part: 1, appraiser: 'A', rep: 2, value: 'ok' },
  { part: 1, appraiser: 'B', rep: 1, value: 'ok' },
  { part: 1, appraiser: 'B', rep: 2, value: 'ok' },
  { part: 2, appraiser: 'A', rep: 1, value: 'nok' },
  { part: 2, appraiser: 'A', rep: 2, value: 'nok' },
  { part: 2, appraiser: 'B', rep: 1, value: 'nok' },
  { part: 2, appraiser: 'B', rep: 2, value: 'nok' },
], references: null };

suite('msa-typ5-engine — validate', () => {
  test('leere ratings → E_NO_RATINGS', () => {
    const r = validate({ ...base, ratings: [] });
    assert(!r.valid);
    assert(r.errors.some(e => e.code === ERR.NO_RATINGS));
  });

  test('nur 1 Teil → E_TOO_FEW_PARTS', () => {
    const r = validate({ ...base, ratings: base.ratings.filter(x => x.part === 1) });
    assert(!r.valid);
    assert(r.errors.some(e => e.code === ERR.TOO_FEW_PARTS));
  });

  test('nur 1 Pruefer → E_TOO_FEW_APPRAISERS', () => {
    const r = validate({ ...base, ratings: base.ratings.filter(x => x.appraiser === 'A') });
    assert(!r.valid);
    assert(r.errors.some(e => e.code === ERR.TOO_FEW_APPRAISERS));
  });

  test('nur 1 Level in Bewertungen → E_TOO_FEW_LEVELS', () => {
    const rs = base.ratings.map(r => ({ ...r, value: 'ok' }));
    const r = validate({ ...base, ratings: rs });
    assert(!r.valid);
    assert(r.errors.some(e => e.code === ERR.TOO_FEW_LEVELS));
  });

  test('Referenzwert ausserhalb levels → E_UNKNOWN_REFERENCE_LEVEL', () => {
    const r = validate({ ...base, references: { 1: 'xxx', 2: 'nok' } });
    assert(!r.valid);
    assert(r.errors.some(e => e.code === ERR.UNKNOWN_REFERENCE_LEVEL));
  });

  test('unbekannter type → E_INVALID_TYPE', () => {
    const r = validate({ ...base, type: 'fuzzy' });
    assert(!r.valid);
    assert(r.errors.some(e => e.code === ERR.INVALID_TYPE));
  });

  test('valider Input → valid, keine Errors', () => {
    const r = validate(base);
    assert(r.valid, `Expected valid, got errors: ${JSON.stringify(r.errors)}`);
    assert(r.errors.length === 0);
  });

  test('unbalancierte Wiederholungen → W_UNBALANCED_REPS', () => {
    const rs = [...base.ratings, { part: 2, appraiser: 'A', rep: 3, value: 'nok' }];
    const r = validate({ ...base, ratings: rs });
    assert(r.valid);
    assert(r.warnings.some(w => w.code === WARN.UNBALANCED_REPS));
  });
});

// ─── cohenKappa (unweighted) ─────────────────────────────────

suite('msa-typ5-engine — cohenKappa (unweighted)', () => {
  test('binary-2rater matcht sklearn-Referenz', async () => {
    const fx = await loadFixture('cohen-kappa');
    const c = fx.test_cases.find(x => x.id === 'binary-2rater');
    // Fixture-Generator sortiert Levels alphabetisch; um Konfusionsmatrix
    // 1:1 zu treffen, denselben Level-Order übergeben.
    const r = cohenKappa(c.inputs.raterA, c.inputs.raterB,
      { levels: ['nok', 'ok'], weights: null, alpha: 0.05 });
    assertClose(r.kappa,     c.expected.kappa,      1e-9);
    assertClose(r.se,        c.expected.se,         1e-9);
    assertClose(r.ci95[0],   c.expected.ci95[0],    1e-9);
    assertClose(r.ci95[1],   c.expected.ci95[1],    1e-9);
    assert(r.method === 'cohen');
    // Konfusions-Matrix elementweise
    for (let i = 0; i < r.confusion.length; i++)
      for (let j = 0; j < r.confusion[i].length; j++)
        assert(r.confusion[i][j] === c.expected.confusion[i][j],
          `confusion[${i}][${j}] = ${r.confusion[i][j]}, expected ${c.expected.confusion[i][j]}`);
  });

  test('nominal-3class-2rater matcht sklearn-Referenz', async () => {
    const fx = await loadFixture('cohen-kappa');
    const c = fx.test_cases.find(x => x.id === 'nominal-3class-2rater');
    const r = cohenKappa(c.inputs.raterA, c.inputs.raterB,
      { levels: ['A', 'B', 'C'], weights: null, alpha: 0.05 });
    assertClose(r.kappa, c.expected.kappa, 1e-9);
    assertClose(r.se,    c.expected.se,    1e-9);
    assert(r.method === 'cohen');
  });
});

// ─── cohenKappa (weighted) ───────────────────────────────────

suite('msa-typ5-engine — cohenKappa (weighted)', () => {
  test('weighted-linear matcht sklearn', async () => {
    const fx = await loadFixture('weighted-kappa');
    const c = fx.test_cases.find(x => x.id === 'ordinal-linear');
    const r = cohenKappa(c.inputs.raterA, c.inputs.raterB,
      { levels: [1, 2, 3, 4, 5], weights: 'linear', alpha: 0.05 });
    assertClose(r.kappa, c.expected.kappa, 1e-9);
    assert(r.method === 'weighted-linear');
  });

  test('weighted-quadratic matcht sklearn', async () => {
    const fx = await loadFixture('weighted-kappa');
    const c = fx.test_cases.find(x => x.id === 'ordinal-quadratic');
    const r = cohenKappa(c.inputs.raterA, c.inputs.raterB,
      { levels: [1, 2, 3, 4, 5], weights: 'quadratic', alpha: 0.05 });
    assertClose(r.kappa, c.expected.kappa, 1e-9);
    assert(r.method === 'weighted-quadratic');
  });
});

// ─── fleissKappa ─────────────────────────────────────────────

suite('msa-typ5-engine — fleissKappa', () => {
  test('3rater-balanced matcht statsmodels + method fleiss-1971', async () => {
    const fx = await loadFixture('fleiss-kappa');
    const c = fx.test_cases.find(x => x.id === '3rater-balanced');
    const byPart = new Map();
    c.inputs.ratings.forEach((row, i) => byPart.set(i + 1, row));
    const r = fleissKappa(byPart, { levels: ['ok', 'nok'], alpha: 0.05 });
    assertClose(r.kappa, c.expected.kappa, 1e-9);
    assert(r.method === 'fleiss-1971');
    assertClose(r.se, c.expected.se, 1e-9);
    assertClose(r.ci95[0], c.expected.ci95[0], 1e-9);
    assertClose(r.ci95[1], c.expected.ci95[1], 1e-9);
  });

  test('3rater-unbalanced → Randolph, method vermerkt, SE = NaN', async () => {
    const fx = await loadFixture('fleiss-kappa');
    const c = fx.test_cases.find(x => x.id === '3rater-unbalanced-randolph');
    const byPart = new Map();
    c.inputs.ratings.forEach((row, i) => byPart.set(i + 1, row));
    const r = fleissKappa(byPart, { levels: ['ok', 'nok'], alpha: 0.05 });
    assertClose(r.kappa, c.expected.kappa, 1e-9);
    assert(r.method === 'randolph');
    // Fixture serialisiert NaN als String "NaN" — assertClose kann das.
    assertClose(r.se, c.expected.se, 1e-9);
    assertClose(r.ci95[0], c.expected.ci95[0], 1e-9);
    assertClose(r.ci95[1], c.expected.ci95[1], 1e-9);
  });
});

// ─── wilsonCI ────────────────────────────────────────────────

suite('msa-typ5-engine — wilsonCI', () => {
  test('standard matcht statsmodels', async () => {
    const fx = await loadFixture('effectiveness-wilson');
    const c = fx.test_cases.find(x => x.id === 'standard');
    const r = wilsonCI(c.inputs.agree, c.inputs.total, 0.05);
    assertClose(r.rate, c.expected.rate, 1e-9);
    assertClose(r.ci95[0], c.expected.ci95[0], 1e-6);
    assertClose(r.ci95[1], c.expected.ci95[1], 1e-6);
  });

  test('edge-0 → lo = 0, hi ∈ (0, 1), keine NaN', async () => {
    const fx = await loadFixture('effectiveness-wilson');
    const c = fx.test_cases.find(x => x.id === 'edge-0');
    const r = wilsonCI(c.inputs.agree, c.inputs.total, 0.05);
    assert(r.rate === 0);
    assert(r.ci95[0] >= 0 && r.ci95[1] <= 1);
    assert(Number.isFinite(r.ci95[0]) && Number.isFinite(r.ci95[1]));
    assertClose(r.ci95[1], c.expected.ci95[1], 1e-6);
  });

  test('edge-N → hi = 1', async () => {
    const fx = await loadFixture('effectiveness-wilson');
    const c = fx.test_cases.find(x => x.id === 'edge-N');
    const r = wilsonCI(c.inputs.agree, c.inputs.total, 0.05);
    assertClose(r.ci95[0], c.expected.ci95[0], 1e-6);
    // Wilson clamped auf 1
    assert(r.ci95[1] <= 1);
    assert(r.ci95[1] > 0.99);
  });
});

// ─── effectiveness / missAndFA ───────────────────────────────

suite('msa-typ5-engine — effectiveness', () => {
  test('perfekter Prüfer → rate = 1', () => {
    const ratings = [
      { part: 1, appraiser: 'A', rep: 1, value: 'ok' },
      { part: 2, appraiser: 'A', rep: 1, value: 'nok' },
      { part: 3, appraiser: 'A', rep: 1, value: 'ok' },
    ];
    const refs = { 1: 'ok', 2: 'nok', 3: 'ok' };
    const r = effectiveness(ratings, refs, { alpha: 0.05 });
    assertClose(r.perAppraiser.A.rate, 1.0, 1e-12);
    assert(r.perAppraiser.A.agree === 3 && r.perAppraiser.A.total === 3);
  });

  test('ambiguousParts wird ausgeschlossen', () => {
    const ratings = [
      { part: 1, appraiser: 'A', rep: 1, value: 'ok' },   // ambig
      { part: 1, appraiser: 'A', rep: 2, value: 'nok' },  // ambig
      { part: 2, appraiser: 'A', rep: 1, value: 'nok' },
    ];
    const refs = { 2: 'nok' };
    const r = effectiveness(ratings, refs, { alpha: 0.05, ambiguousParts: [1] });
    assert(r.perAppraiser.A.total === 1);
    assert(r.perAppraiser.A.agree === 1);
  });
});

suite('msa-typ5-engine — missAndFA', () => {
  test('miss/fa/bias korrekt (Konvention pos=levels[0])', () => {
    // ref=ok (pos): Bewertung nok → FA
    // ref=nok (neg): Bewertung ok → Miss
    const ratings = [
      { part: 1, appraiser: 'A', rep: 1, value: 'ok' },   // ref=ok  → TP
      { part: 2, appraiser: 'A', rep: 1, value: 'nok' },  // ref=ok  → FA
      { part: 3, appraiser: 'A', rep: 1, value: 'ok' },   // ref=nok → Miss
      { part: 4, appraiser: 'A', rep: 1, value: 'nok' },  // ref=nok → TN
    ];
    const refs = { 1: 'ok', 2: 'ok', 3: 'nok', 4: 'nok' };
    const r = missAndFA(ratings, refs, { positive: 'ok', alpha: 0.05 });
    // Miss = 1/2 (bei ref=nok gab es 1 mal ok)
    assertClose(r.perAppraiser.A.missRate.rate,       0.5, 1e-12);
    assertClose(r.perAppraiser.A.falseAlarmRate.rate, 0.5, 1e-12);
    assertClose(r.perAppraiser.A.biasRate.value,      0.0, 1e-12);
  });
});
