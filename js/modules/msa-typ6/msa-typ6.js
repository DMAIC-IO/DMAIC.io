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
 * Task 8 (dieser Stand): Input-Panel Controls (Kartentyp, drei ColumnPicker,
 * Grenzen-Modus, Nelson-Regeln, α) + debounced Auto-Run (`_analyzeNow()`).
 * Output-Rendering (Verdikt, KPI-Kacheln, Regelkarte, Charts) folgt in
 * Task 9–13.
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
      _unsubs: [],
      _pickers: { timestamp: null, value: null, subgroup: null },
      _debTimer: null,

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
            return;
          }
          try {
            this._lastResult = analyze(inputs);
            this._lastError = null;
          } catch (e) {
            this._lastResult = null;
            this._lastError = e.code;
          }
          this._renderCharts?.(); // Task 10
        }, 120);
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
        this._unsubs = [];
        this._pickers = { timestamp: null, value: null, subgroup: null };
        this._debTimer = null;
        this._lastError = null;

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
        for (const unsub of this._unsubs) { try { unsub(); } catch { /* ignore */ } }
        this._unsubs = [];
        for (const p of Object.values(this._pickers)) { try { p?.destroy?.(); } catch { /* ignore */ } }
        this._pickers = { timestamp: null, value: null, subgroup: null };
        const cm = module._context?.chartManager;
        for (const c of this._charts) { try { cm && cm.destroy(c); } catch { /* ignore */ } }
        this._charts = [];
      },
    };
  },
});

export default mod;
