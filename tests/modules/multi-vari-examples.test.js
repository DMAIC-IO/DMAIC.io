/**
 * D.Mike — Multi-Vari catalog examples (Task 19).
 *
 * DOM-free integrity checks for the two `multi-vari` catalog entries: the
 * shipped worksheet/project JSON files parse and reference each other
 * correctly, the catalog registration carries the right fields, and — the
 * part a browser click-through can't pin down as a regression test — the
 * real engines classify each dataset exactly as designed.
 *
 * Task 19's brief predicted (Step 5) that Spritzguss shows *no* warning and
 * that Abfüllanlage shows *both* `unbalanced` and `emptyCells`. Task 19's
 * first cut of the data didn't quite land there (see task-19-report.md,
 * "Fix round 1"): Spritzguss clamped a negative Schicht component, and
 * Abfüllanlage had every cell occupied despite being unevenly sized. Round 1
 * corrected the data to match the catalog description's own claims —
 * Spritzguss lifted the Spät wall-thickness values by +0.10 to make the
 * shift effect large enough that nothing clamps; Abfüllanlage dropped the
 * (Maschine=M2, Schicht=Spät, Charge=C2) cell entirely so the catalog's "mit
 * einer fehlenden Kombination" / "with one missing combination" claim is
 * literally true. Both outcomes are pinned here — including the percentages
 * — so a future data or engine change is caught precisely.
 */

import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertAlmostEqual } from '../test-utils.js';
import { computeMultiVari } from '../../js/engines/multi-vari-engine.js';
import { runVarianceDecomposition, pickLargestTerm } from '../../js/modules/multi-vari/multi-vari-analysis.js';

