/**
 * DMAIC.io — MSA Typ 6 Module (msa-typ6.js)
 * Measure phase: Stabilität / Langzeitverhalten eines Messsystems anhand
 * eines über die Zeit wiederholt gemessenen Referenzteils — Regelkarte
 * (I-MR oder x̄-R), Nelson-Regeln 1–8 und linearer Drift-Test.
 *
 * Migriert auf createModule + Alpine CSP. Das Model (msa-typ6-model.js)
 * hält ausschließlich die Roh-Inputs (params + drei Column-Refs +
 * optionale Beispieldaten-Worksheet-Id); das analyze()-Ergebnis wird
 * transient in der View aus diesen Inputs plus den Live-Worksheet-Daten
 * via `js/engines/msa-typ6-engine.js` abgeleitet. ColumnPicker und Charts
 * werden imperativ gemountet (keine reinen Template-Belange).
 *
 * Task 8: Input-Panel Controls (Kartentyp, drei ColumnPicker, Grenzen-Modus,
 * Nelson-Regeln, α) + debounced Auto-Run (`_analyzeNow()`).
 * Task 9: Output-Panel Verdikt-Header + KPI-Strip (`_fmt`/`_mean`-Helfer).
 * Task 10: Regelkarten-Charts primary (I bzw. x̄) + secondary (MR bzw. R) via
 * `_renderCharts()`/`_destroyCharts()`/`_whenAnchor()` (chartManager
 * 'control-chart', bounded rAF-Poll für den verschachtelten `x-if`-Anker).
 * Task 11 (dieser Stand): Verletzungs-Tabelle unterhalb der Charts +
 * `_highlight(primaryIndex)` (Klick auf eine Zeile scrollt zur Primärkarte
 * + kurzzeitige Row-Highlight-Klasse). control-chart.js setzt keine
 * Pro-Punkt-DOM-Hooks (kein `data-chart-index` o. Ä.) — ein Klick-zu-Punkt-
 * Highlight auf dem SVG selbst würde eine Erweiterung des geteilten
 * Chart-Typs voraussetzen, was außerhalb dieses Tasks liegt (siehe Plan
 * Task 11, Variante c). Drift-Analyse-Chart und Interpretation folgen in
 * Task 12–13.
 *
 * Spec: docs/superpowers/specs/2026-07-16-msa-typ6-design.md § 6
 */

import { createModule } from '../../core/template-module.js';
import { State } from './msa-typ6-model.js';
import { analyze, NELSON_RULES } from '../../engines/msa-typ6-engine.js';
import { ColumnPicker, getColumnValues } from '../../ui/column-picker.js';

/** Roles mounted as ColumnPicker instances, matching `model.columns` keys. */
const PICKER_ROLES = ['timestamp', 'value', 'subgroup'];

