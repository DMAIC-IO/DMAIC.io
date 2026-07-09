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
 */

import { createModule } from '../../core/template-module.js';
import {
  State, TRANSFORMS, applyTransform, optimizeBoxCox, optimizeYeoJohnson,
} from './data-transformation-model.js';
import {
  ColumnPicker, getColumnValues, getColumnName, refToKey,
  uniqueSheetName, buildInitialWorksheetState,
} from '../../ui/column-picker.js';
import { mean, std, median, skewness, kurtosis } from '../../engines/distribution-fit-engine.js';
import { andersonDarling } from '../../engines/normality-test-engine.js';
import { provisionWorksheet, removeProvisionedWorksheet } from '../../core/examples-registry.js';

const AUTORUN_DELAY = 80;
const ALPHA = 0.05;

/** Build the transient param rows for a transform id (with default values). */
function paramRowsFor(tfId) {
  const tf = TRANSFORMS.find(t => t.id === tfId);
  return tf.params.map(p => ({ ...p, val: String(p.val) }));
}

const mod = createModule({
  config: {
    id: 'data-transformation',
    engine: 'alpine',
    phase: 'data',
    icon: 'refresh-cw',
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

      // ── View transformations (i18n / css) ─────────────────────

      tfName: (id) => _t(TRANSFORMS.find(t => t.id === id).nameKey),
      tfDesc: (id) => _t(TRANSFORMS.find(t => t.id === id).descKey),
      tfOptClass(id) { return this.model.currentTF === id ? 'dt-tf-opt--active' : ''; },
      paramLabel: (key) => _t(key),

      // ── Normality view helpers ────────────────────────────────

      normLabel: (which) => `${_t(which === 'original' ? 'original' : 'transformed')  }:`,
      normStat(slot) {
        const ad = this._norm[slot];
        if (!ad) return '—';
        return `A² = ${ad.statisticAdj.toFixed(4)}, p ≈ ${ad.pValue.toFixed(4)}`;
      },
      normHasBadge(slot) { return Boolean(this._norm[slot]); },
      normBadgeClass(slot) {
        const ad = this._norm[slot];
        if (!ad) return '';
        return ad.pValue >= ALPHA ? 'dt-badge--pass' : 'dt-badge--fail';
      },
      normBadgeText(slot) {
        const ad = this._norm[slot];
        if (!ad) return '';
        return ad.pValue >= ALPHA ? `✓ ${  _t('normal')}` : `✗ ${  _t('notNormal')}`;
      },
      normAlpha: () => `α = ${ALPHA} | H₀: ${_t('h0Normal')}`,

      // ── Param handling ────────────────────────────────────────

      /** (key) => number — reads the current param value. */
      paramFn(key) {
        const row = this.paramRows.find(p => p.key === key);
        return row ? parseFloat(row.val) : 0;
      },

      paramNumberChanged() { this._autoRun(); },
      paramSliderChanged() { this._autoRun(); },

      // ── Transform selection ───────────────────────────────────

      selectTF(id) {
        this.model.currentTF = id;
        this.paramRows = paramRowsFor(id);
        // Re-optimize λ when switching to a λ-transform (only if data present)
        if (this.rawData.length >= 3 && (id === 'boxcox' || id === 'yeojohnson')) {
          this._optimizeLambda();
        }
        this._autoRun();
      },

      /** Switch transform type without triggering another autoRun cycle. */
      _selectTFSilent(id) {
        this.model.currentTF = id;
        this.paramRows = paramRowsFor(id);
      },

      // ── Transform execution ───────────────────────────────────

      _autoRun() {
        clearTimeout(this._autoRunTimer);
        this._autoRunTimer = setTimeout(() => this._runTransform(), AUTORUN_DELAY);
      },

      _runTransform() {
        const ref = this.model.columnRef;
        if (!ref) { this._clearOutput(); return; }

        const colKey = refToKey(ref);
        const columnChanged = colKey !== this._lastColumnKey;
        this._lastColumnKey = colKey;

        const values = getColumnValues(module._context.stateManager, ref);
        this.rawData = values
          .map(v => (typeof v === 'number') ? v : parseFloat(v))
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

      copyExport() {
        navigator.clipboard.writeText(this.exportText).then(() => {
          module._context.notify?.(_t('copied'), 'success');
        });
      },

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
      toWorksheet() {
        if (!this.transData.length) return;
        const pickerValue = this._targetPicker?.value;
        if (!pickerValue) {
          module._context.notify?.(_t('selectTarget'), 'warning');
          return;
        }

        const name = this._colName();
        const values = [...this.transData];

        if (pickerValue === ColumnPicker.NEW_WORKSHEET) {
          this._createWorksheetAndSend(name, values);
          return;
        }

        module._context.eventBus.emit('worksheet:appendColumn', {
          instanceId: pickerValue.instanceId,
          sheetId: pickerValue.sheetId,
          colId: pickerValue.columnId,
          name, values,
        });
        module._context.notify?.(_t('sentToWorksheet'), 'success');
      },

      _createWorksheetAndSend(name, values) {
        const sm = module._context.stateManager;
        const eb = module._context.eventBus;
        const phase = this._findOwnPhase();
        const wsId = `worksheet_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

        const existing = sm.get(`phases.${phase}`) ?? [];
        sm.set(`phases.${phase}`, [
          ...existing,
          { instanceId: wsId, moduleId: 'worksheet', order: existing.length, state: {} },
        ]);

        const baseName = module._context.i18n.t('modules.worksheet.defaultSheetName');
        const sheetName = uniqueSheetName(sm, baseName);
        sm.setModuleState(wsId, buildInitialWorksheetState(sheetName));

        const onActivated = ({ instanceId }) => {
          if (instanceId !== wsId) return;
          eb.off('module:activated', onActivated);

          eb.emit('worksheet:appendColumn', {
            instanceId: wsId,
            sheetId: 'sheet_1',
            colId: '__first__',
            name, values,
          });
          module._context.notify?.(_t('sentToWorksheet'), 'success');
        };
        eb.on('module:activated', onActivated);
        eb.emit('module:added', { moduleId: 'worksheet', phase, instanceId: wsId });
      },

      _findOwnPhase() {
        const sm = module._context.stateManager;
        const id = module._context.instanceId;
        for (const p of Object.keys(sm.get('phases') || {})) {
          const items = sm.get(`phases.${p}`) ?? [];
          if (items.some(i => i.instanceId === id)) return p;
        }
        return 'data';
      },

      // ── ColumnPickers (imperative widgets) ────────────────────

      _mountPicker() {
        const wrap = module._container.querySelector('[data-ref="col-picker-wrap"]');
        if (!wrap) return;
        this._picker?.destroy();
        this._picker = new ColumnPicker(wrap, module._context, {
          mode: 'single',
          types: ['numeric'],
          minCount: 3,
          onChange: (ref) => { this.model.columnRef = ref; this._autoRun(); },
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
          onChange: () => {},
        });
      },

      _destroyTargetPicker() {
        this._targetPicker?.destroy();
        this._targetPicker = null;
      },

      // ── Lifecycle ─────────────────────────────────────────────

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
  if (currentModel?.hasContent() && ctx?.confirmPopout) {
    const ok = await ctx.confirmPopout(t('moduleHelp.confirmOverwrite'), { danger: true });
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
