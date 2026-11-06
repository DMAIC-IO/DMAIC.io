/**
 * D.Mike — Direktive x-chart (chart-directive.js)
 *
 * `x-chart="residFitted"` nennt einen Getter oder ein `computed` des
 * view-Blocks, der `{ type, config }` oder `null` liefert. Die Direktive läuft
 * als Effect darüber und nutzt den Instanz-chartManager (`_ui.chartManager`):
 * erster Wert → `create`, gleicher Typ → `update`, anderer Typ → abbauen und
 * neu erzeugen, `null` → abbauen. `editKey` ist `<modulId>:<Ausdruck>`, ein
 * `editKey` im config gewinnt. Ein `create`, das von einem neueren Wert
 * überholt wurde, wird verworfen. Abgebaut wird mit dem Element. Thema und
 * Sprache zeichnet der chartManager selbst neu.
 */

const registered = new WeakSet();
const NAME = /^[A-Za-z_$][\w$]*$/;

/**
 * Rohe, tiefe Kopie ohne Alpine-Proxies; Funktionen bleiben.
 * @param {any} Alpine @param {any} v @returns {any}
 */
function plain(Alpine, v) {
  const raw = v !== null && typeof v === 'object' ? Alpine.raw(v) : v;
  if (Array.isArray(raw)) return raw.map((x) => plain(Alpine, x));
  if (raw !== null && typeof raw === 'object' && Object.getPrototypeOf(raw) === Object.prototype) {
    return Object.fromEntries(Object.entries(raw).map(([k, x]) => [k, plain(Alpine, x)]));
  }
  return raw;
}

/**
 * `x-chart` registrieren; je Alpine-Instanz einmal wirksam.
 * @param {any} Alpine
 * @returns {void}
 */
export function registerChartDirective(Alpine) {
  if (registered.has(Alpine)) return;
  registered.add(Alpine);
  Alpine.directive('chart', (el, { expression }, { effect, cleanup }) => {
    const name = String(expression).trim();
    const where = `x-chart="${expression}"`;
    if (!NAME.test(name)) throw new Error(`${where}: expected the name of a getter or computed of the view block`);
    const data = Alpine.$data(el);
    if (!(name in data)) throw new Error(`${where}: ${name} is not a member of the view block`);
    const manager = () => data._ui?.chartManager ?? null;

    /** @type {{ chart: any, type: string|null, token: object|null, pending: object|null }} */
    let slot = { chart: null, type: null, token: null, pending: null };
    let alive = true;

    const release = () => {
      const { chart } = slot;
      slot = { chart: null, type: null, token: null, pending: null };
      if (chart) manager()?.destroy(chart);
    };

    effect(() => {
      const value = data[name];
      const cm = manager();
      if (!value || !cm) { release(); return; }
      const base = plain(Alpine, value.config ?? {});
      const config = { ...base, editKey: base.editKey ?? `${data.moduleId}:${name}` };
      if (slot.token && slot.type === value.type) {
        if (slot.chart) cm.update(slot.chart, config);
        else slot.pending = config;
        return;
      }
      release();
      const token = {};
      slot = { chart: null, type: value.type, token, pending: null };
      el.replaceChildren();
      Promise.resolve(cm.create(el, value.type, config)).then((chart) => {
        if (!alive || slot.token !== token) { if (chart) cm.destroy(chart); return; }
        if (!chart) return;
        slot.chart = chart;
        if (slot.pending) { cm.update(chart, slot.pending); slot.pending = null; }
      });
    });
    cleanup(() => { alive = false; release(); });
  });
}