async function fetchJson(relPath) {
  const url = new URL(relPath, import.meta.url);
  const res = await fetch(url, { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

function sheetColumns(worksheetJson) {
  return Object.fromEntries(worksheetJson.sheets[0].state.columns.map(c => [c.id, c]));
}

function termPercent(terms, id) {
  const t = terms.find(x => x.id === id);
  assertTrue(!!t, `term ${id} not found in ${JSON.stringify(terms.map(x => x.id))}`);
  return t.percent;
}

suite('multi-vari catalog registration', () => {
  test('both examples are registered with the expected fields', async () => {
    const catalog = await fetchJson('../../examples/index.json');
    const byId = Object.fromEntries(catalog.examples.map(e => [e.id, e]));

    const spritzguss = byId['multi-vari-spritzguss'];
    assertTrue(!!spritzguss, 'multi-vari-spritzguss missing from catalog');
    assertEqual(spritzguss.type, 'project');
    assertEqual(spritzguss.format, 'json');
    assertEqual(spritzguss.file, 'projects/multi-vari-spritzguss.json');
    assertDeepEqualModules(spritzguss.modules);
    assertEqual(typeof spritzguss.title.de, 'string');
    assertEqual(typeof spritzguss.title.en, 'string');
    assertEqual(typeof spritzguss.description.de, 'string');
    assertEqual(typeof spritzguss.description.en, 'string');

    const abfuell = byId['multi-vari-abfuellanlage'];
    assertTrue(!!abfuell, 'multi-vari-abfuellanlage missing from catalog');
    assertEqual(abfuell.type, 'project');
    assertEqual(abfuell.format, 'json');
    assertEqual(abfuell.file, 'projects/multi-vari-abfuellanlage.json');
    assertDeepEqualModules(abfuell.modules);
    assertEqual(typeof abfuell.title.de, 'string');
    assertEqual(typeof abfuell.title.en, 'string');
    // The catalog description literally promises a missing combination —
    // round 1 corrected the data so this claim is true (see suite below).
    assertTrue(abfuell.description.de.includes('fehlenden Kombination'));
    assertTrue(abfuell.description.en.includes('missing combination'));

    function assertDeepEqualModules(modules) {
      assertTrue(Array.isArray(modules) && modules.length === 1 && modules[0] === 'multi-vari',
        `expected modules === ['multi-vari'], got ${JSON.stringify(modules)}`);
    }
  });

  test('no duplicate ids introduced', async () => {
    const catalog = await fetchJson('../../examples/index.json');
    const ids = catalog.examples.map(e => e.id);
    assertEqual(ids.filter(id => id === 'multi-vari-spritzguss').length, 1);
    assertEqual(ids.filter(id => id === 'multi-vari-abfuellanlage').length, 1);
  });
});

suite('multi-vari-spritzguss example data', () => {
  test('project file references the worksheet file and __source__ placeholders', async () => {
    const project = await fetchJson('../../examples/projects/multi-vari-spritzguss.json');
    assertEqual(project.sourceWorksheetFile, 'worksheets/multi-vari-spritzguss.json');
    assertEqual(project.columnRefs.measurement.instanceId, '__source__');
    assertEqual(project.columnRefs.measurement.sheetId, 'sheet-multi-vari-spritzguss');
    assertEqual(project.columnRefs.measurement.columnId, 'c-wand');
    assertEqual(project.columnRefs.factors.length, 3);
    project.columnRefs.factors.forEach(f => assertEqual(f.instanceId, '__source__'));
    assertEqual(project.modelForm, 'nested');
    assertEqual(project.estimator, 'anova');
  });

  test('worksheet is 24 rows, fully balanced, 2×2×3×2', async () => {
    const ws = await fetchJson('../../examples/worksheets/multi-vari-spritzguss.json');
    const cols = sheetColumns(ws);
    assertEqual(cols['c-schicht'].values.length, 24);
    assertEqual(new Set(cols['c-schicht'].values).size, 2);
    assertEqual(new Set(cols['c-nest'].values).size, 2);
    assertEqual(new Set(cols['c-teil'].values).size, 3);
    assertEqual(ws.sheets[0].state.rowCount, 24);
  });

  test('engines: balanced, warning-free flagship, largest variance share at the tool nest', async () => {
    const ws = await fetchJson('../../examples/worksheets/multi-vari-spritzguss.json');
    const cols = sheetColumns(ws);
    const factorNames = ['Schicht', 'Werkzeugnest', 'Teil'];
    const g = computeMultiVari({
      measurements: cols['c-wand'].values,
      factors: [
        { name: 'Schicht', values: cols['c-schicht'].values },
        { name: 'Werkzeugnest', values: cols['c-nest'].values },
        { name: 'Teil', values: cols['c-teil'].values },
      ],
    });
    const { result, vcError } = runVarianceDecomposition(g, {
      factorNames, modelForm: 'nested', estimator: 'anova',
    });

    assertEqual(vcError, null);
    assertEqual(result.n, 24);
    assertEqual(result.droppedRows, 0);
    assertTrue(result.balanced, 'expected the Spritzguss design to be balanced');

    // Round 1: the Spät wall-thickness values were lifted by +0.10 precisely
    // so the shift effect no longer clamps to 0 — this is now the
    // warning-free flagship example the plan's Step 5 predicted.
    assertDeepEqual(result.warnings, [], `expected no warnings, got ${JSON.stringify(result.warnings)}`);
    result.vc.terms.forEach(t => assertTrue(!t.clamped, `expected no clamped term, got ${t.id}`));

    const terms = result.vc.terms;
    assertAlmostEqual(termPercent(terms, 'A'), 32.830205887049246, 1e-6, 'Schicht (A) percent');
    assertAlmostEqual(termPercent(terms, 'B(A)'), 64.98096171823687, 1e-6, 'Werkzeugnest (B(A)) percent');
    assertAlmostEqual(termPercent(terms, 'C(AB)'), 1.9425887503192203, 1e-6, 'Teil (C(AB)) percent');
    assertAlmostEqual(termPercent(terms, 'Error'), 0.24624364439468407, 1e-6, 'Error percent');

    const largest = pickLargestTerm(terms);
    assertEqual(largest.id, 'B(A)', 'expected the largest variance share at the nest term B(A)');
  });
});

suite('multi-vari-abfuellanlage example data', () => {
  test('project file references the worksheet file and __source__ placeholders', async () => {
    const project = await fetchJson('../../examples/projects/multi-vari-abfuellanlage.json');
    assertEqual(project.sourceWorksheetFile, 'worksheets/multi-vari-abfuellanlage.json');
    assertEqual(project.columnRefs.measurement.columnId, 'c-fuell');
    assertEqual(project.columnRefs.factors.length, 3);
    assertEqual(project.modelForm, 'crossed');
    assertEqual(project.estimator, 'reml');
  });

  test('worksheet is 14 rows, 2×2×2 with one missing combination', async () => {
    const ws = await fetchJson('../../examples/worksheets/multi-vari-abfuellanlage.json');
    const cols = sheetColumns(ws);
    assertEqual(cols['c-maschine'].values.length, 14);
    assertEqual(new Set(cols['c-maschine'].values).size, 2);
    assertEqual(new Set(cols['c-schicht'].values).size, 2);
    assertEqual(new Set(cols['c-charge'].values).size, 2);
    assertEqual(ws.sheets[0].state.rowCount, 14);

    // Round 1 dropped the (M2, Spät, C2) cell entirely so the catalog's
    // "mit einer fehlenden Kombination" claim is literally true.
    const rows = cols['c-maschine'].values.map((_, i) => [
      cols['c-maschine'].values[i], cols['c-schicht'].values[i], cols['c-charge'].values[i],
    ]);
    const hasMissingCell = !rows.some(([m, s, c]) => m === 'M2' && s === 'Spät' && c === 'C2');
    assertTrue(hasMissingCell, 'expected (M2, Spät, C2) to be entirely absent');
  });

  test('engines: unbalanced with an empty cell, REML sits on the boundary', async () => {
    const ws = await fetchJson('../../examples/worksheets/multi-vari-abfuellanlage.json');
    const cols = sheetColumns(ws);
    const factorNames = ['Maschine', 'Schicht', 'Charge'];
    const g = computeMultiVari({
      measurements: cols['c-fuell'].values,
      factors: [
        { name: 'Maschine', values: cols['c-maschine'].values },
        { name: 'Schicht', values: cols['c-schicht'].values },
        { name: 'Charge', values: cols['c-charge'].values },
      ],
    });
    const { result } = runVarianceDecomposition(g, {
      factorNames, modelForm: 'crossed', estimator: 'reml',
    });

    assertEqual(result.n, 14);
    assertEqual(result.droppedRows, 0);
    assertTrue(result.balanced === false, 'expected the Abfüllanlage design to be unbalanced');

    // Round 1: dropping the (M2, Spät, C2) cell makes `emptyCells` fire
    // alongside `unbalanced` — matching the catalog's own description.
    // `notConverged` used to sit here too. It no longer does: the missing cell
    // makes A*B*C fully aliased (df 0), and the constrained AI-REML step now
    // drops that non-estimable term and pins the boundary components instead
    // of degenerating to pure EM. Thirteen iterations, converged.
    assertDeepEqual(
      [...result.warnings].sort(),
      ['emptyCells', 'unbalanced'],
      `unexpected warning set: ${JSON.stringify(result.warnings)}`,
    );
    assertTrue(result.vc.converged, 'expected the REML fit to converge');

    const terms = result.vc.terms;
    assertAlmostEqual(termPercent(terms, 'A'), 81.49270013066668, 1e-6, 'Maschine (A) percent');
    assertAlmostEqual(termPercent(terms, 'B'), 1.1794200669283021, 1e-6, 'Schicht (B) percent');
    assertAlmostEqual(termPercent(terms, 'C'), 15.5764816784071, 1e-6, 'Charge (C) percent');
    assertAlmostEqual(termPercent(terms, 'Error'), 0.581584478430451, 1e-6, 'Error percent');
  });
});
