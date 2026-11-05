/**
 * D.Mike — Kachel-Bausteine (tile-kit.js)
 *
 * Wiederkehrende Teile der Dashboard-Kacheln zum Import: Settings-Schemata
 * (`topN`, `showLegend`, `showChart`), Verteilungsbalken mit Legende
 * (`distribution`) und ein Chart im Slot (`chartSlot`). Die Bausteine sind
 * ein Angebot; eine Kachel kann jedes Stück weiter selbst schreiben. Der
 * Kachel-Vertrag (Lebenszyklus in js/pages/dashboard/tile-render.js) bleibt
 * unberührt.
 *
 * Rein bis auf `chartSlot`, das nur `querySelector` am Wurzelelement nutzt.
 */

/**
 * Setting „die ersten N“.
 * @param {{ default?: number, max?: number, label?: string }} [opts]
 * @returns {{ type: 'number', min: number, max: number, step: number, default: number, label: string }}
 */
export function topN({ default: def = 5, max = 10, label = 'dashboard.tileSettings.topN' } = {}) {
  return { type: 'number', min: 1, max, step: 1, default: def, label };
}

/**
 * Setting „Legende anzeigen“.
 * @param {{ default?: boolean }} [opts]
 * @returns {{ type: 'boolean', default: boolean, label: string }}
 */
export function showLegend({ default: def = true } = {}) {
  return { type: 'boolean', default: def, label: 'dashboard.tileSettings.showLegend' };
}

/**
 * Setting „Diagramm anzeigen“.
 * @param {{ default?: boolean }} [opts]
 * @returns {{ type: 'boolean', default: boolean, label: string }}
 */
export function showChart({ default: def = true } = {}) {
  return { type: 'boolean', default: def, label: 'dashboard.tileSettings.showChart' };
}

/**
 * Verteilungsbalken und Legende aus Anteilen. Einträge mit `count` 0
 * fallen weg; `total` 0 ergibt zwei leere Listen.
 * @param {{ key: string, label: string, count: number, color: string }[]} parts
 * @param {{ total?: number }} [opts] Bezugsgröße für die Breite (Vorgabe: Summe der `count`)
 * @returns {{
 *   segments: { key: string, style: string, title: string }[],
 *   legend: { key: string, dot: string, text: string }[],
 * }} `style`: `width:…%;background:…`, `dot`: `background:…`, `text`: `label: count`
 */
export function distribution(parts, { total } = {}) {
  const sum = total ?? parts.reduce((s, p) => s + p.count, 0);
  if (!sum) return { segments: [], legend: [] };
  const present = parts.filter(p => p.count > 0);
  return {
    segments: present.map(p => ({
      key: p.key,
      style: `width:${p.count / sum * 100}%;background:${p.color}`,
      title: `${p.label}: ${p.count}`,
    })),
    legend: present.map(p => ({ key: p.key, dot: `background:${p.color}`, text: `${p.label}: ${p.count}` })),
  };
}

/**
 * Ein Chart im Slot `[data-tile-slot="chart"]`. Ein neuerer Render oder
 * `dispose` verwirft einen Chart, der noch entsteht. Jede Kachel ruft
 * `chartSlot` einmal auf Modulebene auf und setzt das Ergebnis per Spread in
 * ihre Definition ein; jeder Aufruf hat seine eigene Ablage.
 * @param {string} type Charttyp für `chartManager.create`
 * @param {(vm: object, args: object) => object} [toConfig] Konfiguration aus
 *   Viewmodel und Render-Argumenten (Vorgabe: Kopie von `vm.chart`)
 * @returns {{
 *   mount: (root: HTMLElement, vm: object, args: { chartManager?: object }) => Promise<void>,
 *   dispose: (host: HTMLElement) => void,
 * }}
 */
export function chartSlot(type, toConfig = ({ chart }) => ({ ...chart })) {
  /** Wurzelelement -> { chart, chartManager, token } des letzten Renders. */
  const charts = new WeakMap();

  /** Chart des letzten Renders zerstören und vergessen. @param {HTMLElement} host */
  function release(host) {
    const entry = charts.get(host);
    if (entry?.chart) entry.chartManager.destroy(entry.chart);
    charts.delete(host);
  }

  return {
    /**
     * Chart im Slot anlegen; ohne `vm.chart` oder ohne `chartManager` nichts.
     * @param {HTMLElement} root Kachelinhalt
     * @param {object} vm Viewmodel aus `viewModel()`
     * @param {{ chartManager?: object }} args Render-Argumente
     * @returns {Promise<void>}
     */
    async mount(root, vm, args) {
      const { chartManager } = args;
      release(root);
      const token = {};
      charts.set(root, { chart: null, chartManager, token });
      if (!vm.chart || !chartManager) return;
      const slot = root.querySelector('[data-tile-slot="chart"]');
      const chart = await chartManager.create(slot, type, toConfig(vm, args));
      const entry = charts.get(root);
      if (entry?.token !== token) { chartManager.destroy(chart); return; }
      entry.chart = chart;
    },
    /**
     * Chart des Wurzelelements freigeben (Kachel entfernt oder Host verlassen).
     * @param {HTMLElement} host
     */
    dispose(host) {
      release(host);
    },
  };
}