const mod = createModule({
  config: {
    id: 'msa-typ6',
    engine: 'alpine',
    phase: 'measure',
    icon: 'activity',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ──────────────────
      _lastResult: null,
      _lastError: null,
      _charts: [],
      _renderGen: 0,
      _unsubs: [],
      _pickers: { timestamp: null, value: null, subgroup: null },
      _debTimer: null,

      // Verletzungs-Tabelle Row-Highlight (Task 11): primaryIndex der zuletzt
      // angeklickten Zeile, für die kurze Dauer der :class-Bindung im
      // Template; danach von `_highlight()` per Timer wieder gelöscht.
      _highlightedIndex: null,
      _highlightTimer: null,

      // Typ-1-Instanzen für den "aus Typ-1-Instanz übernehmen"-Dropdown im
      // `given`-Grenzen-Modus. Bleibt leer (nur Platzhalter-Option im Select)
      // bis Task 14 sie aus dem Projekt-State befüllt.
      _typ1Instances: [],

      // ── Nelson-Regel-Kurztexte (View-Helfer) ──────────────────

      /** @param {number} id 1..8 @returns {string} sprachabhängiger Kurztext. */
      _ruleShort(id) {
        const lang = module._context.language || 'de';
        const rule = NELSON_RULES.find((r) => r.id === id);
        return rule ? (rule.short[lang] || rule.short.de) : `#${id}`;
      },

      /** @param {number} id 1..8 @returns {string} sprachabhängige Kurzbeschreibung. */
      _ruleDesc(id) {
        const lang = module._context.language || 'de';
        const rule = NELSON_RULES.find((r) => r.id === id);
        return rule ? (rule.desc[lang] || rule.desc.de) : '';
      },

      // ── Formatierungs-Helfer (Output-Panel, Task 9) ───────────

      /**
       * Formatiert eine Zahl mit fester Nachkommastellenzahl; nicht-endliche
       * Werte (NaN/Infinity) werden als Em-Dash dargestellt statt "NaN".
       * @param {number} v
       * @param {number} [digits=3]
       * @returns {string}
       */
      _fmt(v, digits = 3) {
        return Number.isFinite(v) ? v.toFixed(digits) : '—';
      },

      /**
       * Arithmetisches Mittel eines Zahlen-Arrays; ignoriert nicht-endliche
       * Einträge (NaN/Infinity/undefined). Liefert NaN bei leerem/ungültigem
       * Input (von {@link _fmt} als '—' dargestellt).
       * @param {number[]} arr
       * @returns {number}
       */
      _mean(arr) {
        if (!Array.isArray(arr)) return NaN;
        const valid = arr.filter((v) => Number.isFinite(v));
        return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : NaN;
      },

      // ── Analyse ──────────────────────────────────────────────

      /**
       * Baut das Engine-Input-Objekt aus den live gelesenen Worksheet-Spalten
       * plus den aktuellen Parametern. Liest Werte erst im Analyse-Moment
       * (nicht gecacht), damit Fremd-Änderungen am Worksheet (z. B.
       * `worksheet:dataChanged`) korrekt aufgelöst werden.
       * @returns {object|null} null, wenn keine (gültige) Messwert-Spalte gewählt ist.
       */
      _buildInputs() {
        const cols = this.model.columns;
        if (!cols.value) return null;

        const sm = module._context.stateManager;
        const rawValues = getColumnValues(sm, cols.value) || [];
        const rawTimestamps = cols.timestamp ? (getColumnValues(sm, cols.timestamp) || []) : null;
        const rawSubgroups = cols.subgroup ? (getColumnValues(sm, cols.subgroup) || []) : null;

        // Zeilen mit fehlendem/nicht-numerischem Messwert überspringen, dabei
        // Zeitstempel/Untergruppe an derselben Zeilen-Position mitführen, damit
        // alle drei Arrays Index-synchron bleiben (Engine-Vertrag).
        const values = [];
        const timestamps = rawTimestamps ? [] : null;
        const subgroups = rawSubgroups ? [] : null;
        for (let i = 0; i < rawValues.length; i++) {
          const v = rawValues[i];
          if (v === null || v === undefined || v === '') continue;
          const n = Number(v);
          if (!Number.isFinite(n)) continue;
          values.push(n);
          if (timestamps) timestamps.push(rawTimestamps[i] ?? null);
          if (subgroups) subgroups.push(rawSubgroups[i] ?? null);
        }
        if (!values.length) return null;

        const p = this.model.params;
        // Alpine-Checkbox-x-model auf einem Array liefert Strings zurück
        // (siehe msa-typ6-model.js enabledRulesOf-Kommentar) — hier auf Number
        // coercen + dedupen + sortieren, bevor die Engine sie liest.
        const enabledRules = [...new Set((p.enabledRules || []).map(Number))]
          .filter(Number.isFinite)
          .sort((a, b) => a - b);

        return {
          chartType: p.chartType,
          values,
          subgroups: p.chartType === 'xbar-r' ? subgroups : null,
          timestamps,
          limitsMode: p.limitsMode,
          baselineK: p.baselineK,
          mu0: p.mu0,
          sigma0: p.sigma0,
          enabledRules,
          alpha: parseFloat(p.alpha),
        };
      },

      /**
       * Debounced Auto-Run (~120 ms): jede Input-Änderung ruft dies auf statt
       * direkt zu analysieren, damit schnelle Tipp-/Klick-Folgen nur einen
       * `analyze()`-Aufruf auslösen.
       */
      _analyzeNow() {
        clearTimeout(this._debTimer);
        this._debTimer = setTimeout(() => {
          const inputs = this._buildInputs();
          if (!inputs) {
            this._lastResult = null;
            this._lastError = null;
          } else {
            try {
              this._lastResult = analyze(inputs);
              this._lastError = null;
            } catch (e) {
              this._lastResult = null;
              this._lastError = e.code;
            }
          }
          // Immer aufrufen (auch im !inputs/Fehler-Zweig) — sonst blieben
          // Charts einer vorherigen erfolgreichen Analyse stehen, wenn der
          // Nutzer z. B. die Werte-Spalte wieder abwählt.
          this._renderCharts();
        }, 120);
      },

      // ── Regelkarten-Charts (imperative widgets, Task 10) ──────

      /**
       * Rendert die zwei Regelkarten (primary: I bzw. x̄; secondary: MR bzw.
       * R) über `chartManager.create(host, 'control-chart', …)` in die
       * templated `[data-chart-host]`-Anker (siehe msa-typ6.html). Nelson-
       * Regel-Markierungen und Zonenbänder laufen ausschließlich auf der
       * Primärkarte; die Sekundärkarte (Spannweite) zeigt nur Datenlinie +
       * CL/UCL/LCL ohne Zonen/Verletzungen.
       *
       * Die Chart-Hosts liegen innerhalb eines `<template x-if="_lastResult">`
       * — Alpine materialisiert solche verschachtelten Anker über mehrere
       * Reactivity-Flush-Zyklen, daher ein bounded rAF-Poll (`_whenAnchor`,
       * Konvention aus control-chart.js) statt eines einzelnen `$nextTick`.
       */
      async _renderCharts() {
        const gen = ++this._renderGen;
        this._destroyCharts();
        if (!this._lastResult) return;

        const { primary, secondary, ruleViolations } = this._lastResult;
        const violationIndices = new Set(ruleViolations.map((v) => v.primaryIndex));
        const cm = module._context.chartManager;

        const hostPrimary = await this._whenAnchor('[data-chart-host="primary"]', gen);
        if (!hostPrimary) return;
        const c1 = await cm.create(hostPrimary, 'control-chart', {
          values: primary.series,
          cl: primary.cl,
          ucl: primary.ucl,
          lcl: primary.lcl,
          sigma: primary.sigma,
          violationIndices,
          showZones: true,
          labels: primary.series.map((_, i) => String(i + 1)),
        });
        if (gen !== this._renderGen) { cm.destroy(c1); return; }
        this._charts.push(c1);

        const hostSecondary = await this._whenAnchor('[data-chart-host="secondary"]', gen);
        if (!hostSecondary) { cm.destroy(c1); this._charts = []; return; }
        // MR-Serie hat `null` an Index 0 (erste Differenz ist undefiniert).
        // Der control-chart-Typ überspringt `null`-Werte in Linie und
        // Punkten von sich aus (chart/types/control-chart.js _renderData)
        // — unverändert durchreichen statt auf 0 zu erzwingen, sonst würde
        // ein irreführender Datenpunkt bei y=0 gezeichnet.
        const c2 = await cm.create(hostSecondary, 'control-chart', {
          values: secondary.series,
          cl: secondary.cl,
          ucl: secondary.ucl,
          lcl: secondary.lcl,
          sigma: 0, // keine Nelson-Zonenbänder auf R/MR — showZones:false ohnehin
          violationIndices: new Set(),
          showZones: false,
          labels: secondary.series.map((_, i) => String(i + 1)),
        });
        if (gen !== this._renderGen) { cm.destroy(c1); cm.destroy(c2); this._charts = []; return; }
        this._charts.push(c2);
      },

      /** Zerstört alle aktuell gemounteten Regelkarten-Charts (idempotent). */
      _destroyCharts() {
        const cm = module._context?.chartManager;
        for (const c of this._charts) { try { cm && cm.destroy(c); } catch { /* ignore */ } }
        this._charts = [];
      },

      /**
       * Bounded rAF-Poll für einen templated Chart-Host innerhalb eines
       * verschachtelten `x-if`-Anker (siehe .claude/alpine.md § 6 / Konvention
       * aus control-chart.js `_whenAnchor`). Bricht ab, sobald ein neuerer
       * Render gestartet wurde (`gen !== this._renderGen`).
       * @param {string} selector
       * @param {number} gen
       * @param {number} [maxFrames]
       * @returns {Promise<Element|null>}
       */
      _whenAnchor(selector, gen, maxFrames = 30) {
        return new Promise((resolve) => {
          const tick = (left) => {
            if (gen !== this._renderGen) { resolve(null); return; }
            const el = module._container ? module._container.querySelector(selector) : null;
            if (el) { resolve(el); return; }
            if (left <= 0) { resolve(null); return; }
            requestAnimationFrame(() => tick(left - 1));
          };
          tick(maxFrames);
        });
      },

      // ── Verletzungs-Tabelle → Chart-Verlinkung (Task 11) ──────

      /**
       * Klick-Handler einer Verletzungs-Tabellenzeile: scrollt die
       * Primär-Regelkarte in den sichtbaren Bereich und markiert die Zeile
       * kurzzeitig per `_highlightedIndex` (Template bindet darüber die
       * `module-msa-typ6__violation-row--active`-Klasse).
       *
       * v1.0-Umsetzung ohne Klick-zu-Punkt-Highlight auf dem Chart selbst:
       * control-chart.js rendert Punkte als reine `<circle>`-Elemente ohne
       * Index-Attribut (kein `data-chart-index` o. Ä.), ein Punkt-Highlight
       * würde also eine Erweiterung des geteilten Chart-Typs voraussetzen —
       * außerhalb dieses Tasks (siehe Task-Brief, Variante c).
       * @param {number} primaryIndex
       */
      _highlight(primaryIndex) {
        const host = module._container?.querySelector('[data-chart-host="primary"]');
        host?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

        this._highlightedIndex = primaryIndex;
        clearTimeout(this._highlightTimer);
        this._highlightTimer = setTimeout(() => { this._highlightedIndex = null; }, 1500);
      },

      // ── ColumnPickers (imperative widgets) ────────────────────

      _mountPickers() {
        const typesByRole = {
          value: ['numeric', 'currency', 'percent'],
          timestamp: ['numeric', 'date'],
          subgroup: undefined, // Untergruppen-Key: jeder Spaltentyp zulässig
        };
        for (const role of PICKER_ROLES) {
          const el = module._container.querySelector(`[data-ref="col-picker-${role}"]`);
          if (!el) continue;
          this._pickers[role]?.destroy();
          this._pickers[role] = new ColumnPicker(el, module._context, {
            mode: 'single',
            types: typesByRole[role],
            onChange: (ref) => {
              this.model.columns[role] = ref;
              this._analyzeNow();
            },
          });
          if (this.model.columns[role]) {
            this._pickers[role].value = this.model.columns[role];
          }
        }
      },

      // ── Lifecycle (per Alpine component) ──────────────────────

      init() {
        // Fresh per-instance collections (das data()-Objekt wird per Alpine.data geteilt).
        this._charts = [];
        this._renderGen = 0;
        this._unsubs = [];
        this._pickers = { timestamp: null, value: null, subgroup: null };
        this._debTimer = null;
        this._lastError = null;
        this._highlightedIndex = null;
        this._highlightTimer = null;

        this._mountPickers();

        const eb = module._context.eventBus;
        const onActivated = ({ instanceId } = {}) => {
          if (!instanceId || instanceId === module._context.instanceId) {
            for (const p of Object.values(this._pickers)) p?.refresh?.();
          }
        };
        const rerun = () => this._analyzeNow();
        const nullOnColumnRemoved = ({ instanceId, columnId } = {}) => {
          let touched = false;
          for (const role of PICKER_ROLES) {
            const r = this.model.columns[role];
            if (r && r.instanceId === instanceId && r.columnId === columnId) {
              this.model.columns[role] = null;
              touched = true;
            }
          }
          if (touched) this._analyzeNow();
        };
        const nullOnWorksheetRemoved = ({ instanceId } = {}) => {
          let touched = false;
          for (const role of PICKER_ROLES) {
            if (this.model.columns[role]?.instanceId === instanceId) {
              this.model.columns[role] = null;
              touched = true;
            }
          }
          if (touched) this._analyzeNow();
        };
        eb.on('module:activated',         onActivated);
        eb.on('worksheet:dataChanged',    rerun);
        eb.on('worksheet:column-removed', nullOnColumnRemoved);
        eb.on('worksheet:removed',        nullOnWorksheetRemoved);
        this._unsubs.push(
          () => eb.off('module:activated',         onActivated),
          () => eb.off('worksheet:dataChanged',    rerun),
          () => eb.off('worksheet:column-removed', nullOnColumnRemoved),
          () => eb.off('worksheet:removed',        nullOnWorksheetRemoved),
        );

        // Ergebnis aus wiederhergestelltem State neu berechnen.
        this._analyzeNow();
      },

      destroy() {
        clearTimeout(this._debTimer);
        clearTimeout(this._highlightTimer);
        for (const unsub of this._unsubs) { try { unsub(); } catch { /* ignore */ } }
        this._unsubs = [];
        for (const p of Object.values(this._pickers)) { try { p?.destroy?.(); } catch { /* ignore */ } }
        this._pickers = { timestamp: null, value: null, subgroup: null };
        this._destroyCharts();
      },
    };
  },
});

export default mod;
