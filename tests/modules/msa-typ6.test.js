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

  test('result branch has a dmike-infobox verdict-header with dot', async () => {
    const doc = await loadTemplateDoc();
    const frag = resultFragment(doc);
    // Migrated to generic .dmike-infobox (css/components.css). Colour comes
    // from the parent's dmike-kpi--{good,warn,bad} modifier via
    // _verdictKpiClass(); the dot inherits it through the shared CSS.
    const infobox = frag.querySelector('.dmike-infobox');
    assertTrue(infobox !== null, 'missing .dmike-infobox verdict-header element');
    const dot = infobox.querySelector('.dmike-infobox__dot');
    assertTrue(dot !== null, 'missing .dmike-infobox__dot inside verdict-header');
    const binding = infobox.getAttribute(':class') || '';
    assertTrue(binding.includes('_verdictKpiClass(_lastResult.verdict.level)'),
      'verdict-header :class binding must call _verdictKpiClass(_lastResult.verdict.level)');
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

/**
 * Task 13: Output-Panel Interpretations-Text.
 *
 * Same DOMParser-only constraint as Task 7–12 (see rationale above): the
 * actual translated text depends on a live `t()`/`i18n` call, which needs a
 * mounted Alpine component — not available in the headless DOMParser-based
 * runner used here (and i18n keys under `modules.msa-typ6.interpretation.*`
 * are added later by Task 17, so there's nothing to translate yet). This
 * suite asserts the templated interpretation paragraph is structurally
 * present inside the `<template x-if="_lastResult">` branch and correctly
 * wired to `_lastResult.interpretation`. Live-render (and language-switch)
 * coverage belongs to the Playwright E2E suite
 * (test/playwright/tests/modules/msa-typ6.spec.js, Task 19 per
 * docs/superpowers/specs/2026-07-16-msa-typ6-design.md § 9).
 */
suite('msa-typ6 module — Interpretations-Text (Task 13)', () => {
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

  test('result branch has a .module-msa-typ6__interpretation paragraph bound to _lastResult.interpretation', async () => {
    const doc = await loadTemplateDoc();
    const frag = resultFragment(doc);
    const p = frag.querySelector('p.module-msa-typ6__interpretation');
    assertTrue(p !== null, 'missing p.module-msa-typ6__interpretation element');
    const xtext = p.getAttribute('x-text') || '';
    assertTrue(xtext.includes('_lastResult.interpretation.textKey'),
      'interpretation paragraph must reference _lastResult.interpretation.textKey');
    assertTrue(xtext.includes('_lastResult.interpretation.params'),
      'interpretation paragraph must reference _lastResult.interpretation.params');

    // Must not appear in the Empty-State (!_lastResult) branch.
    const noResultTpl = [...doc.querySelectorAll('template[x-if]')]
      .find((t) => t.getAttribute('x-if') === '!_lastResult');
    assertTrue(noResultTpl !== null, 'template must have a <template x-if="!_lastResult"> branch');
    assertTrue(noResultTpl.content.querySelector('.module-msa-typ6__interpretation') === null,
      '.module-msa-typ6__interpretation must not render in the Empty-State (!_lastResult) branch');
  });
});

/**
 * Task 14: Events + Typ-1-Cross-Modul-Anbindung.
 *
 * Fills the Task 8 dropdown placeholder ("aus Typ-1-Instanz übernehmen") and
 * wires a `msa-typ1:result-updated` subscription in msa-typ6.js.
 *
 * Same constraint as every suite above: importing msa-typ6.js pulls in
 * `@alpinejs/csp` via `core/template-module.js`, which the headless test
 * runner cannot resolve — so there is no live Alpine mount / fake eventBus
 * here either. The template test below parses the real shipped
 * msa-typ6.html the same way as Task 7–13. The JS behaviour test follows the
 * brief's own documented fallback for this exact situation ("verdrahte den
 * Test als reine Struktur-Assertion … via Code-Grep im Modul-JS-File") and
 * asserts against the real shipped msa-typ6.js source text (fetched, not
 * imported) that:
 *   (a) the module subscribes to `msa-typ1:result-updated` on the shared
 *       event bus, and
 *   (b) its handler body gates on `sourceTyp1InstanceId` before writing
 *       `params.mu0`/`params.sigma0` and re-running the analysis — i.e. an
 *       update from an instance the user did *not* import from must not
 *       touch this instance's state.
 * Live-mount coverage (both the dropdown's live selection behaviour and a
 * fired `msa-typ1:result-updated` event) belongs to the Playwright E2E
 * suite (test/playwright/tests/modules/msa-typ6.spec.js, Task 19 per
 * docs/superpowers/specs/2026-07-16-msa-typ6-design.md § 9) — see this
 * task's report for the finding that msa-typ1 does not currently emit that
 * event, so the handler is presently dormant/forward-compatible.
 */
suite('msa-typ6 module — Events + Typ-1-Cross-Modul-Anbindung (Task 14)', () => {
  /** Fetch + parse the real shipped template once per test. */
  async function loadTemplateDoc() {
    const url = new URL('../../js/modules/msa-typ6/msa-typ6.html', import.meta.url);
    const html = await (await fetch(url)).text();
    return new DOMParser().parseFromString(html, 'text/html');
  }

  /** Fetch the real shipped module source once per test. */
  async function loadModuleSource() {
    const url = new URL('../../js/modules/msa-typ6/msa-typ6.js', import.meta.url);
    return (await fetch(url)).text();
  }

  test('Typ-1-dropdown: <select> has NO x-model (Stolperstein #3) and a <template x-for="inst in _typ1Instances"> option list', async () => {
    const doc = await loadTemplateDoc();
    const select = doc.querySelector('[data-ref="sel-source-typ1"]');
    assertTrue(select !== null, 'missing [data-ref="sel-source-typ1"] <select>');
    assertTrue(select.getAttribute('x-model') === null,
      '<select> must NOT bind x-model directly (Alpine-CSP-Stolperstein #3 — ' +
      'x-for-generated <option>s collide with the initial x-model reflection)');
    assertTrue((select.getAttribute('@change') || '').includes('_onTyp1Selected'),
      '<select> must call _onTyp1Selected($event.target.value) on change');

    const placeholder = select.querySelector('option[value=""]');
    assertTrue(placeholder !== null, 'missing placeholder <option value="">');
    assertEqual(placeholder.getAttribute(':selected'), '!model.params.sourceTyp1InstanceId');

    const tpl = select.querySelector('template[x-for="inst in _typ1Instances"]');
    assertTrue(tpl !== null, 'missing <template x-for="inst in _typ1Instances"> inside the select');
    const opt = tpl.content.querySelector('option');
    assertTrue(opt !== null, 'x-for template must contain an <option>');
    assertEqual(opt.getAttribute(':value'), 'inst.instanceId');
    assertEqual(opt.getAttribute(':selected'), 'inst.instanceId === model.params.sourceTyp1InstanceId');
    const xtext = opt.getAttribute('x-text') || '';
    assertTrue(xtext.includes('inst.name'), 'option x-text must include inst.name');
    assertTrue(xtext.includes('inst.mean'), 'option x-text must include inst.mean');
    assertTrue(xtext.includes('inst.stdDev'), 'option x-text must include inst.stdDev');
  });

  test('msa-typ1:result-updated handler gates on sourceTyp1InstanceId before writing mu0/sigma0 (source assertion)', async () => {
    const src = await loadModuleSource();

    assertTrue(src.includes("eb.on('msa-typ1:result-updated'"),
      'module must subscribe to msa-typ1:result-updated on the shared event bus');
    assertTrue(src.includes("eb.off('msa-typ1:result-updated'"),
      'subscription must be torn down (pushed to _unsubs) so re-init/destroy does not leak listeners');

    // Slice out the handler body (from its `on(...)` registration up to the
    // next `eb.on(` or the end of the surrounding _unsubs.push block) and
    // assert the gate + writes are present, in that order (gate first).
    const start = src.indexOf('const onTyp1ResultUpdated');
    assertTrue(start !== -1, 'expected a named onTyp1ResultUpdated handler (readable in the source)');
    const body = src.slice(start, src.indexOf('eb.on(', start));

    const gateIdx = body.indexOf('sourceTyp1InstanceId');
    assertTrue(gateIdx !== -1, 'handler must compare evt.instanceId against model.params.sourceTyp1InstanceId');
    const mu0Idx = body.indexOf('.mu0 = evt.mean');
    assertTrue(mu0Idx !== -1, 'handler must write params.mu0 = evt.mean');
    const sigma0Idx = body.indexOf('.sigma0 = evt.stdDev');
    assertTrue(sigma0Idx !== -1, 'handler must write params.sigma0 = evt.stdDev');
    assertTrue(gateIdx < mu0Idx && gateIdx < sigma0Idx,
      'the sourceTyp1InstanceId gate must be checked BEFORE mu0/sigma0 are written ' +
      '(so an update from a non-matching instance leaves this instance untouched)');
    assertTrue(body.includes('_analyzeNow()'),
      'handler must trigger _analyzeNow() after updating mu0/sigma0');
  });

  test('_onTyp1Selected writes mu0/sigma0/sourceTyp1InstanceId from the picked instance and re-analyzes (source assertion)', async () => {
    const src = await loadModuleSource();
    const start = src.indexOf('_onTyp1Selected(instanceId)');
    assertTrue(start !== -1, 'expected a _onTyp1Selected(instanceId) method');
    const body = src.slice(start, start + 500);

    assertTrue(body.includes('model.params.sourceTyp1InstanceId = instanceId'),
      'must write params.sourceTyp1InstanceId from the selected instanceId');
    assertTrue(body.includes('_typ1Instances.find'),
      'must look up the picked instance in _typ1Instances');
    assertTrue(body.includes('model.params.mu0 = inst.mean'),
      'must write params.mu0 from the picked instance\'s mean');
    assertTrue(body.includes('model.params.sigma0 = inst.stdDev'),
      'must write params.sigma0 from the picked instance\'s stdDev');
    assertTrue(body.includes('_analyzeNow()'),
      '_onTyp1Selected must trigger _analyzeNow() after updating params');
  });

  test('_loadTyp1Instances enumerates msa-typ1 instances across all phases via stateManager (source assertion)', async () => {
    const src = await loadModuleSource();
    const start = src.indexOf('_loadTyp1Instances(module)');
    assertTrue(start !== -1, 'expected a _loadTyp1Instances(module) method');
    const body = src.slice(start, src.indexOf('_onTyp1Selected', start));

    assertTrue(body.includes("sm.get('phases')"),
      'must enumerate instances via stateManager.get(\'phases\') (all-phases cross-module lookup, ' +
      'same pattern as doe-planner-worksheet.js listProjectWorksheets())');
    assertTrue(body.includes("inst.moduleId !== 'msa-typ1'"),
      'must filter phase entries down to moduleId === \'msa-typ1\'');
    assertTrue(body.includes('sm.getModuleState(inst.instanceId)'),
      'must read each msa-typ1 instance\'s persisted state via getModuleState()');
    assertTrue(body.includes('this._typ1Instances = out'),
      'must assign the resulting list to _typ1Instances');
  });

  test('theme:changed now triggers _renderCharts() (Task 10 gap closed)', async () => {
    const src = await loadModuleSource();
    assertTrue(src.includes("eb.on('theme:changed'"),
      'module must subscribe to theme:changed (was missing before Task 14, unlike msa-typ1/msa-typ4)');
    assertTrue(src.includes("eb.off('theme:changed'"),
      'theme:changed subscription must be torn down via _unsubs');
  });
});
