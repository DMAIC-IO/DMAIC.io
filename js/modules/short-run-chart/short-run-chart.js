/**
 * D.Mike — Short-Run (Z-MR) Control Chart Module (short-run-chart.js)
 *
 * Standardised I-MR for short production runs: each value is rescaled within
 * its part (group) to z = (x − x̄_part) / σ̂_part, then plotted on a single
 * I-MR-style chart. Allows mixing parts with different targets/spreads.
 *
 * Migrated to createModule + Alpine CSP.
 *
 * Architecture:
 *   - Static structure (input panel, ColumnPicker anchors, output placeholders)
 *     lives in the Alpine template (short-run-chart.html).
 *   - Dynamic output (warning, stats KPI strip, chart sections with header +
 *     badge, groups table) is rendered imperatively into the data-ref anchors
 *     because the POM relies on the exact CSS selectors — POM-Byte-Parität.
 *   - Two ColumnPickers are imperative widgets mounted in init(), disposed in destroy().
 *   - chartManager control-charts use _renderGen stale-guard.
 *   - _unsubs collects event-bus subscriptions for cleanup.
 *
 * @agent  Steuerbar über das Viewmodel: Messwert- und Gruppenspalte
 *   (setColumn), neu rechnen (runAnalysis). Gelesen wird über read() mit
 *   erklärter Lesefläche (AgentRead) — Bezüge, Gruppenkennzahlen, Grenzen
 *   der Z- und MR-Karte, Signalpunkte und je Punkt z und MR.
 */

import { createModule } from '../../core/template-module.js';
import { State } from './short-run-chart-model.js';
import {
  ColumnPicker, getColumnValues, getColumnName, refToKey, keyToRef,
} from '../../ui/column-picker.js';
import { computeZMR } from '../../engines/short-run-chart-engine.js';
import { loadWorksheetExample, rewriteRefFields } from '../../core/examples-registry.js';
import { whenAnchor } from '../../core/chart/chart-module-base.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireKnownId } from '../../core/agent/agent-argcheck.js';
import { pickableColumnList } from '../../core/agent/agent-options.js';
import { finiteOrNull, zipPoints } from '../../core/agent/agent-results.js';

/** Die Spalten-Slots in der Reihenfolge der Oberfläche: Messwerte, dann Teile/Gruppen. */
const COLUMN_SLOTS = ['values', 'groups'];

/** Je Slot der Filter seines Wählers — eine Quelle für Wähler und Lesefläche. */
const SLOT_FILTERS = {
  values: { types: ['numeric'], minCount: 4 },
  // Groups can be numeric or text — accept both.
  groups: { types: ['numeric', 'text'], minCount: 4 },
};

/** Je Slot die eine Zuweisungsstelle seines Model-Feldes. */
const COLUMN_SINKS = {
  values: (m, ref) => { m.valuesRef = ref; },
  groups: (m, ref) => { m.groupsRef = ref; },
};

/**
 * Die Agenten-Lesefläche der Kurzserien-Karte (Z-MR).
 *
 * Eingaben (Messwert- und Gruppenspalte), die Mengen von `setColumn`, das
 * Ergebnis als Zahlen (Plan Welle 3 B, E4) und der Hinweis, den die
 * Oberfläche bei übersprungenen Gruppen zeigt. Nicht darin: Kennzahlenleiste
 * und Gruppentabelle als Text, `exampleWorksheetId`.
 *
 * @typedef {object} AgentRead
 * @property {object|null} valuesRef  the measured column (slot `values`), `{ instanceId, sheetId, columnId }`, or null
 * @property {object|null} groupsRef  the part/group column (slot `groups`), or null
 * @property {string[]} activeColumnSlots  the slots `setColumn` accepts
 * @property {object} pickableColumns  per slot the columns `setColumn` accepts, each `{ key, name }`
 * @property {string} warningMsg  the notice about groups that were skipped, or ''
 * @property {object|null} result  `{ n, skipped, groups: [{ group, count, mean, sigma, mrBar }], z: { cl, ucl, lcl }, mr: { cl, ucl, lcl }, signalsZ, signalsMR }` — z per value standardised within its group; signals are point indices; null with fewer than 4 usable pairs
 * @property {object[]} points  [bulk] one row per usable value: `{ z, mr, signalZ, signalMR }`
 */

