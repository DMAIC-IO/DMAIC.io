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
import { LABEL_EDIT_KEYS } from '../core/chart/instance-chart-manager.js';

/**
 * Titel und Achsentitel der Modulkonfiguration: die automatischen Werte, die der
 * Editor als Platzhalter zeigt und bei einem geleerten Feld wieder einsetzt.
 * @param {any} chart @param {any} cfg Konfiguration des Moduls ohne Einstellungen
 */
function setAutoLabels(chart, cfg) {
  /** @type {Record<string, any>} */
  const auto = {};
  for (const k of LABEL_EDIT_KEYS) if (cfg && k in cfg) auto[k] = cfg[k];
  chart._autoLabels = auto;
}

/** Bearbeitbare Elemente, deren Fokus einen Verlaufsschritt offen hält (wie in template-module.js). */
const EDITABLE = 'input, textarea, select, [contenteditable]';

/**
 * Bedienung des Diagramms beendet die Eingabe in einem Feld außerhalb, wie ein
 * Klick daneben: Typen, die beim Drücken den Standard unterdrücken (gegen
 * Textauswahl beim Ziehen), lassen den Fokus sonst im Feld, und dessen offener
 * Verlaufsschritt nähme das Kommando mit auf.
 * @param {HTMLElement} root Wirtselement des Widgets
 */
function leaveField(root) {
  const el = root.ownerDocument?.activeElement;
  if (el instanceof HTMLElement && !root.contains(el) && el.matches(EDITABLE)) el.blur();
}

/**
 * @param {any} widget Beschreibung aus chartWidget
 * @param {(config: any) => any} [toChart] geprüfte Konfiguration → Form des Typs
 * @returns {(root: HTMLElement, w: { props: any, value: any, services: any, effect: Function, command?: (name: string, args: object) => Promise<any> }) => { destroy: () => void }}
 */
