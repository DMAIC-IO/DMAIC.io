/**
 * D.Mike — MSA Typ 6 Module Tests (msa-typ6.test.js)
 *
 * Task 7 of the msa-typ6 plan: verify the module renders the Empty-State
 * when no data-source columns are chosen yet.
 *
 * Importing the full module shell (msa-typ6.js) here would transitively pull
 * in `js/core/template-module.js` → `@alpinejs/csp`, which the headless /
 * browser unit-test runner (tests/runner.html) cannot resolve (no bundler,
 * no import map — bare npm specifiers only resolve in the esbuild-bundled
 * app.min.js used by the real app / Playwright E2E suite). Sibling
 * Alpine-CSP-migrated modules follow the same model-only convention here
 * (see e.g. response-optimization.test.js, xy-plot.test.js,
 * probability-plot.test.js) and defer full init()/destroy() shell coverage
 * to the Playwright E2E suite (test/playwright/tests/modules/msa-typ6.spec.js,
 * a later task per docs/superpowers/specs/2026-07-16-msa-typ6-design.md § 9).
 *
 * So this file verifies the two things Task 7 actually ships that ARE
 * verifiable at this level without a live Alpine mount:
 *   1. The Model's default state has no data source selected (the condition
 *      that must produce the Empty-State).
 *   2. The real msa-typ6.html template renders `.module-msa-typ6__empty`
 *      whenever `_lastResult` is falsy, and only the result branch
 *      (Task 9–13 placeholder) whenever it is truthy — i.e. the Empty-State
 *      markup this task ships is structurally present and correctly gated.
 */

import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { State } from '../../js/modules/msa-typ6/msa-typ6-model.js';

suite('msa-typ6 module — Skelett (Task 7)', () => {
  test('Model default state has no data source selected (drives the Empty-State)', () => {
    const s = new State();
    assertEqual(s.columns.timestamp, null);
    assertEqual(s.columns.value, null);
    assertEqual(s.columns.subgroup, null);
    assertTrue(s.hasContent() === false, 'fresh State must report hasContent() === false');
  });

  test('init: empty state visible without columns (template structure)', async () => {
    // Parse the actual shipped template (not a duplicate/inline copy) so this
    // test breaks if the real file's Empty-State markup regresses.
    const url = new URL('../../js/modules/msa-typ6/msa-typ6.html', import.meta.url);
    const html = await (await fetch(url)).text();

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const root = doc.querySelector('.module-msa-typ6');
    assertTrue(root !== null, 'template must have a .module-msa-typ6 root element');

    // The "no result" branch: <template x-if="!_lastResult"> must contain the
    // empty-state element used by the view when no analysis has run yet.
    const noResultTpl = [...doc.querySelectorAll('template[x-if]')]
      .find((t) => t.getAttribute('x-if') === '!_lastResult');
    assertTrue(noResultTpl !== null, 'template must have a <template x-if="!_lastResult"> branch');
    const empty = noResultTpl.content.querySelector('.module-msa-typ6__empty');
    assertTrue(empty !== null, 'empty state (.module-msa-typ6__empty) not rendered in the !_lastResult branch');

    // The "has result" branch exists (Task 9–13 placeholder) and is gated by
    // the complementary condition, so the two branches never render together.
    const resultTpl = [...doc.querySelectorAll('template[x-if]')]
      .find((t) => t.getAttribute('x-if') === '_lastResult');
    assertTrue(resultTpl !== null, 'template must have a <template x-if="_lastResult"> branch');
  });
});

/**
 * Task 8: Input-Panel Controls (Kartentyp, ColumnPicker, Grenzen-Modus,
 * Nelson-Regeln, α) + debounced Auto-Run.
 *
 * Same constraint as Task 7's tests: importing msa-typ6.js pulls in
 * `@alpinejs/csp` via `core/template-module.js`, which the headless /
 * browser unit-test runner (tests/runner.html) cannot resolve (see the
 * detailed rationale in the "Skelett (Task 7)" suite above). So — like the
 * brief's own Step 4 note acknowledges — the two Alpine-mount scenarios
 * ("chartType radio toggles subgroup picker visibility" and "limitsMode
 * radio toggles baselineK vs mu0/sigma0 blocks") are verified here as
 * equivalent DOMParser structure checks against the real, shipped template
 * instead of a live `mod.init()` mount: the markup that *would* drive that
 * runtime behaviour (the two-value radio groups + the `x-show`-gated
 * blocks) is asserted to exist and be wired to the right expressions.
 * Full live-toggle coverage belongs to the Playwright E2E suite
 * (test/playwright/tests/modules/msa-typ6.spec.js, a later task).
 */
