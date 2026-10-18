/**
 * D.Mike — Data Transformation Module (data-transformation.js)
 * Data phase: transforms data using Box-Cox, Yeo-Johnson, Johnson SU/SB,
 * logarithm, sqrt, inverse, and square transformations.
 * Displays before/after histograms, probability plots, descriptive stats,
 * and Anderson-Darling normality tests.
 *
 * Migrated to createModule + Alpine CSP. The Model (data-transformation-model.js)
 * holds only the selected transform, the referenced source column and the
 * provisioned-example worksheet id. Raw/transformed series, charts and stats are
 * derived transiently in the view. ColumnPicker and the SVG charts are mounted
 * imperatively (they are not pure-template concerns) following the msa-typ1
 * pattern.
 *
 * 🔴 CROSS-MODULE CONTRACT: emits `worksheet:appendColumn` to push transformed
 * columns into the Worksheet module — preserved byte-identically below.
 *
 * @agent  Steuerbar über das Viewmodel: Transformation wählen (selectTF),
 *   Quellspalte setzen (setColumn), Parameter setzen (setParam), rechnen
 *   (runAnalysis) und das Ergebnis an einen neuen oder bestehenden
 *   Worksheet senden (toWorksheet). Zwischenablage und CSV-Download bleiben
 *   der Oberfläche vorbehalten; gelesen wird über read() (AgentRead).
 */

import { openNewWorksheet } from '../../core/worksheet-handoff.js';
import { toNum } from '../../core/chart/chart-data-prep.js';
import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireKnownId, requireNumber } from '../../core/agent/agent-argcheck.js';
import { pickableColumnList, targetColumnList } from '../../core/agent/agent-options.js';
import {
  State, TRANSFORMS, TRANSFORM_IDS, applyTransform, optimizeBoxCox, optimizeYeoJohnson,
} from './data-transformation-model.js';
import {
  ColumnPicker, getColumnValues, getColumnName, refToKey, keyToRef,
} from '../../ui/column-picker.js';
import { mean, std, median, skewness, kurtosis } from '../../engines/distribution-fit-engine.js';
import { andersonDarling } from '../../engines/normality-test-engine.js';
import { provisionWorksheet, removeProvisionedWorksheet } from '../../core/examples-registry.js';

const AUTORUN_DELAY = 80;
const ALPHA = 0.05;

/** Alle Parameterschlüssel aller Transformationen; `activeParams` nennt die des aktuellen Zustands. */
const PARAM_KEYS = ['lambda', 'gamma', 'delta', 'xi', 'lambdaJ'];
const COLUMN_SLOTS = ['source'];
const SLOT_FILTERS = { source: { types: ['numeric'], minCount: 3 } };
const TARGET_FILTER = {};

/** Build the transient param rows for a transform id (with default values). */
function paramRowsFor(tfId) {
  const tf = TRANSFORMS.find(t => t.id === tfId);
  return tf.params.map(p => ({ ...p, val: String(p.val) }));
}

/**
 * Die Schlüsselfläche von `setParam`; welche Schlüssel gelten, hängt von der
 * Transformation ab (`activeParams`, mit Bereich). Sätze je Schlüssel unter
 * `types.Params.<schlüssel>`, dieselben am Label (Alt-Taste).
 *
 * @typedef {object} Params
 * @property {number} [lambda]  λ, Box-Cox und Yeo-Johnson
 * @property {number} [gamma]  γ, Johnson
 * @property {number} [delta]  δ, Johnson
 * @property {number} [xi]  ξ, Johnson
 * @property {number} [lambdaJ]  λ, Johnson
 */

/**
 * Das gerechnete Ergebnis (`_agentResult()`), wie `read().result` es liefert.
 *
 * @typedef {object} Result
 * @property {number} n  Werte
 * @property {Descriptives} original  Kennwerte vorher
 * @property {Descriptives} transformed  Kennwerte nachher
 */