export function chartMount(widget, toChart = (c) => c) {
  const { editable } = widget;
  const roles = widget.roles ?? [];
  return function mount(root, { props, value, services, effect, command }) {
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
    /** Zuletzt angewandte Einstellungen: entfallene Schlüssel müssen beim Aktualisieren zurückgesetzt werden. */
    let appliedEdits = {};

    const release = () => {
      const { chart } = slot;
      slot = { chart: null, token: null, pending: null };
      shown = null;
      if (chart) cm?.destroy(chart);
    };

    // Die Übernahme ist keine Bedienung: mit Verlauf läuft sie über `amend` und wird
    // nie ein eigener Schritt, auch wenn das Widget erst nach einer Bedienung einhängt.
    // Ohne Alteintrag kein `amend`: es zeichnete sonst eine offene Änderung vorzeitig auf.
    const old = legacyEntry(props, value, services);
    const amend = services.history?.amend;
    if (old && amend) amend(() => adoptLegacy(props, value, services, editable, old));
    else if (old) adoptLegacy(props, value, services, editable, old);

    /** Konfiguration ohne die Rollenzuordnung (sie gehört nicht zum Diagrammtyp). @returns {any} */
    const plainConfig = () => {
      const c = props.config;
      if (!c || !roles.length) return c;
      const { commands, commandArgs, ...rest } = c;
      return rest;
    };

    /** Belegte Rollen der Konfiguration; unbekannte Rollen werfen. @param {any} c @returns {string[]} */
    const boundRoles = (c) => {
      const given = Object.keys(c?.commands ?? {});
      const bad = given.find((r) => !roles.includes(r));
      if (bad !== undefined) throw new Error(`invalid role "${bad}" in config.commands of ${widget.name}; allowed: ${roles.join(', ')}`);
      return given.filter((r) => c.commands[r]);
    };

    /** Rückfrage nach einem abgelehnten Kommando: Diagramm zeigt wieder, was das Modell hält. */
    const redraw = () => {
      const cfg = plainConfig();
      if (!cfg || !cm) return;
      const config = build(cfg, value ? (value.get() ?? {}) : {});
      if (slot.chart) { cm.update(slot.chart, config); slot.chart.refreshEditor?.(); shown = pickShown(slot.chart.config, editable, cfg); } else if (slot.token) slot.pending = config;
    };

    /**
     * Bedienung des Diagramms meldet eine Rolle: Kommando des Moduls, Fehler übersetzt über notify.
     * @param {string} role @param {object} args @returns {Promise<void>}
     */
    const onCommand = async (role, args) => {
      const c = props.config;
      const name = c?.commands?.[role];
      if (!name) return;
      leaveField(root);
      const r = await command(name, { ...(c.commandArgs ?? {}), ...args });
      if (!alive || !r || r.ok !== false) return;
      if (!r.cancelled) {
        console.warn(`${widget.name}: command ${name} failed`, r.error);
        services.notify?.(services.i18n.t('common.widget.commandRejected'), 'error');
      }
      redraw();
    };

    /**
     * Konfiguration in der Form des Typs, mit den Rückmeldungen des Widgets.
     * @param {any} cfg ohne Rollenzuordnung @param {Record<string, any>} edits
     * @returns {any}
     */
    const build = (cfg, edits) => {
      const config = toChart(applyEdits(cfg, edits, editable, ownedKeys(cfg)));
      if (value) config.onEditorChange = onEditorChange;
      const bound = roles.length ? boundRoles(props.config) : [];
      if (bound.length) { config.commandRoles = bound; config.onCommand = onCommand; }
      return config;
    };

    /** @param {any} chart */
    const onEditorChange = (chart) => {
      const cfg = plainConfig();
      if (!cfg || !shown || !value) return;
      const after = pickShown(chart.config, editable, cfg);
      const { next, cleared } = diffEdits(value.get(), shown, after, editable, ownedKeys(cfg));
      written = JSON.stringify(next);
      if (!value.set(next)) { written = null; restore(chart, cfg, after); return; }
      // Das Feld bringt den Wert in seine Form (Schlüsselreihenfolge des Schemas): verglichen wird mit dem gespeicherten.
      written = JSON.stringify(value.get() ?? {});
      // Das Diagramm zeigt die Schreibung schon; ein späteres Entfallen (Rückgängig) muss sie zurücksetzen.
      appliedEdits = JSON.parse(written);
      if (cleared.length) cm.update(chart, Object.fromEntries(cleared.map((k) => [k, cfg[k] ?? ''])));
      // Ein geleerter Reihenname heißt wieder der Name der Modulkonfiguration.
      if (Array.isArray(chart.config.series) && chart.config.series.some((/** @type {any} */ s, /** @type {number} */ i) => s?.name === '' && !!cfg.series?.[i]?.name)) {
        cm.update(chart, { series: build(cfg, value.get() ?? {}).series });
        chart.refreshEditor?.();
      }
      shown = pickShown(chart.config, editable, cfg);
    };

    /**
     * Nach einer abgelehnten Editor-Änderung zeigt das Diagramm wieder, was das Modell hält.
     * @param {any} chart @param {any} cfg @param {Record<string, any>} after
     */
    const restore = (chart, cfg, after) => {
      const patch = build(cfg, value.get() ?? {});
      const stale = editable.base.filter((/** @type {string} */ k) => after[k] !== undefined && patch[k] === undefined);
      resetToDefaults(chart, patch, stale, cfg);
      cm.update(chart, patch);
      chart.refreshEditor?.();
      shown = pickShown(chart.config, editable, cfg);
    };

    effect(() => {
      const cfg = plainConfig();
      const edits = value ? (value.get() ?? {}) : {};
      const editsJson = JSON.stringify(edits);
      const cfgJson = JSON.stringify(props.config ?? null);
      if (!cfg || !cm) { release(); lastCfg = null; return; }
      // Die eigene Schreibung zeigt das Diagramm schon — nicht neu zeichnen (Editor bleibt offen).
      if (slot.chart && editsJson === written && cfgJson === lastCfg) { written = null; return; }
      written = null;
      lastCfg = cfgJson;
      const config = build(cfg, edits);
      const owned = ownedKeys(cfg);
      const vanished = editable.base.filter((/** @type {string} */ k) => appliedEdits[k] !== undefined && edits[k] === undefined && !owned.has(k) && !(k in config));
      appliedEdits = edits;
      if (slot.token) {
        if (slot.chart) { resetToDefaults(slot.chart, config, vanished, cfg); cm.update(slot.chart, config); setAutoLabels(slot.chart, cfg); slot.chart.refreshEditor?.(); shown = pickShown(slot.chart.config, editable, cfg); } else slot.pending = config;
        return;
      }
      const token = {};
      slot = { chart: null, token, pending: null };
      root.replaceChildren();
      Promise.resolve(cm.create(root, widget.chartType, config)).then((chart) => {
        if (!alive || slot.token !== token) { if (chart) cm.destroy(chart); return; }
        if (!chart) { slot = { chart: null, token: null, pending: null }; return; }
        slot.chart = chart;
        if (slot.pending) { cm.update(chart, slot.pending); slot.pending = null; }
        setAutoLabels(chart, plainConfig());
        shown = pickShown(chart.config, editable, plainConfig());
      }, (err) => {
        if (slot.token === token) slot = { chart: null, token: null, pending: null };
        console.warn('chart create failed', err);
      });
    });

    return { destroy() { alive = false; release(); } };
  };
}