const mod = createModule({
  config: {
    id: 'short-run-chart',
    engine: 'alpine',
    phase: 'control',
    icon: 'module.short-run-chart',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ──────────────────
      /** @type {import('../../ui/column-picker.js').ColumnPicker|null} */
      _pickerVal: null,
      /** @type {import('../../ui/column-picker.js').ColumnPicker|null} */
      _pickerGrp: null,
      /** @type {Array} — active chart instances */
      _charts: [],
      /** Stale-render guard: incremented before each async chart group */
      _renderGen: 0,
      /** @type {Array} — unsub functions for event-bus listeners */
      _unsubs: [],
      /** Pending-run timer handle (cleared by runAnalysis/destroy) */
      _autoRunTimer: null,
      /** KPI strip (declarative — structured cells, see _renderStats) */
      kpiCells: [],
      /** Warning message (declarative — rendered via x-if/x-text in warning-area) */
      warningMsg: '',
      /** Groups table rows (declarative — structured cells, see _renderGroupsTable) */
      groupRows: [],
      /** Chart sections (declarative — header markup; chart mounted imperatively
       * into the templated host via whenAnchor). See _renderCharts. */
      /** @type {Array<{id:string, title:string, badgeText:string, badgeClass:string}>} */
      chartViews: [],
      /** Das Engine-Ergebnis der letzten Rechnung samt Zahl der Paare, synchron vor dem Zeichnen gesetzt (E3). */
      _lastRun: null,

      // ── Agent surface ─────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       *   — `fields: ['points']` liefert die Punkte vollständig, `rows` schneidet sie zu
       * @returns {AgentRead} Spaltenbezüge, wählbare Mengen und das gerechnete Ergebnis
       */
      read(options) {
        const { result, points, pointsColumns } = this._agentResult();
        return readAgentState('short-run-chart', {
          valuesRef: this.model.valuesRef,
          groupsRef: this.model.groupsRef,
          activeColumnSlots: this.activeColumnSlots(),
          pickableColumns: this.pickableColumns(),
          warningMsg: this.warningMsg,
          result,
          points,
          pointsColumns,
        }, options);
      },

      /** @noagent derived set; der Agent liest sie über read().activeColumnSlots */
      activeColumnSlots() { return [...COLUMN_SLOTS]; },

      /** @noagent derived set; der Agent liest sie über read().pickableColumns */
      pickableColumns() {
        const sm = module._context.stateManager;
        return Object.fromEntries(COLUMN_SLOTS.map(slot => [slot, pickableColumnList(sm, SLOT_FILTERS[slot])]));
      },

      /**
       * Eine Spalte einem Slot zuweisen und neu rechnen.
       * @agent
       * @param {'values'|'groups'} slot der Slot
       * @param {{ instanceId: string, sheetId: string, columnId: string }|null} ref
       *   der Spaltenbezug einer wählbaren Spalte, oder null zum Leeren
       * @returns {Promise<void>}
       * @throws {Error} wenn `slot` unbekannt ist oder die Spalte nicht wählbar
       */
      async setColumn(slot, ref) {
        requireEnum('slot', slot, COLUMN_SLOTS);
        let clean = null;
        if (ref != null) {
          requireEnum('slot', slot, this.activeColumnSlots());
          const keys = this.pickableColumns()[slot].map(c => c.key);
          requireKnownId('ref', refToKey(ref), keys);
          // Normalisierte Form: fremde Eigenschaften des Agentenobjekts bleiben draußen.
          clean = keyToRef(refToKey(ref));
        }
        COLUMN_SINKS[slot](this.model, clean);
        this._pickerOf(slot)?.syncValue(clean);
        await this.runAnalysis();
      },

      /**
       * Mit den aktuellen Eingaben und Spaltenwerten neu rechnen.
       * @agent
       * @returns {Promise<void>}
       */
      async runAnalysis() {
        clearTimeout(this._autoRunTimer);
        await this._runAnalysis();
      },

      /** Der Wähler eines Slots. */
      _pickerOf(slot) { return slot === 'values' ? this._pickerVal : this._pickerGrp; },

      /** Ergebnis und Punkte für read(), aus `_lastRun` (E4). */
      _agentResult() {
        if (!this._lastRun) return { result: null, points: [], pointsColumns: [] };
        const { r, n } = this._lastRun;
        const { rows, columns } = zipPoints({ z: r.z, mr: r.mr }, { signalZ: r.signalsZ, signalMR: r.signalsMR });
        return {
          result: {
            n,
            skipped: r.skipped,
            groups: r.groups.map(g => ({
              group: String(g.group), count: g.count,
              mean: finiteOrNull(g.mean), sigma: finiteOrNull(g.sigma), mrBar: finiteOrNull(g.mrBar),
            })),
            z: { cl: finiteOrNull(r.clZ), ucl: finiteOrNull(r.uclZ), lcl: finiteOrNull(r.lclZ) },
            mr: { cl: finiteOrNull(r.mrBarZ), ucl: finiteOrNull(r.uclMR), lcl: finiteOrNull(r.lclMR) },
            signalsZ: [...r.signalsZ],
            signalsMR: [...r.signalsMR],
          },
          points: rows,
          pointsColumns: columns,
        };
      },

      // ── Analysis ─────────────────────────────────────────────

      async _runAnalysis() {
        const clear = () => {
          this._lastRun = null;
          this._renderGen++;
          this._destroyCharts();
          this.chartViews = [];
          this.warningMsg = '';
          this.kpiCells = [];
          this.groupRows = [];
        };

        if (!this.model.valuesRef || !this.model.groupsRef) { clear(); return; }

        const sm = module._context.stateManager;
        const rawValues = getColumnValues(sm, this.model.valuesRef);
        const rawGroups = getColumnValues(sm, this.model.groupsRef);
        const len = Math.min(rawValues.length, rawGroups.length);

        const values = [];
        const groups = [];
        for (let i = 0; i < len; i++) {
          const v = rawValues[i];
          const g = rawGroups[i];
          if (typeof v === 'number' && !isNaN(v) && g != null && g !== '') {
            values.push(v);
            groups.push(g);
          }
        }
        if (values.length < 4) { clear(); return; }

        const r = computeZMR(values, groups);
        this._lastRun = { r, n: values.length };

        this.warningMsg = r.skipped > 0 ? _t('warningSkipped', { count: r.skipped }) : '';

        this._renderStats(r, values.length);
        await this._renderCharts(r);
        this._renderGroupsTable(r);
      },

      // ── KPI strip (declarative — structured cells, RAW text; x-text escapes) ──

      _renderStats(r, total) {
        const sigCount = r.signalsZ.length + r.signalsMR.length;
        const cls = sigCount === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad';
        const fmt = (v) => Number.isFinite(v) ? v.toFixed(3) : '–';
        this.kpiCells = [
          { value: r.groups.length, label: _t('statGroups'), labelHint: '', sub: _t('statTotal', { total }), mod: '' },
          { value: fmt(r.mrBarZ), label: 'MR̄ (z)', labelHint: '', sub: `UCL_MR ${fmt(r.uclMR)}`, mod: '' },
          { value: sigCount, label: _t('statSignals'), labelHint: '', sub: _t('statOf', { total }), mod: cls },
        ];
      },

      // ── Chart rendering (headers declarative; charts mount into templated hosts) ──

      async _renderCharts(r) {
        this._destroyCharts();

        // Stage boundaries from group transitions (visual divider where the part changes).
        const stageBoundaries = [];
        let cumulative = 0;
        for (let i = 0; i < r.groups.length - 1; i++) {
          cumulative += r.groups[i].count;
          stageBoundaries.push(cumulative);
        }

        const sm = module._context.stateManager;
        const colName = getColumnName(sm, this.model.valuesRef);
        const subcharts = [
          { id: 'z',  values: r.z,  cl: r.clZ,    ucl: r.uclZ, lcl: r.lclZ, sigma: 1,        violations: r.signalsZ,  yLabel: 'z' },
          { id: 'mr', values: r.mr, cl: r.mrBarZ, ucl: r.uclMR, lcl: r.lclMR, sigma: (r.uclMR - r.mrBarZ) / 3, violations: r.signalsMR, yLabel: 'MR (z)' },
        ];

        const gen = ++this._renderGen;

        // Declarative header markup (RAW text — x-text escapes).
        this.chartViews = subcharts.map(sc => {
          const isStable = sc.violations.length === 0;
          return {
            id: sc.id,
            title: _t(`chartTitle_${  sc.id}`, { col: colName }),
            badgeText: isStable ? _t('stable') : _t('unstable', { count: sc.violations.length }),
            badgeClass: isStable ? 'src__badge--stable' : 'src__badge--unstable',
            badgeIcon: isStable ? 'status.ok' : 'status.warning',
          };
        });

        for (const sc of subcharts) {
          const host = await whenAnchor(module, this, `[data-chart-host="${  sc.id  }"]`, gen);
          if (!host) return;

          const chart = await module._context.chartManager.create(host, 'control-chart', {
            editKey: sc.id,
            title: '',
            xLabel: _t('xLabelSample'),
            yLabel: sc.yLabel,
            showLegend: false,
            showTitle: false,
            values: sc.values,
            cl: sc.cl, ucl: sc.ucl, lcl: sc.lcl, sigma: sc.sigma,
            violationIndices: new Set(sc.violations),
            usl: null, lsl: null,
            showZones: sc.id === 'z',
            stageBoundaries,
          });

          if (gen !== this._renderGen) {
            // Stale render — newer one started while awaiting
            try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
            return;
          }

          this._charts.push(chart);
        }
      },

      // ── Groups table (declarative — structured rows, RAW text; x-text escapes) ──

      _renderGroupsTable(r) {
        if (!r.groups.length) { this.groupRows = []; return; }
        const fmt = (v) => Number.isFinite(v) ? v.toFixed(3) : '–';
        this.groupRows = r.groups.map((g) => ({
          group: String(g.group),
          count: g.count,
          mean: fmt(g.mean),
          sigma: fmt(g.sigma),
          mrBar: fmt(g.mrBar),
        }));
      },

      _destroyCharts() {
        for (const c of this._charts) {
          try { module._context.chartManager.destroy(c); } catch { /* ignore */ }
        }
        this._charts = [];
      },

      // ── ColumnPicker (imperative widgets) ────────────────────

      _mountPickers() {
        const valWrap = module._container.querySelector('[data-ref="val-picker"]');
        const grpWrap = module._container.querySelector('[data-ref="grp-picker"]');
        if (valWrap) {
          this._pickerVal = new ColumnPicker(valWrap, module._context, {
            mode: 'single', ...SLOT_FILTERS.values,
            onChange: (ref) => this.setColumn('values', ref),
          });
          if (this.model.valuesRef) this._pickerVal.value = this.model.valuesRef;
        }
        if (grpWrap) {
          this._pickerGrp = new ColumnPicker(grpWrap, module._context, {
            mode: 'single', ...SLOT_FILTERS.groups,
            onChange: (ref) => this.setColumn('groups', ref),
          });
          if (this.model.groupsRef) this._pickerGrp.value = this.model.groupsRef;
        }
      },

      // ── Alpine component lifecycle ────────────────────────────

      /** @noagent lifecycle */
      init() {
        // Fresh per-instance transient collections
        this._unsubs = [];
        this._renderGen = 0;
        this._charts = [];
        this._autoRunTimer = null;
        this._pickerVal = null;
        this._pickerGrp = null;

        this._mountPickers();

        const eb = module._context.eventBus;

        // Refresh pickers when the user switches back to this module
        const onActivated = ({ instanceId }) => {
          if (instanceId === module._context.instanceId) {
            this._pickerVal && this._pickerVal.refresh();
            this._pickerGrp && this._pickerGrp.refresh();
          }
        };
        eb.on('module:activated', onActivated);
        this._unsubs.push(() => eb.off('module:activated', onActivated));

        // Re-render charts on theme change
        const onTheme = () => {
          this._runAnalysis();
        };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

        // Trigger initial analysis from restored state
        this._runAnalysis();
      },

      /** @noagent lifecycle */
      destroy() {
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        clearTimeout(this._autoRunTimer);
        if (this._pickerVal) { this._pickerVal.destroy(); this._pickerVal = null; }
        if (this._pickerGrp) { this._pickerGrp.destroy(); this._pickerGrp = null; }
        this._destroyCharts();
      },
    };
  },
});

/**
 * Custom loadExample: short-run-chart examples ship a full worksheet
 * (`sourceWorksheetData`) and use the literal placeholder `__source__` as the
 * `valuesRef.instanceId` and `groupsRef.instanceId`. On load we provision a
 * fresh worksheet, rewrite each placeholder, then apply state (which re-runs
 * the analysis on the new data).
 *
 * This replaces the generic createModule loadExample because of the worksheet
 * provisioning the generic helper cannot perform.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadWorksheetExample(this, payload, {
    Model: State,
    rewriteRefs: rewriteRefFields(['valuesRef', 'groupsRef']),
  });
};

export default mod;
