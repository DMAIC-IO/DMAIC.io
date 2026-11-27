/**
 * D.Mike — Headless (no-browser) unit test runner.
 *
 * Runs the DOM-free unit suites directly in node — no Playwright, no Chromium,
 * no DOM emulation. It imports every `*.test.js` file that does not depend on a
 * live DOM (each registers its suites via the shared test-utils registry), then
 * runs them with `runAll()`.
 *
 *   node tests/run-node.mjs           # run all DOM-free suites
 *   node tests/run-node.mjs engines   # only files whose path contains "engines"
 *
 * Suites that need a real DOM/SVG layout, IndexedDB, or Alpine (module shells,
 * charts, datagrid, pages, storage, …) are listed in SKIP below and stay in the
 * browser runner (tests/runner.html). A pure unit test —
 * models, engines, parsers — has no such dependency and belongs here.
 *
 * Exit code is non-zero when any test fails.
 */

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { checkSkipList, parseRunnerFiles } from './skip-list-check.mjs';
import { formatSummary } from './run-summary.mjs';

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));

// Pin the time zone: date suites guard calendar-day handling east of UTC and
// would fail on a UTC CI runner. Set before any suite is imported.
process.env.TZ = 'Europe/Berlin';

// Fixture-driven tests load JSON via `fetch(new URL('../fixtures/…', import.meta.url))`.
// In the browser that base URL is http(s); under node it is a file:// URL, which
// node's global fetch rejects. Teach the global fetch to serve file:// from disk.
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  if (url.startsWith('file://')) {
    const body = await readFile(fileURLToPath(url), 'utf8');
    return {
      ok: true,
      status: 200,
      url,
      async json() { return JSON.parse(body); },
      async text() { return body; },
    };
  }
  return realFetch(input, init);
};

// Web Storage is not DOM: an in-memory stand-in lets suites whose subject
// only reads/writes localStorage or sessionStorage run here. Like the real
// Storage, items are own enumerable properties and the methods live on the
// prototype, so `Object.keys(localStorage)` lists the stored keys — the app
// sweeps keys that way (legacy migration, project deletion).
class MemoryStorage {
  get length() { return Object.keys(this).length; }
  key(i) { return Object.keys(this)[i] ?? null; }
  getItem(k) { return Object.hasOwn(this, String(k)) ? this[String(k)] : null; }
  setItem(k, v) { this[String(k)] = String(v); }
  removeItem(k) { delete this[String(k)]; }
  clear() { for (const k of Object.keys(this)) delete this[k]; }
}
globalThis.localStorage ??= new MemoryStorage();
globalThis.sessionStorage ??= new MemoryStorage();