/**
 * @typedef {object} Descriptives
 * @property {number|null} mean  Mittelwert
 * @property {number|null} std  Standardabweichung
 * @property {number|null} median  Median
 * @property {number|null} skewness  Schiefe
 * @property {number|null} kurtosis  Exzess-Wölbung
 * @property {number|null} min  Minimum
 * @property {number|null} max  Maximum
 * @property {number|null} adPValue  p-Wert Anderson-Darling
 */

/**
 * Die Agenten-Lesefläche von Datentransformation.
 *
 * Die Parameter leben nur flüchtig in `paramRows` und werden beim Wechsel der
 * Transformation und — bei λ — beim Wechsel der Spalte neu belegt; persistiert
 * sind nur Transformation und Quelle. Die Lesefläche zeigt die Zahlen, nicht
 * die Eingabetexte.
 *
 * @typedef {object} AgentRead
 * @property {string} currentTF  the selected transformation, one of `transforms`
 * @property {string[]} transforms  all transformation ids
 * @property {{ instanceId: string, sheetId: string, columnId: string }|null} columnRef  the source column
 * @property {Params} params  the parameters of the current transformation by key
 * @property {Array<{ key: string, min: number, max: number }>} activeParams  the keys `setParam` accepts now, with their range
 * @property {string[]} activeColumnSlots  the slots `setColumn` accepts
 * @property {object} pickableColumns  per slot the columns `setColumn` accepts, each `{ key, name }`
 * @property {Array<{ key: string, name: string }>} targetColumns  the targets `toWorksheet` accepts: per sheet its columns, then a `instanceId|sheetId|__new__` entry that appends a new column; null targets a new worksheet
 * @property {Result|null} result  descriptive statistics and Anderson-Darling p of both series, null without a result
 * @property {string} errorMsg  the message the module shows, '' without error
 */
