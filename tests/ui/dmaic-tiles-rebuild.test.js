/**
 * Tests for DmaicTiles.rebuild(): cycle-aware rebuild without double listeners,
 * and for the updaters that must reach both copies of a tile (in flow + flyout).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { DmaicTiles } from '../../js/ui/dmaic-tiles.js';
import { getAllPhaseIds, getPhaseDef } from '../../js/core/cycles/cycles.js';

function makeTiles(cycleId = 'dmaic', translate = (k) => k) {
  const container = document.createElement('div');
  const handlers = { count: 0 };
  const eventBus = {
    on: () => { handlers.count += 1; },
    emit: () => {},
  };
  // Production `_getCycleId()` reads `get('projectMeta.cycle')`, so the fake
  // must serve the mutable cycle id through that exact key (not only through
  // `getProjectCycle()`, which this call site never invokes).
  const stateManager = {
    get: (key) => (key === 'projectMeta.cycle' ? cycleId : (key === 'phases' ? {} : null)),
    getProjectCycle: () => cycleId,
  };
  const i18n = { t: (k) => translate(k), getLanguage: () => 'de' };
  const moduleRegistry = { getAll: () => [], setActiveCycle: () => {}, get: () => null };
  const tiles = new DmaicTiles(container, { eventBus, stateManager, i18n, moduleRegistry });
  return { tiles, container, handlers, setCycle: (c) => { cycleId = c; } };
}

suite('DmaicTiles.rebuild', () => {
  test('render subscribes exactly once', () => {
    const { tiles, handlers } = makeTiles();
    tiles.render();
    const afterRender = handlers.count;
    tiles.rebuild();
    tiles.rebuild();
    assertEqual(handlers.count, afterRender, 'rebuild registers no further listeners');
  });

  test('rebuild renders the phases of the current cycle', () => {
    const ctx = makeTiles('dmaic');
    ctx.tiles.render();
    const dmaicPhases = [...ctx.container.querySelectorAll('.dmaic-tile')].map(t => t.dataset.phase);
    assertDeepEqual(dmaicPhases, getAllPhaseIds('dmaic'), 'initial render matches dmaic phases');

    ctx.setCycle('dmadv');
    ctx.tiles.rebuild();
    const dmadvPhases = [...ctx.container.querySelectorAll('.dmaic-tile')].map(t => t.dataset.phase);
    assertDeepEqual(dmadvPhases, getAllPhaseIds('dmadv'), 'rebuild matches dmadv phases');
    assertEqual(
      dmadvPhases.join(',') === dmaicPhases.join(','),
      false,
      'rebuild actually changed the rendered phase list',
    );
  });

  test('rebuild resets an active phase that no longer exists', () => {
    // 'control' is a dmaic-only phase (absent from dmadv) — a genuine
    // stale-active-phase case for the switch below.
    assertEqual(getAllPhaseIds('dmaic').includes('control'), true, 'sanity: control exists in dmaic');
    assertEqual(getAllPhaseIds('dmadv').includes('control'), false, 'sanity: control absent from dmadv');

    const ctx = makeTiles('dmaic');
    ctx.tiles.render();
    ctx.tiles._activePhase = 'control';
    ctx.setCycle('dmadv');
    ctx.tiles.rebuild();

    const phases = [...ctx.container.querySelectorAll('.dmaic-tile')].map(t => t.dataset.phase);
    const dmadvPhases = getAllPhaseIds('dmadv');
    assertEqual(ctx.tiles.getActivePhase(), dmadvPhases[1], 'active phase reset to the new cycle\'s second tile');
    assertEqual(phases.includes(ctx.tiles.getActivePhase()), true, 'active phase exists in new cycle');
  });
});

suite('DmaicTiles updaters reach the flyout copy', () => {
  /** @returns {{ flow: HTMLElement, flyout: HTMLElement }} both renderings of a tile */
  function copies(container, phase) {
    const tile = container.querySelector(`.dmaic-tile[data-phase="${phase}"]`);
    return {
      flow: tile.querySelector(':scope > .dmaic-tile__inner'),
      flyout: tile.querySelector(':scope > .dmaic-tile__flyout'),
    };
  }

  test('updateProgress writes the percentage and bar into both copies', () => {
    const { tiles, container } = makeTiles('dmaic');
    tiles.render();
    tiles.updateProgress('measure', 37);
    const { flow, flyout } = copies(container, 'measure');
    assertEqual(flyout !== null, true, 'sanity: the tile has a flyout');
    for (const [where, el] of [['flow', flow], ['flyout', flyout]]) {
      assertEqual(el.querySelector('.dmaic-tile__zeg').textContent, '37%', `percentage in ${where}`);
      assertEqual(el.querySelector('.dmaic-tile__progress-fill').style.width, '37%', `bar in ${where}`);
    }
  });

  test('_refreshLabels renames the phase in both copies', () => {
    let lang = 'de';
    const { tiles, container } = makeTiles('dmaic', (k) => `${lang}:${k}`);
    tiles.render();
    lang = 'en';
    tiles._refreshLabels();
    const { flow, flyout } = copies(container, 'measure');
    for (const [where, el] of [['flow', flow], ['flyout', flyout]]) {
      assertEqual(el.querySelector('.dmaic-tile__name').textContent, 'en:phases.measure', `name in ${where}`);
    }
  });
});

suite('DmaicTiles virtual frame tiles', () => {
  test('exactly the virtual frame tiles carry dmaic-tile--virtual', () => {
    const { tiles, container } = makeTiles('eightd');
    tiles.render();
    for (const tile of container.querySelectorAll('.dmaic-tile')) {
      const virtual = getPhaseDef('eightd', tile.dataset.phase)?.virtual === true;
      assertEqual(tile.classList.contains('dmaic-tile--virtual'), virtual, `modifier on ${tile.dataset.phase}`);
    }
  });
});