suite('msa-typ6 module — Input-Panel Controls (Task 8)', () => {
  /** Fetch + parse the real shipped template once per test. */
  async function loadTemplateDoc() {
    const url = new URL('../../js/modules/msa-typ6/msa-typ6.html', import.meta.url);
    const html = await (await fetch(url)).text();
    return new DOMParser().parseFromString(html, 'text/html');
  }

  test('template has two chartType radio inputs', async () => {
    const doc = await loadTemplateDoc();
    const radios = doc.querySelectorAll('input[type="radio"][name*="chartType"]');
    assertEqual(radios.length, 2, 'expected exactly two chartType radio inputs');
    const values = [...radios].map((r) => r.getAttribute('value')).sort();
    assertEqual(values[0], 'i-mr');
    assertEqual(values[1], 'xbar-r');
  });

  test('template has three ColumnPicker hosts (timestamp/value/subgroup)', async () => {
    const doc = await loadTemplateDoc();
    assertTrue(doc.querySelector('[data-ref="col-picker-timestamp"]') !== null,
      'missing col-picker-timestamp host');
    assertTrue(doc.querySelector('[data-ref="col-picker-value"]') !== null,
      'missing col-picker-value host');
    assertTrue(doc.querySelector('[data-ref="col-picker-subgroup"]') !== null,
      'missing col-picker-subgroup host');
  });

  test('template has eight Nelson-rule checkboxes (values 1..8)', async () => {
    const doc = await loadTemplateDoc();
    for (let id = 1; id <= 8; id++) {
      const cb = doc.querySelector(`input[type="checkbox"][value="${id}"]`);
      assertTrue(cb !== null, `missing Nelson-rule checkbox for rule ${id}`);
      assertEqual(cb.getAttribute('x-model'), 'model.params.enabledRules');
    }
    assertEqual(doc.querySelectorAll('input[type="checkbox"][x-model="model.params.enabledRules"]').length, 8);
  });

  test('template has limitsMode-dependent blocks (baselineK vs mu0/sigma0)', async () => {
    const doc = await loadTemplateDoc();
    const fromStudyBlock = [...doc.querySelectorAll('[x-show]')]
      .find((el) => el.getAttribute('x-show') === "model.params.limitsMode === 'from-study'");
    assertTrue(fromStudyBlock !== null, 'missing x-show block for limitsMode === \'from-study\'');
    assertTrue(fromStudyBlock.querySelector('[data-ref="inp-baseline-k"]') !== null,
      'from-study block must contain the baselineK input');

    const givenBlock = [...doc.querySelectorAll('[x-show]')]
      .find((el) => el.getAttribute('x-show') === "model.params.limitsMode === 'given'");
    assertTrue(givenBlock !== null, 'missing x-show block for limitsMode === \'given\'');
    assertTrue(givenBlock.querySelector('[data-ref="inp-mu0"]') !== null,
      'given block must contain the mu0 input');
    assertTrue(givenBlock.querySelector('[data-ref="inp-sigma0"]') !== null,
      'given block must contain the sigma0 input');
  });
});

/**
 * Task 9: Output-Panel Verdikt-Header + KPI-Strip.
 *
 * Same DOMParser-only constraint as Task 7/8 (see rationale above) — these
 * tests assert against the real, shipped template that the markup Task 9
 * ships is structurally present inside the `<template x-if="_lastResult">`
 * branch, without a live Alpine mount.
 */