const mod = createModule({
  config: {
    id: 'data-transformation',
    engine: 'alpine',
    phase: 'data',
    icon: 'module.data-transformation',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Static data ───────────────────────────────────────────
      transforms: TRANSFORMS,

      // ── Transient view state (not persisted) ──────────────────
      paramRows: [],
      rawData: [],
      transData: [],
      hasResults: false,
      errorMsg: '',
      exportText: '',
      statRows: [],
      _norm: { orig: null, trans: null },
      _picker: null,
      _targetPicker: null,
      _charts: {},
      _unsubs: [],
      _autoRunTimer: null,
      _lastColumnKey: null,
      _renderGen: 0,

      // ── Agent surface ─────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Transformation, Quelle, Parameter, wählbare Mengen und Ergebnis
       */
      read(options) {
        return readAgentState('data-transformation', {
          currentTF: this.model.currentTF,
          transforms: TRANSFORM_IDS,
          columnRef: this.model.columnRef,
          params: Object.fromEntries(this.paramRows.map(p => [p.key, this.paramFn(p.key)])),
          activeParams: this.activeParams(),
          activeColumnSlots: this.activeColumnSlots(),
          pickableColumns: this.pickableColumns(),
          targetColumns: this.targetColumns(),
          result: this.hasResults ? this._agentResult() : null,
          errorMsg: this.errorMsg,
        }, options);
      },
      /** @noagent derived set; der Agent liest sie über read().activeParams */
      activeParams() {
        return this.paramRows.map(p => ({ key: p.key, min: p.min, max: p.max }));
      },
      /** @noagent derived set; der Agent liest sie über read().activeColumnSlots */
      activeColumnSlots() { return COLUMN_SLOTS; },
      /** @noagent derived set; der Agent liest sie über read().pickableColumns */
      pickableColumns() {
        return { source: pickableColumnList(module._context.stateManager, SLOT_FILTERS.source) };
      },
      /** @noagent derived set; der Agent liest sie über read().targetColumns */
      targetColumns() {
        return targetColumnList(module._context.stateManager, TARGET_FILTER);
      },

      /**
       * Die Quellspalte setzen und sofort rechnen.
       * @agent
       * @param {'source'} slot der Slot; dieses Modul führt nur `source`
       * @param {{ instanceId: string, sheetId: string, columnId: string }|null} ref
       *   der Spaltenbezug einer wählbaren Spalte, oder null zum Leeren
       * @returns {void}
       * @throws {Error} wenn `slot` unbekannt ist oder die Spalte nicht wählbar
       */
      setColumn(slot, ref) {
        requireEnum('slot', slot, COLUMN_SLOTS);
        if (ref == null) {
          this.model.columnRef = null;
          this._picker?.syncValue(null);
          this.runAnalysis();
          return;
        }
        requireEnum('slot', slot, this.activeColumnSlots());
        requireKnownId('ref', refToKey(ref), this.pickableColumns()[slot].map(c => c.key));
        // Normalisierte Form: fremde Eigenschaften des Agentenobjekts bleiben draußen.
        const clean = keyToRef(refToKey(ref));
        this.model.columnRef = clean;
        this._picker?.syncValue(clean);
        this.runAnalysis();
      },

      /**
       * Einen Parameter der aktuellen Transformation setzen; die Rechnung folgt verzögert.
       * @agent
       * @param {keyof Params} key welcher Parameter; `activeParams` nennt die im aktuellen Zustand gültigen
       * @param {number|string} value Zahl im Bereich aus `activeParams`; Textzahlen werden angenommen
       * @returns {void}
       * @throws {Error} wenn `key` zur aktuellen Transformation nicht passt oder `value` außerhalb des Bereichs liegt
       */
      setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        requireEnum('key', key, this.activeParams().map(p => p.key));
        const row = this.paramRows.find(p => p.key === key);
        const n = requireNumber('value', value, { min: row.min, max: row.max });
        row.val = String(n);
        this._autoRun();
      },

      /** @noagent DOM event handler; the agent uses setParam(). Eine abgewiesene Eingabe springt auf den gehaltenen Wert zurück. */
      onParamInput(key, event) {
        try {
          this.setParam(key, event.target.value);
        } catch {
          const row = this.paramRows.find(p => p.key === key);
          event.target.value = row ? row.val : '';
        }
      },

      // ── View transformations (i18n / css) ─────────────────────

      /** @noagent view transform */
      tfName: (id) => _t(TRANSFORMS.find(t => t.id === id).nameKey),
      /** @noagent view transform */
      tfDesc: (id) => _t(TRANSFORMS.find(t => t.id === id).descKey),
      /** @noagent view transform */
      tfOptClass(id) { return this.model.currentTF === id ? 'dt-tf-opt--active' : ''; },
      /** @noagent view transform */
      paramLabel: (key) => _t(key),

      // ── Normality view helpers ────────────────────────────────

      /** @noagent view transform */
      normLabel: (which) => `${_t(which === 'original' ? 'original' : 'transformed')  }:`,
      /** @noagent view transform */
      normStat(slot) {
        const ad = this._norm[slot];
        if (!ad) return '—';
        return `A² = ${ad.statisticAdj.toFixed(4)}, p ≈ ${ad.pValue.toFixed(4)}`;
      },
      /** @noagent view transform */
      normHasBadge(slot) { return Boolean(this._norm[slot]); },
      /** @noagent view transform */
      normBadgeClass(slot) {
        const ad = this._norm[slot];
        if (!ad) return '';
        return ad.pValue >= ALPHA ? 'dt-badge--pass' : 'dt-badge--fail';
      },
      /** @noagent view transform */
      normBadgeIcon(slot) {
        const ad = this._norm[slot];
        if (!ad) return null;
        return ad.pValue >= ALPHA ? 'status.ok' : 'status.error';
      },
      /** @noagent view transform */
      normBadgeText(slot) {
        const ad = this._norm[slot];
        if (!ad) return '';
        return ad.pValue >= ALPHA ? _t('normal') : _t('notNormal');
      },
      /** @noagent view transform */
      normAlpha: () => `α = ${ALPHA} | H₀: ${_t('h0Normal')}`,

      // ── Param handling ────────────────────────────────────────

      /** @noagent helper; liest den aktuellen Parameterwert als Zahl */
      paramFn(key) {
        const row = this.paramRows.find(p => p.key === key);
        return row ? parseFloat(row.val) : 0;
      },

      // ── Transform selection ───────────────────────────────────

      /**
       * Die Transformation wählen und sofort rechnen.
       * @agent
       * @param {string} id eine der Transformationen aus `transforms`
       * @returns {void}
       * @throws {Error} wenn `id` keine Transformation dieses Moduls ist
       */
      selectTF(id) {
        requireEnum('id', id, TRANSFORM_IDS);
        this.model.currentTF = id;
        this.paramRows = paramRowsFor(id);
        // Re-optimize λ when switching to a λ-transform (only if data present)
        if (this.rawData.length >= 3 && (id === 'boxcox' || id === 'yeojohnson')) {
          this._optimizeLambda();
        }
        this.runAnalysis();
      },

      /** Switch transform type without triggering another autoRun cycle. */
      _selectTFSilent(id) {
        this.model.currentTF = id;
        this.paramRows = paramRowsFor(id);
      },

      // ── Transform execution ───────────────────────────────────

      _autoRun() {
        clearTimeout(this._autoRunTimer);
        this._autoRunTimer = setTimeout(() => this.runAnalysis(), AUTORUN_DELAY);
      },

      /**
       * Rechnet die Transformation mit der aktuellen Quelle und den aktuellen
       * Parametern. Weniger als drei endliche Werte lassen `result` auf null —
       * keine Absage.
       * @agent
       * @returns {void}
       */
      runAnalysis() {
        clearTimeout(this._autoRunTimer);
        const ref = this.model.columnRef;
        if (!ref) { this._clearOutput(); return; }

        const colKey = refToKey(ref);
        const columnChanged = colKey !== this._lastColumnKey;
        this._lastColumnKey = colKey;

        const values = getColumnValues(module._context.stateManager, ref);
        this.rawData = values
          .map(toNum)
          .filter(v => isFinite(v));

        if (this.rawData.length < 3) { this._clearOutput(); return; }

        // Auto-fallback: Box-Cox → Yeo-Johnson if data has non-positive values
        if (this.model.currentTF === 'boxcox' && this.rawData.some(x => x <= 0)) {
          this._selectTFSilent('yeojohnson');
          module._context.notify?.(_t('warnBoxCoxFallback'), 'warning');
          this._optimizeLambda();
        } else if (columnChanged && (this.model.currentTF === 'boxcox' || this.model.currentTF === 'yeojohnson')) {
          this._optimizeLambda();
        }

        try {
          this.transData = applyTransform(this.rawData, this.model.currentTF, (k) => this.paramFn(k));
        } catch (err) {
          this._showError(err.message || 'error');
          return;
        }

        this._renderResults();
      },

      /** Auto-optimize λ for the current transform and set it in the param row. */
      _optimizeLambda() {
        const optLam = this.model.currentTF === 'boxcox'
          ? optimizeBoxCox(this.rawData)
          : optimizeYeoJohnson(this.rawData);
        const row = this.paramRows.find(p => p.key === 'lambda');
        if (row) row.val = String(optLam);
      },

      _clearOutput() {
        this._destroyCharts();
        this._destroyTargetPicker();
        this.rawData = [];
        this.transData = [];
        this.statRows = [];
        this._norm = { orig: null, trans: null };
        this.exportText = '';
        this.errorMsg = '';
        this.hasResults = false;
      },

      _showError(msgKey) {
        this._destroyCharts();
        this._destroyTargetPicker();
        this.rawData = [];
        this.transData = [];
        this.statRows = [];
        this._norm = { orig: null, trans: null };
        this.exportText = '';
        this.hasResults = false;
        const msg = module._context.i18n.t(`modules.data-transformation.${msgKey}`);
        this.errorMsg = (msg !== `modules.data-transformation.${msgKey}`) ? msg : msgKey;
      },

      // ── Results rendering ─────────────────────────────────────

      _renderResults() {
        this.errorMsg = '';
        this._buildStats();
        this._buildNormality();
        this._buildExport();
        this.hasResults = true;
        // Charts + target picker live in DOM created by x-if; mount after tick.
        const gen = ++this._renderGen;
        this.$nextTick(() => {
          if (gen !== this._renderGen) return;
          this._drawCharts(gen);
          this._mountTargetPicker();
        });
      },

      _buildStats() {
        const fmt = v => isFinite(v) ? v.toFixed(4) : '—';
        const raw = this.rawData;
        const trans = this.transData;
        this.statRows = [
          { label: 'n', orig: String(raw.length), trans: String(trans.length) },
          { label: _t('statMean'), orig: fmt(mean(raw)), trans: fmt(mean(trans)) },
          { label: _t('statStd'), orig: fmt(std(raw)), trans: fmt(std(trans)) },
          { label: _t('statMedian'), orig: fmt(median(raw)), trans: fmt(median(trans)) },
          { label: _t('statSkewness'), orig: fmt(skewness(raw)), trans: fmt(skewness(trans)) },
          { label: _t('statKurtosis'), orig: fmt(kurtosis(raw)), trans: fmt(kurtosis(trans)) },
          { label: 'Min', orig: fmt(Math.min(...raw)), trans: fmt(Math.min(...trans)) },
          { label: 'Max', orig: fmt(Math.max(...raw)), trans: fmt(Math.max(...trans)) },
        ];
      },

      _buildNormality() {
        let adOrig, adTrans;
        try { adOrig = andersonDarling(this.rawData); } catch { adOrig = null; }
        try { adTrans = andersonDarling(this.transData); } catch { adTrans = null; }
        this._norm = { orig: adOrig, trans: adTrans };
      },

      /** Zahlen für die Lesefläche: Kennwerte und Anderson-Darling-p beider Reihen. */
      _agentResult() {
        const num = v => (isFinite(v) ? v : null);
        const describe = (arr, ad) => ({
          mean: num(mean(arr)),
          std: num(std(arr)),
          median: num(median(arr)),
          skewness: num(skewness(arr)),
          kurtosis: num(kurtosis(arr)),
          min: num(Math.min(...arr)),
          max: num(Math.max(...arr)),
          adPValue: ad?.pValue ?? null,
        });
        return {
          n: this.rawData.length,
          original: describe(this.rawData, this._norm.orig),
          transformed: describe(this.transData, this._norm.trans),
        };
      },

      _buildExport() {
        this.exportText = this.transData.map(v => v.toFixed(6)).join('\n');
      },

      async _drawCharts(gen) {
        const cm = module._context.chartManager;
        if (!cm) return;
        this._destroyCharts();
        const root = module._container;
        const elHistOrig = root.querySelector('[data-ref="chart-hist-orig"]');
        const elHistTrans = root.querySelector('[data-ref="chart-hist-trans"]');
        const elPpOrig = root.querySelector('[data-ref="chart-pp-orig"]');
        const elPpTrans = root.querySelector('[data-ref="chart-pp-trans"]');
        if (!elHistOrig || !elHistTrans || !elPpOrig || !elPpTrans) return;

        try {
          this._charts.histOrig = await cm.create(elHistOrig, 'histogram', { data: this.rawData });
          if (gen !== this._renderGen) { this._destroyCharts(); return; }
          this._charts.histTrans = await cm.create(elHistTrans, 'histogram', { data: this.transData });
          if (gen !== this._renderGen) { this._destroyCharts(); return; }
          this._charts.ppOrig = await cm.create(elPpOrig, 'probability-plot', { data: this.rawData });
          if (gen !== this._renderGen) { this._destroyCharts(); return; }
          this._charts.ppTrans = await cm.create(elPpTrans, 'probability-plot', { data: this.transData });
          if (gen !== this._renderGen) { this._destroyCharts();  }
        } catch (err) {
          console.warn('[DataTransformation] Chart creation failed:', err);
        }
      },

      _destroyCharts() {
        Object.values(this._charts).forEach(c => {
          try { c.destroy(); } catch { /* ignore */ }
        });
        this._charts = {};
      },

      // ── Export actions ────────────────────────────────────────

      /** @noagent clipboard; an agent reads the data via read() */
      copyExport() {
        navigator.clipboard.writeText(this.exportText).then(() => {
          module._context.notify?.(_t('copied'), 'success');
        });
      },

      /** @noagent downloads a file; an agent reads the data via read() */
      downloadCSV() {
        if (!this.transData.length) return;
        let csv = `${_t('original')};${_t('transformed')}\n`;
        for (let i = 0; i < this.rawData.length; i++) {
          csv += `${this.rawData[i]};${this.transData[i]}\n`;
        }
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'transformation.csv';
        a.click();
        URL.revokeObjectURL(a.href);
      },

      _colName() {
        const ref = this.model.columnRef;
        const srcName = ref ? getColumnName(module._context.stateManager, ref) : '';
        const tfDef = TRANSFORMS.find(tf => tf.id === this.model.currentTF);
        const tfName = _t(tfDef.nameKey);
        return srcName ? `${srcName} (${tfName})` : tfName;
      },

      // 🔴 CROSS-MODULE CONTRACT — preserved byte-identically
      /**
       * Die transformierte Spalte an einen neuen oder bestehenden Worksheet senden.
       * @agent
       * @param {{ instanceId: string, sheetId: string, columnId: string }|null} target
       *   null für einen neuen Worksheet, sonst ein Spaltenbezug aus `targetColumns`;
       *   columnId `'__new__'` hängt eine neue Spalte an das Blatt an
       * @returns {Promise<{ instanceId: string }|null>} der empfangende Worksheet, oder null ohne Ergebnis
       * @throws {Error} wenn `target` keine wählbare Spalte ist
       */
      async toWorksheet(target) {
        if (target != null) {
          requireKnownId('target', refToKey(target), this.targetColumns().map(c => c.key));
        }
        if (!this.transData.length) return null;
        const name = this._colName();
        const values = [...this.transData];
        if (target == null) {
          return { instanceId: await this._createWorksheetAndSend(name, values) };
        }
        const clean = keyToRef(refToKey(target));
        module._context.eventBus.emit('worksheet:appendColumn', {
          instanceId: clean.instanceId,
          sheetId: clean.sheetId,
          colId: clean.columnId,
          name, values,
        });
        module._context.notify?.(_t('sentToWorksheet'), 'success');
        return { instanceId: clean.instanceId };
      },

      /** @noagent DOM event handler; the agent uses toWorksheet() */
      async onToWorksheet() {
        const v = this._targetPicker?.value;
        if (!v) {
          module._context.notify?.(_t('selectTarget'), 'warning');
          return;
        }
        try {
          await this.toWorksheet(v === ColumnPicker.NEW_WORKSHEET ? null : v);
        } catch (err) {
          module._context.notify?.(err?.message ?? String(err), 'error');
        }
      },

      async _createWorksheetAndSend(name, values) {
        const ctx = module._context;
        const wsId = await openNewWorksheet(ctx, {
          sheetName: ctx.i18n.t('modules.worksheet.defaultSheetName'),
        });
        ctx.eventBus.emit('worksheet:appendColumn', {
          instanceId: wsId,
          sheetId: 'sheet_1',
          colId: '__first__',
          name, values,
        });
        ctx.notify?.(_t('sentToWorksheet'), 'success');
        return wsId;
      },

      // ── ColumnPickers (imperative widgets) ────────────────────

      _mountPicker() {
        const wrap = module._container.querySelector('[data-ref="col-picker-wrap"]');
        if (!wrap) return;
        this._picker?.destroy();
        this._picker = new ColumnPicker(wrap, module._context, {
          mode: 'single',
          ...SLOT_FILTERS.source,
          onChange: (ref) => this.setColumn('source', ref),
        });
        if (this.model.columnRef) this._picker.value = this.model.columnRef;
      },

      _mountTargetPicker() {
        const wrap = module._container.querySelector('[data-ref="target-wrap"]');
        if (!wrap) return;
        this._destroyTargetPicker();
        this._targetPicker = new ColumnPicker(wrap, module._context, {
          mode: 'single',
          allowCreateWorksheet: true,
          ...TARGET_FILTER,
          onChange: () => {},
        });
      },

      _destroyTargetPicker() {
        this._targetPicker?.destroy();
        this._targetPicker = null;
      },

      // ── Lifecycle ─────────────────────────────────────────────

      /** @noagent lifecycle */
      init() {
        // Fresh per-instance collections (the data() object is shared by Alpine.data).
        this._charts = {};
        this._unsubs = [];
        this.paramRows = paramRowsFor(this.model.currentTF);

        this._mountPicker();

        const eb = module._context.eventBus;
        const onActivated = ({ instanceId }) => {
          if (instanceId === module._context.instanceId) this._picker?.refresh();
        };
        eb.on('module:activated', onActivated);
        this._unsubs.push(() => eb.off('module:activated', onActivated));

        const onTheme = () => {
          if (this.hasResults) this._drawCharts(++this._renderGen);
        };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

        // Recompute from restored state (columnRef may be set).
        if (this.model.columnRef) this._autoRun();
      },

      /** @noagent lifecycle */
      destroy() {
        clearTimeout(this._autoRunTimer);
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        this._destroyCharts();
        this._picker?.destroy();
        this._picker = null;
        this._destroyTargetPicker();
        this.rawData = [];
        this.transData = [];
      },
    };
  },
});

