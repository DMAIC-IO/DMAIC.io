/**
 * Diagramm-Widget im Scope einer Kachel (core/template-tile.js + pages/dashboard/tile-render.js) — im Browser.
 */
import Alpine from '../../vendor/alpinejs/csp.js';
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { createTile } from '../../js/core/template-tile.js';
import { defineModel, defineSettings, list, text, boolean } from '../../js/core/model.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { renderTileSafely, disposeTile } from '../../js/pages/dashboard/tile-render.js';

/** Dieselbe Übersetzung wie in tests/core/widget-directive.test.js: die Direktive übernimmt die erste. */
const WIDGET_I18N = { t: (k, p) => (p ? `${k}:${p.message ?? JSON.stringify(p)}` : k), getLanguage: () => 'de' };

const ID = 'demo-chart-tile';
const KEY = `js/modules/${ID}/resources/tile.html`;
let registered = false;
const flush = () => new Promise((r) => setTimeout(r, 0));

function ensureTemplate() {
  if (!Alpine.version) Alpine.start();
  if (!registered) { registerWidgetDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS }); registered = true; }
  if (document.querySelector(`template[data-tpl="${KEY}"]`)) return;
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', KEY);
  tpl.innerHTML = '<div class="demo-tile"><div class="demo-plot" x-widget="control-chart" x-widget-config="chart"></div></div>';
  document.head.append(tpl);
}

function recordingManager() {
  const made = []; const destroyed = [];
  return {
    made, destroyed,
    create: async (el, type, config) => { const c = { el, type, config }; made.push(c); return c; },
    update: () => {},
    destroy: (c) => { destroyed.push(c); },
  };
}

const Doc = defineModel({ fields: { items: list(text()) } });
const Settings = defineSettings({ show: boolean({ default: true }) });
const tile = createTile({
  descriptor: { id: ID }, Model: Doc, Settings,
  view() {
    return {
      get chart() { return this.settings.show ? { values: this.model.items.map((_, i) => i) } : null; },
    };
  },
});
const i18n = { t: (k) => k };

suite('createTile: Diagramm-Widget im Kachel-Scope', () => {
  test('je Rendern genau ein Diagramm über den Kachel-Manager, ohne Editor-Rückruf, Abbau bei neuem Rendern und dispose', async () => {
    ensureTemplate();
    const cm = recordingManager();
    const body = document.createElement('div');
    document.body.append(body);
    const args = { tileId: 't', instanceId: 'i', state: { items: ['a', 'b'] }, settings: { show: true }, i18n, chartManager: cm };
    await renderTileSafely(tile, body, args, i18n);
    await flush();
    assertEqual(cm.made.length, 1);
    assertEqual(cm.made[0].type, 'control-chart');
    assertDeepEqual(cm.made[0].config.values, [0, 1]);
    assertEqual(cm.made[0].config.onEditorChange, undefined);
    await renderTileSafely(tile, body, args, i18n);
    await flush();
    assertEqual(cm.made.length, 2);
    assertDeepEqual(cm.destroyed, [cm.made[0]]);
    disposeTile(tile, body, { tileId: 't' });
    assertDeepEqual(cm.destroyed, [cm.made[0], cm.made[1]]);
    body.remove();
  });

  test('null: kein Diagramm', async () => {
    ensureTemplate();
    const cm = recordingManager();
    const body = document.createElement('div');
    await renderTileSafely(tile, body, { tileId: 't', state: {}, settings: { show: false }, i18n, chartManager: cm }, i18n);
    await flush();
    assertEqual(cm.made.length, 0);
  });
});
