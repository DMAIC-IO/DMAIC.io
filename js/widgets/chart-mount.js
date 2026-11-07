/**
 * D.Mike — Einhänger der Diagramm-Widgets (chart-mount.js)
 *
 * Hüllt chartManager.create/update/destroy ein; gezeichnet wird weiter vom
 * SVG-Chart-Framework. Gespeicherte Editor-Einstellungen (`value`) liegen
 * über der Konfiguration des Moduls; Editor-Änderungen gehen über
 * `value.set` zurück. Ohne Wertbindung entscheidet der chartManager des
 * Hosts (Modul: nichts speichern, Kachel: Kachelbindung).
 */
import { applyEdits, diffEdits, ownedKeys, pickShown } from './chart-edits.js';

/**
 * @param {any} widget Beschreibung aus chartWidget
 * @param {(config: any) => any} [toChart] geprüfte Konfiguration → Form des Typs
 * @returns {(root: HTMLElement, w: { props: any, value: any, services: any, effect: Function }) => { destroy: () => void }}
 */
export function chartMount(widget, toChart = (c) => c) {
  const { editable } = widget;
  return function mount(root, { props, value, services, effect }) {
    const cm = services.chartManager;
    /** @type {{ chart: any, token: object|null, pending: any }} */
    let slot = { chart: null, token: null, pending: null };
    let alive = true;
    /** @type {any} */
    let shown = null;
    /** @type {string|null} */
    let written = null;
    /** @type {string|null} */
    let lastCfg = null;

    const release = () => {
      const { chart } = slot;
      slot = { chart: null, token: null, pending: null };
      shown = null;
      if (chart) cm?.destroy(chart);
    };

    adoptLegacy(props, value, services, editable);

    /** @param {any} chart */
    const onEditorChange = (chart) => {
      const cfg = props.config;
      if (!cfg || !shown || !value) return;
      const after = pickShown(chart.config, editable);
      const { next, cleared } = diffEdits(value.get(), shown, after, editable, ownedKeys(cfg));
      written = JSON.stringify(next);
      if (!value.set(next)) { written = null; return; }
      if (cleared.length) cm.update(chart, Object.fromEntries(cleared.map((k) => [k, cfg[k] ?? ''])));
      shown = pickShown(chart.config, editable);
    };

    effect(() => {
      const cfg = props.config;
      const edits = value ? (value.get() ?? {}) : {};
      const editsJson = JSON.stringify(edits);
      const cfgJson = JSON.stringify(cfg ?? null);
      if (!cfg || !cm) { release(); lastCfg = null; return; }
      // Die eigene Schreibung zeigt das Diagramm schon — nicht neu zeichnen (Editor bleibt offen).
      if (slot.chart && editsJson === written && cfgJson === lastCfg) { written = null; return; }
      written = null;
      lastCfg = cfgJson;
      const config = toChart(applyEdits(cfg, edits, editable, ownedKeys(cfg)));
      if (value) config.onEditorChange = onEditorChange;
      if (slot.token) {
        if (slot.chart) { cm.update(slot.chart, config); shown = pickShown(slot.chart.config, editable); } else slot.pending = config;
        return;
      }
      const token = {};
      slot = { chart: null, token, pending: null };
      root.replaceChildren();
      Promise.resolve(cm.create(root, widget.chartType, config)).then((chart) => {
        if (!alive || slot.token !== token) { if (chart) cm.destroy(chart); return; }
        if (!chart) return;
        slot.chart = chart;
        if (slot.pending) { cm.update(chart, slot.pending); slot.pending = null; }
        shown = pickShown(chart.config, editable);
      });
    });

    return { destroy() { alive = false; release(); } };
  };
}

/**
 * Einen Eintrag aus `chartEdits` der Projektebene einmalig übernehmen, wenn
 * das Feld noch leer ist, und ihn danach dort entfernen.
 * @param {any} props @param {any} value @param {any} services @param {{ base: readonly string[] }} editable
 * @returns {void}
 */
function adoptLegacy(props, value, services, editable) {
  const key = props.legacyEditKey;
  const sm = services.stateManager;
  if (!value || !key || !sm?.getChartEdits || Object.keys(value.get() ?? {}).length > 0) return;
  const old = sm.getChartEdits(services.instanceId, key);
  if (!old || Object.keys(old).length === 0) return;
  const picked = Object.fromEntries(Object.entries(old).filter(([k]) => editable.base.includes(k)));
  if (!value.set(picked)) return;
  for (const k of Object.keys(old)) sm.setChartEdit(services.instanceId, key, k, null);
}
