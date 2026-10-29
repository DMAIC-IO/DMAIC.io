/**
 * D.Mike — Gage Run Chart Module (gage-run-chart.js)
 *
 * Measure phase: Minitab's "Messverlaufsdiagramm" (Statistik → Qualitäts-
 * werkzeuge → Messsystemanalyse → Messverlaufsdiagramm).
 *
 * Plots every single measurement grouped into one panel per part, coloured and
 * symbolised per appraiser, against a common reference line. Answers at a
 * glance: does one appraiser scatter more than the others, does one sit
 * systematically off-centre, is a particular part unusual?
 *
 * Not the run chart (`run-chart`, Minitab DE "Verlaufsdiagramm") — that one
 * carries a median line and four runs tests and has nothing to do with gages.
 *
 * The Model holds only the persisted inputs (three column refs, display
 * options, the free-text gage block); the grouping is derived transiently in
 * the view from those inputs plus the live worksheet values. The grouping math
 * lives in `js/engines/gage-run-chart-engine.js`.
 *
 * `ChartBase` renders a single plot area, so a wrapped panel grid is built by
 * stacking one chart instance per strip, all sharing a y-domain.
 *
 * @agent  Steuerbar über das Viewmodel: Teil-, Prüfer- und Messwertspalte
 *   (setColumn), Bezugswert, Anordnung, Darstellung, Kopfzeile (setParam),
 *   neu rechnen (runAnalysis). Gelesen wird über read() mit erklärter
 *   Lesefläche (AgentRead) — Eingaben, Gesamtmittel, Bezugslinie, Mittel je
 *   Teil und Prüfer und je Messwert Teil, Prüfer, Wert.
 */

import { createModule } from '../../core/template-module.js';
import { State, DEFAULT_PARTS_PER_ROW } from './gage-run-chart-model.js';

import { ColumnPicker, getColumnValues, getColumnName, refToKey, keyToRef } from '../../ui/column-picker.js';
import { computeGageRunChart, splitPanelRows } from '../../engines/gage-run-chart-engine.js';
import { loadWorksheetExample } from '../../core/examples-registry.js';
import { whenAnchor } from '../../core/chart/chart-module-base.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireBoolean, requireEnum, requireKnownId, requireNumber, requireText } from '../../core/agent/agent-argcheck.js';
import { setAtPath } from '../../core/agent/agent-path.js';
import { pickableColumnList } from '../../core/agent/agent-options.js';
import { finiteOrNull } from '../../core/agent/agent-results.js';

/** Debounce for re-running the analysis after an input change. */
const RERUN_DELAY = 120;

/** Upper bound for the panels-per-strip field — beyond this panels are unreadable. */
const MAX_PARTS_PER_ROW = 20;

/** Die Spalten-Slots in der Reihenfolge der Oberfläche. */
const COLUMN_SLOTS = ['part', 'operator', 'measurement'];

/** Je Slot der Filter seines Wählers — eine Quelle für Wähler und Lesefläche. */
const SLOT_FILTERS = {
  part: {},
  operator: {},
  // Attributive Studien erfassen 0/1-Ergebnisse, darum gehört `binary` dazu.
  measurement: { types: ['numeric', 'binary', 'percent', 'currency'] },
};

/** Die Optionen, die `setParam` annimmt; die fünf Kopfzeilenfelder unter `gageInfo.`. */
const PARAM_KEYS = ['refValue', 'partsPerRow', 'connectWithin', 'showOperatorMean',
  'gageInfo.name', 'gageInfo.date', 'gageInfo.reporter', 'gageInfo.tolerance', 'gageInfo.misc'];

/** Je Option ihr Prüfer; er gibt den Wert in der Form des Models zurück. */
const PARAM_CHECKS = {
  refValue: (v) => requireText('value', v),
  partsPerRow: (v) => requireNumber('value', v, { min: 1, max: MAX_PARTS_PER_ROW, integer: true }),
  connectWithin: (v) => requireBoolean('value', v),
  showOperatorMean: (v) => requireBoolean('value', v),
  'gageInfo.name': (v) => requireText('value', v),
  'gageInfo.date': (v) => requireText('value', v),
  'gageInfo.reporter': (v) => requireText('value', v),
  'gageInfo.tolerance': (v) => requireText('value', v),
  'gageInfo.misc': (v) => requireText('value', v),
};