suite('msa-typ6 module — Output-Panel Verdikt-Header + KPI-Strip (Task 9)', () => {
  /** Fetch + parse the real shipped template once per test. */
  async function loadTemplateDoc() {
    const url = new URL('../../js/modules/msa-typ6/msa-typ6.html', import.meta.url);
    const html = await (await fetch(url)).text();
    return new DOMParser().parseFromString(html, 'text/html');
  }

  /** @param {Document} doc @returns {DocumentFragment} the `_lastResult` result branch's content. */
  function resultFragment(doc) {
    const tpl = [...doc.querySelectorAll('template[x-if]')]
      .find((t) => t.getAttribute('x-if') === '_lastResult');
    assertTrue(tpl !== null, 'template must have a <template x-if="_lastResult"> branch');
    return tpl.content;
  }

  test('result branch has a verdict-dot element', async () => {
    const doc = await loadTemplateDoc();
    const frag = resultFragment(doc);
    const dot = frag.querySelector('.module-msa-typ6__verdict-dot');
    assertTrue(dot !== null, 'missing .module-msa-typ6__verdict-dot element');
    // Colour is driven dynamically via :class from verdict.level — assert the
    // binding is wired to the expected good/warn/bad ternary, not a literal.
    const binding = dot.getAttribute(':class') || '';
    assertTrue(binding.includes('module-msa-typ6__verdict-dot--'),
      'verdict-dot :class binding must reference the --good/--warn/--bad modifiers');
    assertTrue(binding.includes("_lastResult.verdict.level === 'stable'"),
      'verdict-dot :class binding must branch on verdict.level');
  });

  test('result branch has a KPI strip with at least six KPI tiles', async () => {
    const doc = await loadTemplateDoc();
    const frag = resultFragment(doc);
    const strip = frag.querySelector('.dmike-kpi-strip');
    assertTrue(strip !== null, 'missing .dmike-kpi-strip container');
    const kpis = strip.querySelectorAll('.dmike-kpi');
    assertTrue(kpis.length >= 6, `expected at least 6 .dmike-kpi tiles, got ${kpis.length}`);
  });

  test('result branch renders _lastResult.verdict.level and KPI value bindings', async () => {
    const doc = await loadTemplateDoc();
    const frag = resultFragment(doc);

    // verdict.level is referenced (dot colour + verdict label text). Walk all
    // elements and inspect their attributes directly instead of a CSS
    // attribute-selector for ":class" (the colon needs escaping there and
    // isn't worth the fragility for a plain existence check).
    const levelRefs = [...frag.querySelectorAll('*')].filter((el) =>
      [...el.attributes].some((a) => a.value.includes('_lastResult.verdict.level')));
    assertTrue(levelRefs.length > 0, '_lastResult.verdict.level must be referenced in the result branch');

    // KPI value bindings for the six required metrics.
    const values = [...frag.querySelectorAll('.dmike-kpi-value[x-text]')].map((el) => el.getAttribute('x-text'));
    assertTrue(values.some((v) => v.includes('_lastResult.meta.pointCount')), 'missing pointCount KPI binding');
    assertTrue(values.some((v) => v.includes('_mean(_lastResult.primary.series)')), 'missing mean KPI binding');
    assertTrue(values.some((v) => v.includes('_lastResult.primary.sigma')), 'missing sigma KPI binding');
    assertTrue(values.some((v) => v.includes('_lastResult.verdict.nelsonCount')), 'missing nelsonCount KPI binding');
    assertTrue(values.some((v) => v.includes('_lastResult.drift.slope')), 'missing drift.slope KPI binding');
    assertTrue(values.some((v) => v.includes('_lastResult.drift.pValue')), 'missing drift.pValue KPI binding');
  });
});

/**
 * Task 10: Output-Panel Regelkarten-Charts (primary + secondary).
 *
 * Same DOMParser-only constraint as Task 7–9 (see rationale above): the
 * chart hosts are mounted imperatively via `chartManager.create(host,
 * 'control-chart', …)` from `_renderCharts()`, which needs a live Alpine
 * mount + a real `chartManager` (SVG DOM) — neither is available in the
 * headless DOMParser-based runner used here. So this suite only asserts
 * the two templated chart-host anchors Task 10 ships are structurally
 * present inside the `<template x-if="_lastResult">` branch, wired to the
 * `data-chart-host` selectors `_renderCharts()`/`_whenAnchor()` query for.
 * Live chart-render coverage (two `<svg>` per fixture) belongs to the
 * Playwright E2E suite (test/playwright/tests/modules/msa-typ6.spec.js,
 * Task 19 per docs/superpowers/specs/2026-07-16-msa-typ6-design.md § 9).
 */
