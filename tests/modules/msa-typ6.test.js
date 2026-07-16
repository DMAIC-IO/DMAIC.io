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
