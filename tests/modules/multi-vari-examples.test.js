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
 * that Abfüllanlage shows *both* `unbalanced` and `emptyCells`. Measured
 * against the transcribed data, neither holds exactly:
 *   - Spritzguss: the nested ANOVA's Schicht (A) component comes out
 *     slightly negative (MS_A < MS_B(A) at df=1) and gets clamped to 0,
 *     which raises `negativeComponent` — a real, correctly-surfaced warning,
 *     not a bug. The nest-vs-shift story ("Löwenanteil beim Werkzeugnest")
 *     still holds: B(A) carries ~96.7% of the variance.
 *   - Abfüllanlage: every one of the 8 (Maschine × Schicht × Charge) cells
 *     is actually occupied (counts 1–3) — the design is unevenly occupied
 *     (`unbalanced`) but no cell is empty, so `emptyCells` never fires.
 * Both are pinned here so a future data/engine change is caught either way.
 */

import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
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

  test('engines: balanced, largest variance share at the tool nest', async () => {
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

    const largest = pickLargestTerm(result.vc.terms);
    assertEqual(largest.id, 'B(A)', 'expected the largest variance share at the nest term B(A)');
    assertTrue(largest.percent > 90, `expected B(A) to dominate, got ${largest.percent}%`);

    // See file header: the Schicht (A) component clamps to 0 for this data,
    // which correctly raises `negativeComponent` — contra the brief's Step 5
    // prediction of "no warning".
    assertTrue(result.warnings.includes('negativeComponent'),
      'expected negativeComponent (Schicht component clamped to 0)');
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

  test('worksheet is 16 rows, 2×2×2', async () => {
    const ws = await fetchJson('../../examples/worksheets/multi-vari-abfuellanlage.json');
    const cols = sheetColumns(ws);
    assertEqual(cols['c-maschine'].values.length, 16);
    assertEqual(new Set(cols['c-maschine'].values).size, 2);
    assertEqual(new Set(cols['c-schicht'].values).size, 2);
    assertEqual(new Set(cols['c-charge'].values).size, 2);
    assertEqual(ws.sheets[0].state.rowCount, 16);
  });

  test('engines: unevenly occupied, all 8 cells present (no emptyCells)', async () => {
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

    assertEqual(result.n, 16);
    assertEqual(result.droppedRows, 0);
    assertTrue(result.balanced === false, 'expected the Abfüllanlage design to be unbalanced');
    assertTrue(result.warnings.includes('unbalanced'));

    // See file header: every one of the 8 combinations is actually occupied
    // in this transcribed data (counts range 1–3) — no cell is empty, so
    // `emptyCells` does not fire, contra the brief's Step 2/5 claim that the
    // "last combination is missing entirely".
    assertTrue(!result.warnings.includes('emptyCells'),
      'did not expect emptyCells — every (Maschine, Schicht, Charge) cell is occupied');
  });
});