/**
 * Die Schlüsselfläche von `setParam`. Die Kopfzeilenfelder tragen den Punkt
 * im Schlüssel (im Model unter `gageInfo`). Sätze je Schlüssel unter
 * `types.Params.<schlüssel>` (Punkt = Verschachtelung in i18n), dieselben
 * am Label (Alt-Taste).
 *
 * @typedef {object} Params
 * @property {string} refValue  Bezugslinie, leer für das Gesamtmittel
 * @property {number} partsPerRow  Teile je Streifen
 * @property {boolean} connectWithin  Punkte je Teil verbinden
 * @property {boolean} showOperatorMean  Prüfermittel zeigen
 * @property {string} gageInfo.name  Messmittel
 * @property {string} gageInfo.date  Datum
 * @property {string} gageInfo.reporter  Bearbeiter
 * @property {string} gageInfo.tolerance  Toleranz
 * @property {string} gageInfo.misc  Sonstiges
 */

/**
 * Das gerechnete Ergebnis (`_agentResult()`), wie `read().result` es liefert.
 *
 * @typedef {object} Result
 * @property {number} n  Messwerte
 * @property {number} droppedRows  verworfene Zeilen
 * @property {number} partCount  Teile
 * @property {number} operatorCount  Prüfer
 * @property {string[]} operators  Prüfer in Reihenfolge
 * @property {boolean} hasOperators  Prüferspalte gesetzt
 * @property {number|null} grandMean  Gesamtmittel
 * @property {number|null} refValue  Bezugslinie
 * @property {number|null} yMin  kleinster Messwert
 * @property {number|null} yMax  größter Messwert
 * @property {string[]} warnings  Hinweise
 * @property {CellMean[]} cellMeans  Mittelwert je Teil und Prüfer
 */

/**
 * @typedef {object} CellMean
 * @property {string} part  Teil
 * @property {string} operator  Prüfer
 * @property {number|null} mean  Mittelwert
 */

/**
 * Die Agenten-Lesefläche des Messverlaufsdiagramms (Gage Run Chart).
 *
 * Eingaben (drei Spalten, Bezugswert, Anordnung, zwei Schalter, die
 * Kopfzeile), die Mengen der Setter, das Ergebnis als Zahlen und
 * der Text, den die Oberfläche bei unbrauchbaren Daten zeigt. Nicht
 * darin: Kennzahlenleiste und Warnhinweise als Text, `exampleWorksheetId`.
 *
 * @typedef {object} AgentRead
 * @property {object} columnRefs  per slot (`part`, `operator`, `measurement`) the column `{ instanceId, sheetId, columnId }`, or null
 * @property {string} refValue  the reference line as entered; '' uses the grand mean
 * @property {number} partsPerRow  parts per strip, 1 to 20
 * @property {boolean} connectWithin  join the repeats of one operator within a part
 * @property {boolean} showOperatorMean  mark each operator's mean within a part
 * @property {object} gageInfo  the header lines `{ name, date, reporter, tolerance, misc }` as text
 * @property {string[]} activeColumnSlots  the slots `setColumn` accepts
 * @property {string[]} activeParams  the keys `setParam` accepts
 * @property {object} pickableColumns  per slot the columns `setColumn` accepts, each `{ key, name }`
 * @property {string} errorMsg  why nothing was computed, or ''
 * @property {Result|null} result  the computed result, or null without part and measurement column or usable rows
 * @property {object[]} points  [bulk] one row per measurement in panel order: `{ part, operator, value }` (part and operator as text)
 */