// DOM-dependent suites — run in the browser bridge, not here. Paths relative to
// this directory. Keep sorted; add a file here if it starts needing the DOM.
// Every entry must also be imported by tests/runner.html — checked below
// (skip-list-check.mjs), since a file in SKIP alone would run nowhere.
const SKIP = new Set([
  'algorithm-lab/lab-inline.test.js',
  'algorithm-lab/lab-renderer.test.js',
  'core/chart/bar-numeric-axis.test.js',
  'core/chart/boxplot.test.js',
  'core/chart/chart-base-editor-change.test.js',
  'core/chart/chart-editor-keys-coverage.test.js',
  'core/chart/chart-base-modebar.test.js',
  'core/chart/chart-axis-range.test.js',
  'core/chart/chart-editor-sections.test.js',
  'core/chart/chart-fixed-size.test.js',
  'core/chart/chart-legend-order.test.js',
  'core/chart/chart-module-ref-lines.test.js',
  'core/chart/chart-title-center.test.js',
  'core/chart/chart-axis-title-gap.test.js',
  'core/chart/chart-exact-range.test.js',
  'core/chart/chart-export-xlsx.test.js',
  'core/chart/chart-manager-destroy.test.js',
  'core/chart/chart-manager-errors.test.js',
  'core/chart/chart-manager-export.test.js',
  'core/chart/chart-manager.test.js',
  'core/chart/contour-type.test.js',
  'core/chart/control-chart.test.js',
  'core/chart/chart-margins.test.js',
  'core/chart/cumulative-cost.test.js',
  'core/chart/gage-run-chart.test.js',
  'core/chart/gantt.test.js',
  'core/chart/histogram-bins.test.js',
  'core/chart/histogram-multi.test.js',
  'core/chart/interval-stack.test.js',
  'core/chart/mosaic.test.js',
  'core/chart/multi-vari.test.js',
  'core/chart/node-diagram.test.js',
  'core/chart/pareto.test.js',
  'core/chart/pie.test.js',
  'core/chart/probability-plot-render.test.js',
  'core/chart/run-chart.test.js',
  'core/chart/scatter-connect-line.test.js',
  'core/chart/scatter-labels.test.js',
  'core/chart/trend.test.js',
  'core/chunks.test.js',
  'core/computed.test.js',
  'core/context-help-describe.test.js',
  'core/context-help.test.js',
  'core/create-dialog.test.js',
  'core/create-page.test.js',
  'core/cross-version-import.test.js',
  'core/datagrid-cell-move.test.js',
  'core/datagrid-column-refs.test.js',
  'core/datagrid/grid-input.test.js',
  'core/datagrid/grid-view.test.js',
  'core/datagrid-formula-capability.test.js',
  'core/datagrid-header-xss.test.js',
  'core/datagrid-import-text.test.js',
  'core/datagrid-locked-columns.test.js',
  'core/datagrid-paste.test.js',
  'core/datagrid-readonly.test.js',
  'core/datagrid-roles-grid.test.js',
  'core/datagrid-set-formula.test.js',
  'core/datagrid-sort.test.js',
  'core/datagrid-dialogs.test.js',
  'core/context-language.test.js',
  'core/dom.test.js',
  'core/exporter-run.test.js',
  'core/table-to-svg.test.js',
  'core/field-directive.test.js',
  'core/field-errors.test.js',
  'core/file-drop-directive.test.js',
  'core/fit-directive.test.js',
  'core/command-directives.test.js',
  'core/async-task-directives.test.js',
  'core/choice-group.test.js',
  'core/flowchart-view-autosize.test.js',
  'core/help-renderer.test.js',
  'core/html-utils.test.js',
  'core/i18n-module-texts.test.js',
  'core/module-resources.test.js',
  'core/icon.test.js',
  // createModule zieht Alpine CSP herein, das beim Import MutationObserver anfasst.
  'core/instances-derived-t.test.js',
  'core/markdown-parser.test.js',
  'core/notify.test.js',
  'core/readonly-lock.test.js',
  'core/references-renderer-dom.test.js',
  'core/spacing-tokens.test.js',
  'core/stats-panel.test.js',
  'core/state-manager-idb.test.js',
  'core/storage/local-adapter-idb.test.js',
  'core/template-module-route.test.js',
  'core/template-module-descriptor.test.js',
  'core/interaction/announce.test.js',
  'core/flowchart/chain-gesture.test.js',
  'core/interaction/keyboard.test.js',
  'core/interaction/pointer.test.js',
  'core/interaction/reorder.test.js',
  'core/template-module-schema.test.js',
  'core/template-module-async-task.test.js',
  'core/template-module-derived.test.js',
  'core/template-module-table.test.js',
  'core/template-module-table-persist.test.js',
  'core/template-module-view.test.js',
  'core/template-module-history.test.js',
  'modules/worksheet-view.test.js',
  'core/template-tile-chart.test.js',
  'core/template-module-exports.test.js',
  'core/template-module-gestures.test.js',
  'core/template-module-num.test.js',
  'core/template-module.test.js',
  'core/value-channel.test.js',
  'core/widget-directive.test.js',
  'core/worksheet-data.test.js',
  'core/source.test.js',
  'core/worksheet-pool.test.js',
  'core/worksheet-preload.test.js',
  'core/workspace-detached.test.js',
  'dialogs/scenario-confirm-data.test.js',
  // Zieht über activity-flowchart.js Alpine CSP herein, das beim Import
  // MutationObserver anfasst. Läuft unverändert im Browser-Runner
  // (tests/runner.html) — dort ist die Suite seit jeher registriert.
  'modules/activity-flowchart.test.js',
  'modules/attribute-control-chart-view.test.js',
  // Ziehen über js/widgets/registry.js das Widget datagrid (F1.14) und damit
  // Alpine CSP herein, das beim Import MutationObserver anfasst. Laufen im
  // Browser-Runner (tests/runner.html).
  'modules/chart-suggestion-charts.test.js',
  'modules/chart-suggestion-panels.test.js',
  'modules/contour-plot/viewmodel.test.js',
  'modules/dashboard-tiles.test.js',
  'modules/dmaic-calendar-example.test.js',
  'modules/dmaic-calendar-todos-view.test.js',
  'modules/chart-example-worksheet-wait.test.js',
  'modules/histogram-view.test.js',
  'modules/hypothesis-test-view.test.js',
  'modules/msa-typ1-view.test.js',
  'modules/msa-typ6-view.test.js',
  'modules/msa-typ4-view.test.js',
  'modules/msa-typ5-view.test.js',
  'modules/xy-plot-view.test.js',
  'modules/individual-value-plot-view.test.js',
  'modules/mosaic-view.test.js',
  'modules/pie-chart-view.test.js',
  'modules/pareto-view.test.js',
  'modules/bar-view.test.js',
  'modules/boxplot-view.test.js',
  'modules/probability-plot-view.test.js',
  'modules/outlier-test-view.test.js',
  'modules/distribution-fit-view.test.js',
  'modules/run-chart-view.test.js',
  'modules/fmea/view.test.js',
  'modules/gage-run-chart-view.test.js',
  'modules/transformed-imr-chart-view.test.js',
  'modules/multivariate-control-chart-view.test.js',
  'modules/sample-size-view.test.js',
  'modules/attribute-test-view.test.js',
  'modules/correlation-view.test.js',
  'modules/kano/view.test.js',
  'modules/time-weighted-chart-view.test.js',
  'modules/rare-event-chart-view.test.js',
  'modules/short-run-chart-view.test.js',
  'modules/control-chart-view.test.js',
  'modules/triz-ifr-view.test.js',
  'modules/triz-evolution-trends-view.test.js',
  'modules/triz-resources-view.test.js',
  'modules/triz-physical-contradiction-view.test.js',
  'modules/triz-contradiction-matrix-view.test.js',
  'modules/triz-9-windows-view.test.js',
  'modules/triz-sufield-view.test.js',
  'modules/ce-matrix-view.test.js',
  'modules/raci-matrix-view.test.js',
  'modules/stakeholder-analysis-view.test.js',
  'modules/todo-view.test.js',
  'modules/pairwise-comparison-view.test.js',
  'modules/random-generator-view.test.js',
  'modules/data-transformation-view.test.js',
  'modules/model-data-generator-view.test.js',
  'modules/calculator-view.test.js',
  'modules/unit-converter-view.test.js',
  'modules/doe-advisor-view.test.js',
  'modules/five-why-view.test.js',
  'modules/lessons-learned-view.test.js',
  'modules/voc-ctx-tree-view.test.js',
  'modules/heatmap-view.test.js',
  'modules/process-capability-view.test.js',
  'modules/data-import/viewmodel.test.js',
  'modules/doe-planner/tasks-view.test.js',
  'modules/doe-planner/factors-view.test.js',
  'modules/doe-planner/design-view.test.js',
  'modules/doe-planner/optimal-view.test.js',
  'modules/doe-planner/evaluation-view.test.js',
  'modules/doe-planner/runs-view.test.js',
  'modules/doe-planner/analysis-view.test.js',
  'modules/doe-planner/evop-view.test.js',
  'modules/opportunity-flowchart/viewmodel.test.js',
  'modules/deployment-flowchart/viewmodel.test.js',
  'modules/survey-builder/draft-view.test.js',
  'modules/survey-builder/recipients-view.test.js',
  'modules/survey-builder/results-view.test.js',
  'modules/survey-builder/report-view.test.js',
  'modules/survey-builder/handover-view.test.js',
  'modules/resampling-view.test.js',
  'modules/ishikawa/gestures.test.js',
  'modules/project-charter/gestures.test.js',
  'modules/project-charter/export.test.js',
  'modules/project-charter/view.test.js',
  'modules/project-charter/org-view.test.js',
  'modules/triz-function-analysis-view.test.js',
  'modules/ishikawa/view.test.js',
  'modules/ishikawa/causes-view.test.js',
  'modules/ishikawa/snapshots-view.test.js',
  'modules/ishikawa/experiments-view.test.js',
  'modules/process-map-export.test.js',
  'core/rich-text.test.js',
  'core/rich-text-directive.test.js',
  'modules/survey-runner-dom.test.js',
  'core/zeg-sheet-stack.test.js',
  'pages/cycle.test.js',
  'pages/settings.test.js',
  'pages/tile-render.test.js',
  'pages/tile-settings-form.test.js',
  'pages/training.test.js',
  'startup/cross-version-prompt.test.js',
  'startup/example-deeplink.test.js',
  'ui/column-picker-filter.test.js',
  'ui/column-picker-sync-value.test.js',
  'ui/column-picker-readiness.test.js',
  'ui/dashboard-grid-settings.test.js',
  'ui/dataset-picker-help.test.js',
  'ui/dataset-picker-extension.test.js',
  'ui/dmaic-tiles-can-add.test.js',
  'ui/dialog-progress.test.js',
  'ui/dialog.test.js',
  'ui/dmaic-tiles-rebuild.test.js',
  'core/tablist.test.js',
  'frame/bug-reporter/capture-dom.test.js',
  'ui/help-panel-references.test.js',
  'ui/help-panel-videos.test.js',
  'ui/layout-primitives.test.js',
  'ui/split-layout.test.js',
  'ui/workspace-action-help.test.js',
  'ui/workspace-history.test.js',
  'core/datagrid/datagrid-history-group.test.js',
  'core/datagrid/datagrid-keyboard.test.js',
  'ui/workspace-action-command.test.js',
  'ui/workspace-context.test.js',
  'ui/workspace-instance-ready.test.js',
  'ui/workspace-phase-memory.test.js',
  'ui/workspace-reset.test.js',
  'widgets/algo-lab-link.test.js',
  'widgets/chart-mount.test.js',
  'widgets/column-picker-mount.test.js',
  'widgets/datagrid-widget.test.js',
  'widgets/dataset-picker.test.js',
  'widgets/histogram-chart.test.js',
  'widgets/rich-text.test.js',
  'widgets/scatter-chart.test.js',
  'widgets/stats-table.test.js',
]);

