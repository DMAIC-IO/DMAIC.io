/**
 * Integrity tests for the shipped scenario entries in examples/index.json.
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { ExamplesRegistry, parseScenarioItem } from '../../js/core/examples-registry.js';
import { getPhaseIds } from '../../js/core/cycles/cycles.js';

const EXPECTED_SCENARIOS = [
  'scenario-hubschrauber-full', 'scenario-hubschrauber-starter',
  'scenario-pizza-full', 'scenario-pizza-starter',
  'scenario-bolzen-full', 'scenario-bolzen-starter',
  'scenario-triz-band-full', 'scenario-triz-band-starter',
  'scenario-motor-full', 'scenario-motor-starter',
  'scenario-sprit-full', 'scenario-sprit-starter',
];

const EXPECTED_WORKSHEETS = [
  'worksheet-hubschrauber-flyer', 'worksheet-msa-typ1-hubschrauber-flyer',
  'worksheet-pizza-lieferungen', 'worksheet-pizza-fahrer', 'worksheet-bolzendurchmesser',
  'worksheet-motorversuche', 'worksheet-spritverbrauch',
];

// `ExamplesRegistry.init()` fetches its hardcoded `./examples/index.json`
// relative to the *document* the test runner is executing in
// (tests/runner.html), not relative to this test module — so a plain
// `reg.init()` here would 404 against tests/examples/index.json. Fetch the
// real catalog ourselves (resolved against this module's URL, so the path
// holds both in the browser runner and in the headless node runner) and
// inject it, the same way the fixture-based scenario tests build a registry.
async function loadedRegistry() {
  const reg = new ExamplesRegistry();
  const url = new URL('../../examples/index.json', import.meta.url);
  const res = await fetch(url, { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch examples/index.json: HTTP ${res.status}`);
  const catalog = await res.json();
  reg._examples = catalog.examples;
  reg._initialized = true;
  return reg;
}

suite('shipped scenario catalog', () => {
  test('all twelve scenarios are present', async () => {
    const reg = await loadedRegistry();
    const ids = reg.getScenarios().map(s => s.id);
    EXPECTED_SCENARIOS.forEach(id => assertTrue(ids.includes(id), `${id} missing`));
  });

  test('the seven worksheet examples are present', async () => {
    const reg = await loadedRegistry();
    const ids = reg.getForModule('worksheet').map(e => e.id);
    EXPECTED_WORKSHEETS.forEach(id => assertTrue(ids.includes(id), `${id} missing`));
  });

  test('no duplicate ids across the whole catalog', async () => {
    const reg = await loadedRegistry();
    const ids = reg._examples.map(e => e.id);
    const seen = new Set();
    const dupes = [];
    ids.forEach(id => {
      if (seen.has(id)) dupes.push(id);
      seen.add(id);
    });
    assertEqual(dupes.length, 0, `duplicate ids: ${dupes.join(', ')}`);
  });

  test('every scenario item references an existing example', async () => {
    const reg = await loadedRegistry();
    for (const scenario of reg.getScenarios()) {
      assertTrue(Array.isArray(scenario.items) && scenario.items.length > 0,
        `${scenario.id}: items must be a non-empty array`);
      for (const item of scenario.items) {
        const { exampleId, moduleId } = parseScenarioItem(item);
        const meta = reg.get(exampleId);
        assertTrue(!!meta, `${scenario.id}: unknown example ${exampleId}`);
        if (moduleId) {
          assertTrue(Array.isArray(meta.modules) && meta.modules.includes(moduleId),
            `${scenario.id}: ${exampleId} has no module ${moduleId}`);
        }
      }
    }
  });

  test('every referenced example file exists on disk', async () => {
    const reg = await loadedRegistry();
    const referencedIds = new Set();
    for (const scenario of reg.getScenarios()) {
      for (const item of scenario.items) {
        referencedIds.add(parseScenarioItem(item).exampleId);
      }
    }
    for (const id of referencedIds) {
      const meta = reg.get(id);
      if (meta.type === 'generator') continue;
      assertTrue(typeof meta.file === 'string' && meta.file.length > 0,
        `${id}: missing file field`);
      const res = await fetch(new URL(`../../examples/${meta.file}`, import.meta.url),
        { cache: 'no-cache' });
      assertTrue(res.ok, `${id}: file ${meta.file} not reachable (HTTP ${res.status})`);
    }
  });

  test('scenarios carry cycle, startPhase and DE/EN titles', async () => {
    const reg = await loadedRegistry();
    for (const scenario of reg.getScenarios()) {
      assertEqual(typeof scenario.cycle, 'string', `${scenario.id}: cycle`);
      assertEqual(typeof scenario.startPhase, 'string', `${scenario.id}: startPhase`);
      assertEqual(typeof scenario.title.de, 'string', `${scenario.id}: title.de`);
      assertEqual(typeof scenario.title.en, 'string', `${scenario.id}: title.en`);
      assertEqual(typeof scenario.description.de, 'string', `${scenario.id}: description.de`);
      assertEqual(typeof scenario.description.en, 'string', `${scenario.id}: description.en`);
      assertEqual(scenario.modules, undefined, `${scenario.id}: must not carry modules`);
    }
  });

  test('every scenario cycle and startPhase is real', async () => {
    const reg = await loadedRegistry();
    for (const scenario of reg.getScenarios()) {
      const phaseIds = getPhaseIds(scenario.cycle);
      assertTrue(Array.isArray(phaseIds) && phaseIds.length > 0,
        `${scenario.id}: unknown cycle ${scenario.cycle}`);
      assertTrue(phaseIds.includes(scenario.startPhase),
        `${scenario.id}: startPhase ${scenario.startPhase} not in cycle ${scenario.cycle} (${phaseIds.join(',')})`);
    }
  });

  // NOTE for maintainers: this number is coupled to the literal item list of
  // scenario-pizza-full in examples/index.json. If you add/remove an item
  // there, update this expected count in the same commit.
  test('the pizza scenario covers 21 examples', async () => {
    const reg = await loadedRegistry();
    assertEqual(reg.get('scenario-pizza-full').items.length, 21);
  });

  // NOTE for maintainers: coupled to the literal item list of
  // scenario-hubschrauber-full in examples/index.json — update in the same
  // commit when items are added or removed there.
  test('the helicopter scenario covers 18 examples', async () => {
    const reg = await loadedRegistry();
    assertEqual(reg.get('scenario-hubschrauber-full').items.length, 18);
  });

  // The catalog array order IS the display order — getScenarios() does not
  // sort, and neither do the cycle-picker or the action-verb registry. The
  // helicopter pair is meant to head the list, so pin it here.
  test('the helicopter scenarios head the scenario list', async () => {
    const reg = await loadedRegistry();
    const ids = reg.getScenarios().map(s => s.id);
    assertEqual(ids[0], 'scenario-hubschrauber-full');
    assertEqual(ids[1], 'scenario-hubschrauber-starter');
    const dmaicIds = reg.getScenarios({ cycle: 'dmaic' }).map(s => s.id);
    assertEqual(dmaicIds[0], 'scenario-hubschrauber-full');
  });

  test('an optional projectName carries both languages', async () => {
    const reg = await loadedRegistry();
    for (const s of reg.getScenarios()) {
      if (!s.projectName) continue;
      assertEqual(typeof s.projectName.de, 'string', `${s.id}: projectName.de`);
      assertEqual(typeof s.projectName.en, 'string', `${s.id}: projectName.en`);
    }
  });

  test('worksheet examples resolve to the worksheet module', async () => {
    const reg = await loadedRegistry();
    EXPECTED_WORKSHEETS.forEach(id => {
      const meta = reg.get(id);
      assertTrue(!!meta, `${id} missing`);
      assertEqual(meta.modules[0], 'worksheet');
      assertEqual(meta.format, 'json');
    });
  });

  // NOTE: a starter scenario is NOT guaranteed to reuse the exact example ids
  // of its "full" counterpart — e.g. scenario-bolzen-starter references the
  // `worksheet-bolzendurchmesser` wrapper while scenario-bolzen-full drives
  // analysis-specific examples (`capability-bolzendurchmesser#...`,
  // `outlier-bolzen-grubbs#...`) that happen to share the same underlying
  // worksheet FILE (dedup is by file path, not by catalog id — see
  // examples-registry.js `load()`). So this only checks the invariants that
  // actually hold: same cycle/startPhase, and strictly fewer items.
  test('starter scenarios pair with their full scenario (same cycle/phase, fewer items)', async () => {
    const reg = await loadedRegistry();
    const pairs = [
      ['scenario-hubschrauber-starter', 'scenario-hubschrauber-full'],
      ['scenario-pizza-starter', 'scenario-pizza-full'],
      ['scenario-bolzen-starter', 'scenario-bolzen-full'],
      ['scenario-triz-band-starter', 'scenario-triz-band-full'],
      ['scenario-motor-starter', 'scenario-motor-full'],
      ['scenario-sprit-starter', 'scenario-sprit-full'],
    ];
    for (const [starterId, fullId] of pairs) {
      const starter = reg.get(starterId);
      const full = reg.get(fullId);
      assertTrue(!!starter, `${starterId} missing`);
      assertTrue(!!full, `${fullId} missing`);
      assertEqual(starter.cycle, full.cycle, `${starterId}/${fullId}: cycle mismatch`);
      assertEqual(starter.startPhase, full.startPhase, `${starterId}/${fullId}: startPhase mismatch`);
      assertTrue(starter.items.length < full.items.length,
        `${starterId}: expected fewer items than ${fullId}`);
    }
  });
});
