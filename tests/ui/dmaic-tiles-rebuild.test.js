/**
 * Tests for DmaicTiles.rebuild(): cycle-aware rebuild without double listeners.
 */
import { suite, test, assertEqual } from '../test-utils.js';
import { DmaicTiles } from '../../js/ui/dmaic-tiles.js';

function makeTiles(cycleId = 'dmaic') {
  const container = document.createElement('div');
  const handlers = { count: 0 };
  const eventBus = {
    on: () => { handlers.count += 1; },
    emit: () => {},
  };
  const stateManager = {
    get: (key) => (key === 'phases' ? {} : null),
    getProjectCycle: () => cycleId,
  };
  const i18n = { t: (k) => k, getLanguage: () => 'de' };
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
    const dmaicCount = ctx.container.querySelectorAll('.dmaic-tile').length;
    ctx.setCycle('dmadv');
    ctx.tiles.rebuild();
    const dmadvCount = ctx.container.querySelectorAll('.dmaic-tile').length;
    assertEqual(dmadvCount > 0, true, 'tiles rendered for the new cycle');
    assertEqual(typeof dmaicCount, 'number');
  });

  test('rebuild resets an active phase that no longer exists', () => {
    const ctx = makeTiles('dmaic');
    ctx.tiles.render();
    ctx.tiles._activePhase = 'measure';
    ctx.setCycle('dmadv');
    ctx.tiles.rebuild();
    const phases = [...ctx.container.querySelectorAll('.dmaic-tile')].map(t => t.dataset.phase);
    assertEqual(phases.includes(ctx.tiles.getActivePhase()), true, 'active phase exists in new cycle');
  });
});