suite('msa-typ6 module — Regelkarten-Charts (Task 10)', () => {
  /** Fetch + parse the real shipped template once per test. */
  async function loadTemplateDoc() {
    const url = new URL('../../js/modules/msa-typ6/msa-typ6.html', import.meta.url);
    const html = await (await fetch(url)).text();
    return new DOMParser().parseFromString(html, 'text/html');
  }

  /** @param {Document} doc @returns {DocumentFragment} the `_lastResult` result branch's content. */
  function resultFragment(doc) {
    const tpl = [...doc.querySelectorAll('template[x-if]')]
      .find((t) => t.getAttribute('x-if') === '_lastResult');
    assertTrue(tpl !== null, 'template must have a <template x-if="_lastResult"> branch');
    return tpl.content;
  }

  test('result branch has a primary chart host (.module-msa-typ6__chart-host, x-ref="chartPrimary")', async () => {
    const doc = await loadTemplateDoc();
    const frag = resultFragment(doc);
    const host = frag.querySelector('.module-msa-typ6__chart-host[x-ref="chartPrimary"]');
    assertTrue(host !== null, 'missing .module-msa-typ6__chart-host[x-ref="chartPrimary"] element');
    assertEqual(host.getAttribute('data-chart-host'), 'primary',
      'primary chart host must carry data-chart-host="primary" (the selector _renderCharts() queries for)');
  });

  test('result branch has a secondary chart host (.module-msa-typ6__chart-host, x-ref="chartSecondary")', async () => {
    const doc = await loadTemplateDoc();
    const frag = resultFragment(doc);
    const host = frag.querySelector('.module-msa-typ6__chart-host[x-ref="chartSecondary"]');
    assertTrue(host !== null, 'missing .module-msa-typ6__chart-host[x-ref="chartSecondary"] element');
    assertEqual(host.getAttribute('data-chart-host'), 'secondary',
      'secondary chart host must carry data-chart-host="secondary" (the selector _renderCharts() queries for)');
  });
});

/**
 * Task 11: Output-Panel Verletzungs-Tabelle + Chart-Verlinkung.
 *
 * Same DOMParser-only constraint as Task 7–10 (see rationale above): the
 * live click-to-highlight interaction needs a mounted Alpine component (a
 * real click event + reactive `:class` re-evaluation), which the headless
 * DOMParser-based runner used here cannot exercise. So this suite asserts
 * the table + x-for row + click handler Task 11 ships are structurally
 * present and wired to the right expressions. Live click behaviour belongs
 * to the Playwright E2E suite (test/playwright/tests/modules/msa-typ6.spec.js,
 * Task 19 per docs/superpowers/specs/2026-07-16-msa-typ6-design.md § 9).
 */
suite('msa-typ6 module — Verletzungs-Tabelle + Chart-Verlinkung (Task 11)', () => {
  /** Fetch + parse the real shipped template once per test. */
  async function loadTemplateDoc() {
    const url = new URL('../../js/modules/msa-typ6/msa-typ6.html', import.meta.url);
    const html = await (await fetch(url)).text();
    return new DOMParser().parseFromString(html, 'text/html');
  }

  /** @param {Document} doc @returns {DocumentFragment} the `_lastResult` result branch's content. */
  function resultFragment(doc) {
    const tpl = [...doc.querySelectorAll('template[x-if]')]
      .find((t) => t.getAttribute('x-if') === '_lastResult');
    assertTrue(tpl !== null, 'template must have a <template x-if="_lastResult"> branch');
    return tpl.content;
  }

  test('result branch has a .module-msa-typ6__violations table', async () => {
    const doc = await loadTemplateDoc();
    const frag = resultFragment(doc);
    const table = frag.querySelector('table.module-msa-typ6__violations');
    assertTrue(table !== null, 'missing table.module-msa-typ6__violations element');
    assertEqual(table.getAttribute('x-show'), '_lastResult.ruleViolations.length > 0',
      'violations table must be gated by x-show="_lastResult.ruleViolations.length > 0"');
  });

  test('violations table has a <template x-for="v in _lastResult.ruleViolations"> row loop', async () => {
    const doc = await loadTemplateDoc();
    const frag = resultFragment(doc);
    const table = frag.querySelector('table.module-msa-typ6__violations');
    assertTrue(table !== null, 'missing table.module-msa-typ6__violations element');
    const xfor = table.querySelector('template[x-for]');
    assertTrue(xfor !== null, 'violations table must contain a <template x-for="...">');
    assertEqual(xfor.getAttribute('x-for'), 'v in _lastResult.ruleViolations',
      'x-for must iterate _lastResult.ruleViolations as v');
    assertEqual(xfor.getAttribute(':key'), 'v.primaryIndex', 'x-for row must key on v.primaryIndex');
  });

  test('violation row has a @click handler calling _highlight(v.primaryIndex)', async () => {
    const doc = await loadTemplateDoc();
    const frag = resultFragment(doc);
    const table = frag.querySelector('table.module-msa-typ6__violations');
    const xfor = table.querySelector('template[x-for]');
    const row = xfor.content.querySelector('tr.module-msa-typ6__violation-row');
    assertTrue(row !== null, 'missing tr.module-msa-typ6__violation-row inside the x-for template');
    assertEqual(row.getAttribute('@click'), '_highlight(v.primaryIndex)',
      'violation row must call _highlight(v.primaryIndex) on click');
  });
});