/**
 * Custom loadExample: data-transformation examples ship a full worksheet
 * (`sourceWorksheetData`) and use the literal placeholder `__source__` as the
 * `columnRef.instanceId`. We provision a fresh worksheet, apply currentTF and
 * the rewritten columnRef, re-run, then sync the picker.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = async function loadExample(payload) {
  if (!payload || !payload.data) return;
  const ctx = this._context;
  const t = (k) => ctx.i18n.t(k);

  const current = this.getState();
  const currentModel = current ? State.fromJSON(current) : null;
  if (currentModel?.hasContent() && ctx?.dialog) {
    const ok = await ctx.dialog.confirm({ message: t('moduleHelp.confirmOverwrite'), danger: true });
    if (!ok) return;
  }

  const data = { ...payload.data };

  let rewrittenRef = data.columnRef || null;
  if (data.sourceWorksheetData) {
    const wsState = data.sourceWorksheetData;
    delete data.sourceWorksheetData;

    const prevId = currentModel?.exampleWorksheetId;
    if (prevId) removeProvisionedWorksheet(ctx, prevId);

    const ref = provisionWorksheet(ctx, wsState);
    if (ref) {
      data.exampleWorksheetId = ref.instanceId;
      if (rewrittenRef?.instanceId === '__source__') {
        rewrittenRef = { ...rewrittenRef, instanceId: ref.instanceId };
      }
    }
  }
  data.columnRef = rewrittenRef;

  // setState re-mounts the Alpine tree; the new component's init() reads
  // model.columnRef, sets the picker value and re-runs the transform.
  this.setState(data);
  ctx.stateManager.setModuleState(ctx.instanceId, this.getState());

  const lang = ctx.i18n.getLanguage();
  const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
  ctx.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
};

export default mod;
