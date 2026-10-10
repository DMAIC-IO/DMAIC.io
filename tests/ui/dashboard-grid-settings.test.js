import { suite, test, assertEqual } from '../test-utils.js';
import { DashboardGrid } from '../../js/ui/dashboard-grid.js';

function withGrid(fn) {
  const container = document.createElement('div');
  container.style.width = '1200px';
  document.body.appendChild(container);
  const grid = new DashboardGrid(container, { cols: 12, rowHeight: 40, gap: 12 });
  try {
    grid.setTiles([
      { id: 'a', title: 'A', hasSettings: true, settingsLabel: 'Settings', canDuplicate: true, duplicateLabel: 'Duplicate' },
      { id: 'b', title: 'B' },
    ], [
      { tileId: 'a', x: 0, y: 0, w: 3, h: 3 },
      { tileId: 'b', x: 3, y: 0, w: 3, h: 3 },
    ]);
    fn(grid, container);
  } finally {
    grid.destroy();
    container.remove();
  }
}

const gear = (container, id) =>
  container.querySelector(`[data-tile-id="${id}"] .dashboard-grid__tile-settings-btn`);

suite('DashboardGrid: tile settings button', () => {
  test('rendered only for tiles with settings, labelled from the def', () => {
    withGrid((grid, container) => {
      const btn = gear(container, 'a');
      assertEqual(btn.getAttribute('title'), 'Settings');
      assertEqual(btn.getAttribute('aria-label'), 'Settings');
      assertEqual(gear(container, 'b'), null);
    });
  });

  test('click calls onSettingsRequested with the tile id', () => {
    withGrid((grid, container) => {
      const calls = [];
      grid.onSettingsRequested = (id) => calls.push(id);
      gear(container, 'a').click();
      assertEqual(calls.join(','), 'a');
    });
  });
});

const dup = (container, id) =>
  container.querySelector(`[data-tile-id="${id}"] .dashboard-grid__tile-duplicate-btn`);

suite('DashboardGrid: duplicate button', () => {
  test('rendered only for duplicable tiles, labelled from the def', () => {
    withGrid((grid, container) => {
      const btn = dup(container, 'a');
      assertEqual(btn.getAttribute('title'), 'Duplicate');
      assertEqual(btn.getAttribute('aria-label'), 'Duplicate');
      assertEqual(dup(container, 'b'), null);
    });
  });

  test('click calls onDuplicateRequested with the tile id', () => {
    withGrid((grid, container) => {
      const calls = [];
      grid.onDuplicateRequested = (id) => calls.push(id);
      dup(container, 'a').click();
      assertEqual(calls.join(','), 'a');
    });
  });
});