/**
 * Entfallene Einstellungen auf den Wert zurücksetzen, den der Diagrammtyp ohne
 * Einstellung hätte (Vorgabe des Moduls, sonst Vorgabe des Typs). `update`
 * mischt nur; ein fehlender Schlüssel bliebe sonst stehen.
 * @param {any} chart @param {any} patch @param {string[]} keys @param {any} cfg
 * @returns {void}
 */
function resetToDefaults(chart, patch, keys, cfg) {
  if (!keys.length) return;
  /** @type {Record<string, any>} */
  let defaults = {};
  try {
    const probe = new chart.constructor(document.createElement('div'), {}, chart.context);
    defaults = { ...probe.config };
    probe.destroy?.();
  } catch { /* ohne Typvorgabe bleibt die Vorgabe des Moduls */ }
  for (const k of keys) patch[k] = cfg[k] !== undefined ? cfg[k] : defaults[k];
}

/**
 * Der nicht leere Eintrag aus `chartEdits` der Projektebene, den das Widget
 * übernehmen soll; sonst null.
 * @param {any} props @param {any} value @param {any} services
 * @returns {Record<string, any>|null}
 */
function legacyEntry(props, value, services) {
  const key = props.legacyEditKey;
  const sm = services.stateManager;
  if (!value || !key || !sm?.getChartEdits) return null;
  const old = sm.getChartEdits(services.instanceId, key);
  return old && Object.keys(old).length > 0 ? old : null;
}

/**
 * Einen Eintrag aus `chartEdits` der Projektebene feldweise übernehmen — Werte
 * im Feld gewinnen, nur fehlende Schlüssel kommen aus dem Alteintrag — und ihn
 * danach dort entfernen.
 * @param {any} props @param {any} value @param {any} services @param {{ base: readonly string[] }} editable
 * @param {Record<string, any>} old Alteintrag aus `legacyEntry`
 * @returns {void}
 */
function adoptLegacy(props, value, services, editable, old) {
  const key = props.legacyEditKey;
  const sm = services.stateManager;
  const picked = Object.fromEntries(Object.entries(old).filter(([k]) => editable.base.includes(k)));
  const current = value.get() ?? {};
  const adds = Object.keys(picked).some((k) => !(k in current));
  if (adds && !value.set({ ...picked, ...current })) return;
  for (const k of Object.keys(old)) sm.setChartEdit(services.instanceId, key, k, null);
}