/** Recursively collect every `*.test.js` file under `dir`. */
async function collectTestFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await collectTestFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
      out.push(full);
    }
  }
  return out;
}

const filter = process.argv[2] ?? '';
const all = (await collectTestFiles(TESTS_DIR)).sort();

// A file in SKIP must run in the browser bridge instead, or it runs nowhere.
const skipProblems = checkSkipList({
  skip: SKIP,
  browserFiles: parseRunnerFiles(await readFile(join(TESTS_DIR, 'runner.html'), 'utf8')),
  testFiles: all.map((f) => relative(TESTS_DIR, f)),
});
if (skipProblems.length) {
  console.error('\x1b[31m✗ SKIP list out of step with tests/runner.html:\x1b[0m');
  for (const p of skipProblems) console.error(`  ${p}`);
  process.exit(1);
}

let skipped = 0;
const files = all.filter((f) => {
  const rel = relative(TESTS_DIR, f);
  if (SKIP.has(rel)) { skipped++; return false; }
  return filter ? rel.includes(filter) : true;
});

if (files.length === 0) {
  console.error(`No test files found${filter ? ` matching "${filter}"` : ''}.`);
  process.exit(1);
}

// Importing a test file registers its suite()/test() calls in the shared
// registry inside test-utils.js.
const importErrors = [];
for (const file of files) {
  try {
    await import(pathToFileURL(file).href);
  } catch (err) {
    importErrors.push({ file: relative(TESTS_DIR, file), error: err });
  }
}

const { runAll } = await import('./test-utils.js');
const results = await runAll();

// ─── Report ──────────────────────────────────────────────────────────────────
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

for (const suite of results.suites) {
  if (suite.failed === 0) continue;
  console.log(`\n${RED}✗ ${suite.name}${RESET}`);
  for (const t of suite.tests) {
    if (t.status !== 'failed') continue;
    console.log(`  ${RED}✗${RESET} ${t.name}`);
    console.log(`    ${DIM}${t.error}${RESET}`);
  }
}

for (const { file, error } of importErrors) {
  console.log(`\n${RED}✗ failed to import ${file}${RESET}`);
  console.log(`  ${DIM}${error.message}${RESET}`);
}

const failedAny = results.failed > 0 || importErrors.length > 0;
console.log(`\n${failedAny ? RED : GREEN}${formatSummary({
  passed: results.passed, failed: results.failed, skipped: results.skipped, todo: results.todo,
  suites: results.suites.length, files: files.length, domFiles: skipped, importFailures: importErrors.length,
})}${RESET}`);

process.exit(failedAny ? 1 : 0);