/**
 * Task 12: Output-Panel Drift-Analyse-Chart (Scatter + Regressionsgerade)
 * + Formel-Info-Block.
 *
 * Same DOMParser-only constraint as Task 7–11 (see rationale above): the
 * chart itself is mounted imperatively via `chartManager.create(host,
 * 'scatter', …)` from `_renderDriftChart()`, which needs a live Alpine
 * mount + a real `chartManager` (SVG DOM) — neither is available in the
 * headless DOMParser-based runner used here. So this suite asserts the
 * templated chart-host anchor + formula bindings Task 12 ships are
 * structurally present inside the `<template x-if="_lastResult">` branch,
 * gated the same way as the primary/secondary chart hosts and only visible
 * once an analysis has run (never in the Empty-State branch). Live
 * chart-render coverage belongs to the Playwright E2E suite
 * (test/playwright/tests/modules/msa-typ6.spec.js, a later task per
 * docs/superpowers/specs/2026-07-16-msa-typ6-design.md § 9).
 */
suite('msa-typ6 module — Drift-Analyse-Chart (Task 12)', () => {
  /** Fetch + parse the real shipped template once per test. */
  async function loadTemplateDoc() {
    const url = new URL('../../js/modules/msa-typ6/msa-typ6.html', import.meta.url);
    const html = await (await fetch(url)).text();
    return new DOMParser().parseFromString(html, 'text/html');
  }

  /** @param {Document} doc @returns {DocumentFragment} the `_lastResult` result branch's content. */
  function resultFragment(doc) {
    const tpl = [...doc.querySelectorAll('template[x-if]')]
      .find((t) => t.getAttribute('x-if') === '_lastResult');
    assertTrue(tpl !== null, 'template must have a <template x-if="_lastResult"> branch');
    return tpl.content;
  }

  test('result branch has a .module-msa-typ6__drift container', async () => {
    const doc = await loadTemplateDoc();
    const frag = resultFragment(doc);
    const drift = frag.querySelector('.module-msa-typ6__drift');
    assertTrue(drift !== null, 'missing .module-msa-typ6__drift container');

    // Must not appear in the Empty-State (!_lastResult) branch — the two
    // branches are mutually exclusive templates, so this also guards
    // against an accidental duplicate placed outside the result branch.
    const noResultTpl = [...doc.querySelectorAll('template[x-if]')]
      .find((t) => t.getAttribute('x-if') === '!_lastResult');
    assertTrue(noResultTpl !== null, 'template must have a <template x-if="!_lastResult"> branch');
    assertTrue(noResultTpl.content.querySelector('.module-msa-typ6__drift') === null,
      '.module-msa-typ6__drift must not render in the Empty-State (!_lastResult) branch');
  });

  test('drift container has a chart host (x-ref="chartDrift", data-chart-host="drift")', async () => {
    const doc = await loadTemplateDoc();
    const frag = resultFragment(doc);
    const drift = frag.querySelector('.module-msa-typ6__drift');
    assertTrue(drift !== null, 'missing .module-msa-typ6__drift container');
    const host = drift.querySelector('[x-ref="chartDrift"]');
    assertTrue(host !== null, 'missing [x-ref="chartDrift"] chart host');
    assertTrue(host.classList.contains('module-msa-typ6__chart-host'),
      'chartDrift host must carry the shared .module-msa-typ6__chart-host class');
    assertEqual(host.getAttribute('data-chart-host'), 'drift',
      'chartDrift host must carry data-chart-host="drift" (the selector _renderDriftChart() queries for)');
  });

  test('drift container has the regression-formula bindings (intercept, slope)', async () => {
    const doc = await loadTemplateDoc();
    const frag = resultFragment(doc);
    const drift = frag.querySelector('.module-msa-typ6__drift');
    assertTrue(drift !== null, 'missing .module-msa-typ6__drift container');

    const texts = [...drift.querySelectorAll('[x-text]')].map((el) => el.getAttribute('x-text'));
    assertTrue(texts.some((v) => v === '_fmt(_lastResult.drift.intercept, 3)'),
      'missing _fmt(_lastResult.drift.intercept, 3) binding');
    assertTrue(texts.some((v) => v === '_fmt(_lastResult.drift.slope, 4)'),
      'missing _fmt(_lastResult.drift.slope, 4) binding');
    // The formula line also needs both bindings together with slope
    // appearing a second time in the β₁ ± SE stats line — assert the
    // overall count so a future edit can't silently drop one occurrence.
    assertEqual(texts.filter((v) => v === '_fmt(_lastResult.drift.slope, 4)').length, 2,
      'expected drift.slope to be bound twice (equation + β₁ ± SE stats line)');
  });
});