const mod = createModule({
  config: {
    id: 'gage-run-chart',
    engine: 'alpine',
    phase: 'measure',
    icon: 'module.gage-run-chart',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ──────────────────
      /**
       * Derived analysis result for the template, or null. Shape:
       *   { rows: [{ idx, panels }], operators, hasOperators, grandMean,
       *     refValue, n, partCount, operatorCount, warnings, yMin, yMax }
       */
      result: null,
      errorMsg: '',

      _pickers: { part: null, operator: null, measurement: null },
      _charts: [],
      _unsubs: [],
      _rerunTimer: null,
      _renderGen: 0,

      // ── Agent surface ─────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       *   — `fields: ['points']` liefert die Messwerte vollständig, `rows` schneidet sie zu
       * @returns {AgentRead} Eingaben, wählbare Mengen und das gerechnete Ergebnis
       */
      read(options) {
        const m = this.model;
        const { result, points, pointsColumns } = this._agentResult();
        return readAgentState('gage-run-chart', {
          columnRefs: { ...m.columnRefs },
          refValue: m.refValue,
          partsPerRow: m.partsPerRow,
          connectWithin: m.connectWithin,
          showOperatorMean: m.showOperatorMean,
          gageInfo: { ...m.gageInfo },
          activeColumnSlots: this.activeColumnSlots(),
          activeParams: this.activeParams(),
          pickableColumns: this.pickableColumns(),
          errorMsg: this.errorMsg,
          result,
          points,
          pointsColumns,
        }, options);
      },

      /** @noagent derived set; der Agent liest sie über read().activeColumnSlots */
      activeColumnSlots() { return [...COLUMN_SLOTS]; },

      /** @noagent derived set; der Agent liest sie über read().activeParams */
      activeParams() { return [...PARAM_KEYS]; },

      /** @noagent derived set; der Agent liest sie über read().pickableColumns */
      pickableColumns() {
        const sm = module._context.stateManager;
        return Object.fromEntries(COLUMN_SLOTS.map(slot => [slot, pickableColumnList(sm, SLOT_FILTERS[slot])]));
      },

      /**
       * Eine Spalte einer Rolle zuweisen und neu rechnen.
       * @agent
       * @param {'part'|'operator'|'measurement'} slot die Rolle
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
        this.model.columnRefs[slot] = clean;
        this._pickers[slot]?.syncValue(clean);
        await this.runAnalysis();
      },

      /**
       * Eine Option setzen; alles außer der Kopfzeile rechnet neu.
       * @agent
       * @param {keyof Params} key welcher Parameter
       * @param {string|number|boolean} value der Wert; Wertebereich je Schlüssel siehe `Params`
       * @returns {Promise<void>}
       * @throws {Error} wenn `key` unbekannt ist oder `value` ungültig
       */
      async setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        requireEnum('key', key, this.activeParams());
        setAtPath(this.model, key, PARAM_CHECKS[key](value));
        // Die Kopfzeile ist keine Eingabe der Rechnung und hängt an jedem Tastendruck.
        if (!key.startsWith('gageInfo.')) await this.runAnalysis();
      },

      /**
       * Mit den aktuellen Eingaben und Spaltenwerten neu rechnen.
       * @agent
       * @returns {Promise<void>}
       */
      async runAnalysis() {
        clearTimeout(this._rerunTimer);
        await this._runAnalysis();
      },

      /** Ergebnis und Messwerte für read(), aus dem Vorlagenfeld `result`. */
      _agentResult() {
        const r = this.result;
        if (!r) return { result: null, points: [], pointsColumns: [] };
        const panels = r.rows.flatMap(row => row.panels);
        const points = [];
        const cellMeans = [];
        for (const panel of panels) {
          for (const s of panel.series) {
            cellMeans.push({ part: String(panel.part), operator: String(s.operator), mean: finiteOrNull(s.mean) });
            for (const v of s.values) points.push({ part: String(panel.part), operator: String(s.operator), value: finiteOrNull(v) });
          }
        }
        return {
          result: {
            n: r.n,
            droppedRows: r.droppedRows,
            partCount: r.partCount,
            operatorCount: r.operatorCount,
            operators: r.operators.map(String),
            hasOperators: r.hasOperators,
            grandMean: finiteOrNull(r.grandMean),
            refValue: finiteOrNull(r.refValue),
            yMin: finiteOrNull(r.yMin),
            yMax: finiteOrNull(r.yMax),
            warnings: [...r.warnings],
            cellMeans,
          },
          points,
          pointsColumns: ['part', 'operator', 'value'],
        };
      },

      // ── View transformations ──────────────────────────────────

      /** @noagent view transform */
      fmt(v) {
        return Number.isFinite(v) ? v.toFixed(4) : '–';
      },

      /** @noagent view transform */
      gageInfoLabel(key) {
        return _t(`gageInfo_${key}`);
      },

      /**
       * Empty string keeps the row hidden via `x-show`.
       * @noagent view transform
       */
      gageInfoValue(key) {
        return this.model.gageInfo[key] || '';
      },

      /** @noagent view transform */
      hasWarnings() {
        return Boolean(this.result) && this.result.warnings.length > 0;
      },

      /** @noagent view transform */
      warningText(code) {
        if (code === 'droppedRows') {
          return _t('warnDroppedRows', { count: this.result.droppedRows });
        }
        return _t(`warn_${code}`);
      },

      /** @noagent view transform */
      refLabel() {
        return this.model.refValue.trim() === '' ? _t('refMean') : _t('refCustom');
      },

      /**
       * Sub-line of the reference KPI. Repeating the grand mean under the
       * "Mean" label would say the same thing twice, so the default case shows
       * the data span instead.
       * @noagent view transform
       */
      refSubText() {
        const r = this.result;
        if (!r) return '';
        return this.model.refValue.trim() === ''
          ? _t('statSpan', { min: this.fmt(r.yMin), max: this.fmt(r.yMax) })
          : _t('statGrandMean', { v: this.fmt(r.grandMean) });
      },

      /** @noagent view transform */
      chartTitle() {
        const col = getColumnName(module._context.stateManager, this.model.columnRefs.measurement);
        return _t('chartTitle', { col });
      },

      // ── Event handlers ─────────────────────────────────────────

      /**
       * @noagent DOM event handler; the agent uses setParam()
       * @param {Event} event die Änderung des Bezugswerts
       */
      async refValueChanged(event) {
        await this.setParam('refValue', String(event.target.value));
      },

      /**
       * @noagent DOM event handler; the agent uses setParam()
       * @param {Event} event die Änderung der Teile je Zeile
       */
      async partsPerRowChanged(event) {
        const v = parseInt(event.target.value, 10);
        // Wie bisher: über 20 wird 20, Ungültiges wird 7 — vor der Senke.
        await this.setParam('partsPerRow', (Number.isFinite(v) && v >= 1)
          ? Math.min(v, MAX_PARTS_PER_ROW)
          : DEFAULT_PARTS_PER_ROW);
        event.target.value = String(this.model.partsPerRow);
      },

      // ── Analysis ───────────────────────────────────────────────

      _scheduleRerun() {
        clearTimeout(this._rerunTimer);
        this._rerunTimer = setTimeout(() => this._runAnalysis(), RERUN_DELAY);
      },

      _runAnalysis() {
        const clear = (msg = '') => {
          this._destroyCharts();
          this.result = null;
          this.errorMsg = msg;
        };

        const refs = this.model.columnRefs;
        if (!refs.part || !refs.measurement) return clear();

        const sm = module._context.stateManager;
        const parts = getColumnValues(sm, refs.part);
        const measurements = getColumnValues(sm, refs.measurement);
        const operators = refs.operator ? getColumnValues(sm, refs.operator) : null;

        let r;
        try {
          r = computeGageRunChart({ parts, operators, measurements });
        } catch (err) {
          return clear(String(err.message || err));
        }
        if (r.n === 0) return clear(_t('errNoData'));

        const rows = splitPanelRows(r.panels, this.model.partsPerRow)
          .map((panels, idx) => ({ idx, panels }));

        this.result = {
          rows,
          operators: r.operators,
          hasOperators: r.hasOperators,
          grandMean: r.grandMean,
          refValue: this.model.resolveRefValue(r.grandMean),
          n: r.n,
          droppedRows: r.droppedRows,
          partCount: r.parts.length,
          operatorCount: r.hasOperators ? r.operators.length : 0,
          warnings: r.warnings,
          yMin: r.yMin,
          yMax: r.yMax,
        };
        this.errorMsg = '';

        const gen = ++this._renderGen;
        this.$nextTick(() => this._renderStrips(this.result, gen));
      },

      // ── SVG strips (imperative via chartManager) ──────────────

      /**
       * Render one chart instance per strip. All strips share the y-domain and
       * the reference line so the rows stay comparable; only the first strip
       * carries the y-axis title and only the last one the x-axis title.
       * @param {object} res
       * @param {number} gen — stale-render guard
       */
      async _renderStrips(res, gen) {
        this._destroyCharts();
        const measurementName = getColumnName(
          module._context.stateManager, this.model.columnRefs.measurement,
        );
        const partName = getColumnName(module._context.stateManager, this.model.columnRefs.part);

        for (const row of res.rows) {
          const host = await this.whenAnchor(`[data-strip="${row.idx}"]`, gen);
          if (!host || gen !== this._renderGen) return;
          host.replaceChildren();

          const isLast = row.idx === res.rows.length - 1;
          const chart = await module._context.chartManager.create(host, 'gage-run-chart', {
            title: '',
            showTitle: false,
            xLabel: isLast ? partName : '',
            showXLabel: isLast,
            yLabel: measurementName,
            // Every strip reserves legend space, otherwise the strips end up
            // different widths and their panels stop lining up across rows.
            showLegend: res.hasOperators,
            panels: row.panels,
            operators: res.operators,
            refValue: res.refValue,
            refLabel: this.refLabel(),
            showOperatorMean: this.model.showOperatorMean,
            connectWithin: this.model.connectWithin,
            sharedYMin: res.yMin,
            sharedYMax: res.yMax,
          });
          if (gen !== this._renderGen) {
            try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
            return;
          }
          this._charts.push(chart);
        }
      },

      /** @noagent helper */
      whenAnchor(selector, gen, maxFrames = 30) {
        return whenAnchor(module, this, selector, gen, maxFrames);
      },

      _destroyCharts() {
        for (const c of this._charts) {
          try { module._context.chartManager.destroy(c); } catch { /* ignore */ }
        }
        this._charts = [];
      },

      // ── ColumnPickers (imperative widgets) ────────────────────

      _mountPickers() {
        const wraps = { part: 'col-part-wrap', operator: 'col-operator-wrap', measurement: 'col-measurement-wrap' };
        for (const role of COLUMN_SLOTS) {
          const el = module._container.querySelector(`[data-ref="${wraps[role]}"]`);
          if (!el) continue;
          this._pickers[role]?.destroy();
          this._pickers[role] = new ColumnPicker(el, module._context, {
            mode: 'single',
            ...SLOT_FILTERS[role],
            onChange: (ref) => this.setColumn(role, ref),
          });
          if (this.model.columnRefs[role]) this._pickers[role].value = this.model.columnRefs[role];
        }
      },

      // ── Lifecycle (per Alpine component) ──────────────────────

      /** @noagent lifecycle */
      init() {
        this._unsubs = [];
        this._charts = [];
        this._renderGen = 0;
        this._rerunTimer = null;
        this._pickers = { part: null, operator: null, measurement: null };

        this._mountPickers();

        const eb = module._context.eventBus;
        const onActivated = ({ instanceId }) => {
          if (instanceId === module._context.instanceId) {
            for (const p of Object.values(this._pickers)) p?.refresh();
          }
        };
        eb.on('module:activated', onActivated);
        this._unsubs.push(() => eb.off('module:activated', onActivated));

        // Chart colours come from CSS custom properties — re-render on theme flip.
        const onTheme = () => {
          if (this.result) this._renderStrips(this.result, ++this._renderGen);
        };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

        this._runAnalysis();
      },

      /** @noagent lifecycle */
      destroy() {
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        clearTimeout(this._rerunTimer);
        for (const p of Object.values(this._pickers)) p?.destroy();
        this._pickers = { part: null, operator: null, measurement: null };
        this._destroyCharts();
      },
    };
  },
});

/**
 * Custom loadExample: gage-run-chart catalog examples ship a full worksheet
 * (`sourceWorksheetData`) and use the literal placeholder `__source__` as the
 * instanceId on all three column refs. On load we provision a fresh worksheet,
 * rewrite the placeholders, then apply state (which re-runs the analysis).
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadWorksheetExample(this, payload, {
    Model: State,
    // `loadWorksheetExample` discards the return value — mutate `data` in place.
    rewriteRefs(data, oldId, newId) {
      if (!data.columnRefs) return data;
      for (const key of ['part', 'operator', 'measurement']) {
        const r = data.columnRefs[key];
        if (r && r.instanceId === oldId) {
          data.columnRefs[key] = { ...r, instanceId: newId };
        }
      }
      return data;
    },
  });
};

export default mod;
