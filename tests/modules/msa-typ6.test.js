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
