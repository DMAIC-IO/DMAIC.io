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

suite('DashboardGrid: setTileTitle', () => {
  test('replaces the frame title of one tile in place', () => {
    withGrid((grid, container) => {
      const el = container.querySelector('[data-tile-id="a"]');
      grid.setTileTitle('a', 'A2');
      assertEqual(container.querySelector('[data-tile-id="a"] .dashboard-grid__tile-title').textContent, 'A2');
      assertEqual(container.querySelector('[data-tile-id="a"]'), el);
      assertEqual(container.querySelector('[data-tile-id="b"] .dashboard-grid__tile-title').textContent, 'B');
    });
  });
});

suite('DashboardGrid: addTile placement', () => {
  test('with no free spot in the scanned rows the tile goes below the lowest tile, never on top of another', () => {
    const container = document.createElement('div');
    container.style.width = '1200px';
    document.body.appendChild(container);
    const grid = new DashboardGrid(container, { cols: 12, rowHeight: 40, gap: 12 });
    try {
      grid.setTiles([{ id: 'big', title: 'Big' }], [{ tileId: 'big', x: 0, y: 0, w: 12, h: 70 }]);
      assertEqual(grid.addTile({ id: 'new', title: 'New', defaultW: 3, defaultH: 3 }), true);
      const placed = grid.getLayout().find(l => l.tileId === 'new');
      assertEqual(`${placed.x},${placed.y}`, '0,70');
    } finally {
      grid.destroy();
      container.remove();
    }
  });
});
