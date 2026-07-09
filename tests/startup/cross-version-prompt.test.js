/**
 * Tests for js/startup/cross-version-prompt.js (shouldRun guard).
 *
 * findOtherVersions() reads sibling-version localStorage keys; in the test
 * environment none exist by default, so it returns [] in the clean env.
 *
 * To exercise the dismissed-flag and fresh-install branches we seed a
 * "v0.8" sibling version by writing:
 *   localStorage.setItem('dmike_v0.8_projects', JSON.stringify([{id:'p-old'}]))
 * — the exact key that findOtherVersions() counts projects from.
 *
 * Full run() flow is covered by the cross-version E2E spec.
 */
import { suite, test, assertEqual, assertTrue, afterEach } from '../test-utils.js';
import crossVersionPrompt, { CROSS_VERSION_DISMISSED_KEY } from '../../js/startup/cross-version-prompt.js';

// A sibling-version key that makes findOtherVersions() return a non-empty list.
const SIBLING_PROJECTS_KEY = 'dmike_v0.8_projects';
const SIBLING_PROJECTS_VAL = JSON.stringify([{ id: 'p-old' }]);

function makeCtx(projects = [{ id: 'p1' }], phases = {}) {
  return {
    stateManager: {
      getProjects: () => projects,
      get: (path) => (path === 'phases' ? phases : undefined),
    },
    modal: {}, notify: () => {}, i18n: { t: (k) => k }, eventBus: { on() {}, off() {}, emit() {} },
  };
}

suite('startup/cross-version-prompt', () => {
  afterEach(() => {
    localStorage.removeItem(CROSS_VERSION_DISMISSED_KEY);
    localStorage.removeItem(SIBLING_PROJECTS_KEY);
  });

  test('exported dismissed key is version-scoped', () => {
    assertTrue(/^dmike_v\d+\.\d+_crossVersionPromptDismissed$/.test(CROSS_VERSION_DISMISSED_KEY));
  });

  // ── no sibling data ──────────────────────────────────────────────────────────

  test('shouldRun is false when no other versions exist', () => {
    // Clean test env: findOtherVersions() finds no sibling-version storage.
    assertEqual(crossVersionPrompt.shouldRun(makeCtx()), false);
  });

  // ── sibling present → dismissed flag branch ──────────────────────────────────

  test('shouldRun is false when dismissed flag set (others present, short-circuits before fresh-install check)', () => {
    // Seed a sibling version so the first guard passes.
    localStorage.setItem(SIBLING_PROJECTS_KEY, SIBLING_PROJECTS_VAL);
    // Now set the dismissed flag — shouldRun must return false at the second guard.
    localStorage.setItem(CROSS_VERSION_DISMISSED_KEY, '1');
    assertEqual(crossVersionPrompt.shouldRun(makeCtx()), false);
  });

  test('shouldRun is true when others present, not dismissed, and fresh install (1 project, all phases empty)', () => {
    localStorage.setItem(SIBLING_PROJECTS_KEY, SIBLING_PROJECTS_VAL);
    // No dismissed flag, 1 project, phases all empty → fresh install.
    const ctx = makeCtx([{ id: 'p1' }], { define: [], measure: [] });
    assertEqual(crossVersionPrompt.shouldRun(ctx), true);
  });

  // ── sibling present → fresh-install branch ───────────────────────────────────

  test('shouldRun is false when others present, not dismissed, but non-fresh (more than 1 project)', () => {
    localStorage.setItem(SIBLING_PROJECTS_KEY, SIBLING_PROJECTS_VAL);
    // Two projects → _isFreshInstall returns false.
    const ctx = makeCtx([{ id: 'p1' }, { id: 'p2' }], {});
    assertEqual(crossVersionPrompt.shouldRun(ctx), false);
  });

  test('shouldRun is false when others present, not dismissed, but non-fresh (phase has instances)', () => {
    localStorage.setItem(SIBLING_PROJECTS_KEY, SIBLING_PROJECTS_VAL);
    // 1 project but define phase has a module instance → not fresh.
    const ctx = makeCtx([{ id: 'p1' }], { define: [{ id: 'inst-1', moduleId: 'sipoc' }] });
    assertEqual(crossVersionPrompt.shouldRun(ctx), false);
  });

  test('id is cross-version-prompt', () => {
    assertEqual(crossVersionPrompt.id, 'cross-version-prompt');
  });
});
