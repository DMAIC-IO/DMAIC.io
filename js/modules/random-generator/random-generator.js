/**
 * D.Mike — Random Generator Module (random-generator.js)
 * Data phase: generates random numbers from various statistical distributions.
 *
 * Migrated to createModule + Alpine CSP. Pure logic (PRNG, distribution
 * registry, sampling, categorical generation, State) lives in
 * random-generator-model.js. This file holds only the view layer:
 *   - declarative template bindings (random-generator.html)
 *   - the histogram / pareto chart (imperative chartManager widget)
 *   - the worksheet-target ColumnPicker (imperative widget)
 *
 * Generated random VALUES are transient (not persisted) — they are regenerated
 * deterministically from the persisted seed on render, matching the legacy
 * getState()/setState() behaviour.
 */

import { createModule } from '../../core/template-module.js';
import { ColumnPicker, uniqueSheetName, buildInitialWorksheetState } from '../../ui/column-picker.js';
import { descriptiveStats } from '../../engines/normality-test-engine.js';
import {
  State,
  DISTRIBUTIONS,
  ATTRIBUTIVE_KEY,
  generateSamples,
  generateAttributive,
  attrProbabilities,
  resolveParams,
  clampCount,
  frequency,
  csvEscape,
  genId,
} from './random-generator-model.js';

const AUTORUN_DELAY = 80;
const DISPLAY_MAX = 2000;

/** @param {number} v @returns {string} */
function fmtStatNum(v) {
  if (Math.abs(v) >= 1e6 || (Math.abs(v) < 0.001 && v !== 0)) return v.toExponential(4);
  return v.toFixed(4);
}

export default createModule({
  config: {
    id: 'random-generator',
    engine: 'alpine',
    phase: 'data',
    icon: 'module.random-generator',
    version: '1.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Constants exposed to the template ─────────────────────
      attrKey: ATTRIBUTIVE_KEY,

      // ── Transient view state (not persisted) ──────────────────
      /** Raw string inputs for the active numeric distribution's params. */
      paramInputs: {},
      countInput: '1000',
      seedInput: '42',
      attrCountInput: '50',
      attrSeedInput: '42',
      /** Generated values (numbers or category strings). */
      genData: [],
      _chart: null,
      _picker: null,
      _unsubs: [],
      _autoTimer: 0,
      _renderGen: 0,

      // ── Sidebar / selection ───────────────────────────────────

      /** Distribution categories (closed enum from the registry). */
      categories() {
        const cats = {};
        for (const [key, d] of Object.entries(DISTRIBUTIONS)) {
          if (!cats[d.categoryKey]) cats[d.categoryKey] = [];
          cats[d.categoryKey].push(key);
        }
        return Object.entries(cats).map(([key, dists]) => ({ key, dists }));
      },

      isAttributive() { return this.model.currentDist === ATTRIBUTIVE_KEY; },
      isNumeric() {
        return Boolean(this.model.currentDist)
          && this.model.currentDist !== ATTRIBUTIVE_KEY
          && Boolean(DISTRIBUTIONS[this.model.currentDist]);
      },

      selectDistribution(key) {
        this._destroyChart();
        this.model.currentDist = key;
        this.genData = [];
        if (key === ATTRIBUTIVE_KEY) {
          this._syncAttrInputs();
        } else {
          this._syncParamInputs(key);
        }
        this.$nextTick(() => {
          this._mountPicker();
          this.generate();
        });
      },

      // ── View transformations ──────────────────────────────────

      isEn() { return module._context.language === 'en'; },
      distName(key) { return _t(DISTRIBUTIONS[key].nameKey); },
      distFormula(key) { return DISTRIBUTIONS[key].formula; },
      distParams() { return DISTRIBUTIONS[this.model.currentDist]?.params || []; },

      paramLabel(p) { return this.isEn() ? p.labelEn : p.label; },
      paramHint(p) { return this.isEn() ? (p.hintEn || '') : (p.hint || ''); },
      paramMin(p) { return p.min !== undefined ? p.min : false; },
      paramMax(p) { return p.max !== undefined ? p.max : false; },

      attrColor(i) { return `var(--color-chart-${  (i % 10) + 1  })`; },
      removeGlyph() { return '×'; },
      attrFormula() { return 'X ~ Categorical(p₁, p₂, …, pₖ)'; },

      fmtValue(v) {
        const d = DISTRIBUTIONS[this.model.currentDist];
        return (d && d.discrete) ? v.toString() : v.toFixed(6);
      },

      hasResults() { return this.genData.length > 0; },

      dataCountLabel() {
        const total = this.genData.length;
        return total > DISPLAY_MAX ? `${DISPLAY_MAX} / ${total}` : `${total}`;
      },
      dataValues() { return this.genData.slice(0, DISPLAY_MAX); },

      // ── Numeric stats KPIs ────────────────────────────────────

      statKpis() {
        if (!this.genData.length || this.isAttributive()) return [];
        const ds = descriptiveStats(this.genData);
        return [
          { value: String(ds.n), label: 'n' },
          { value: fmtStatNum(ds.mean), label: _t('statMean') },
          { value: fmtStatNum(ds.stdDev), label: _t('statStd') },
          { value: fmtStatNum(ds.median), label: _t('statMedian') },
          { value: fmtStatNum(ds.min), label: 'Min' },
          { value: fmtStatNum(ds.max), label: 'Max' },
          { value: fmtStatNum(ds.skewness), label: _t('statSkewness') },
          { value: fmtStatNum(ds.kurtosis), label: _t('statKurtosis') },
        ];
      },

      // ── Attributive view helpers ──────────────────────────────

      probBars() {
        const probs = attrProbabilities(this.model.attributes);
        return this.model.attributes.map((a, i) => {
          const pct = probs[i].toFixed(1);
          return {
            pct,
            label: `${pct  }%`,
            color: this.attrColor(i),
            title: `${a.name || '?'}: ${pct}%`,
          };
        });
      },

      attrKpis() {
        if (!this.genData.length || !this.isAttributive()) return [];
        const total = this.genData.length;
        const sorted = frequency(this.genData);
        return [
          { value: String(total), label: 'n' },
          { value: String(sorted.length), label: _t('catCount') },
          { value: sorted[0] ? String(sorted[0][0]) : '—', label: _t('mostFrequent') },
        ];
      },

      freqRows() {
        if (!this.genData.length || !this.isAttributive()) return [];
        const total = this.genData.length;
        const sorted = frequency(this.genData);
        const attrOrder = this.model.attributes.map(a => a.name);
        const maxCount = sorted.length ? sorted[0][1] : 1;
        return sorted.map(([name, count]) => {
          const idx = attrOrder.indexOf(name);
          const color = idx >= 0 ? this.attrColor(idx) : 'var(--color-text-tertiary)';
          return {
            name,
            count,
            pct: (count / total * 100).toFixed(1),
            barW: (count / maxCount * 100).toFixed(1),
            color,
          };
        });
      },

      dataChips() {
        const attrOrder = this.model.attributes.map(a => a.name);
        return this.genData.slice(0, DISPLAY_MAX).map((v) => {
          const idx = attrOrder.indexOf(v);
          return { value: v, color: idx >= 0 ? this.attrColor(idx) : 'var(--color-text-tertiary)' };
        });
      },

      // ── Attribute grid handlers ───────────────────────────────

      addAttribute() {
        this.model.attributes.push({ id: genId(), name: '', weight: 1 });
        this.autoGenerate();
      },
      removeAttribute(i) {
        this.model.attributes.splice(i, 1);
        this.autoGenerate();
      },

      // ── Generation ────────────────────────────────────────────

      autoGenerate() {
        clearTimeout(this._autoTimer);
        this._autoTimer = setTimeout(() => {
          try { this.generate(); } catch (e) { console.error('Auto-generate failed:', e); }
        }, AUTORUN_DELAY);
      },

      generate() {
        if (this.isAttributive()) return this._generateAttributive();
        if (this.isNumeric()) return this._generateNumeric();
      },

      _generateNumeric() {
        const seed = parseInt(this.seedInput) || 42;
        const count = clampCount(this.countInput, 1000);
        const params = resolveParams(this.model.currentDist, this.paramInputs);

        this.genData = generateSamples(this.model.currentDist, params, count, seed);

        // Persist exactly what legacy stored.
        this.model.seed = seed;
        this.model.count = count;
        this.model.params = params;

        const gen = ++this._renderGen;
        this.$nextTick(() => this._renderHistogram(gen));
      },

      _generateAttributive() {
        const seed = parseInt(this.attrSeedInput) || 42;
        const count = clampCount(this.attrCountInput, 50);
        this.model.attrSeed = seed;
        this.model.attrCount = count;

        this.genData = generateAttributive(this.model.attributes, count, seed);

        if (!this.genData.length) {
          this._destroyChart();
          return;
        }
        const gen = ++this._renderGen;
        this.$nextTick(() => this._renderAttrChart(gen));
      },

      // ── Charts (imperative chartManager widgets) ──────────────

      _destroyChart() {
        if (this._chart) {
          try { module._context.chartManager.destroy(this._chart); } catch { /* ignore */ }
          this._chart = null;
        }
      },

      async _renderHistogram(gen) {
        this._destroyChart();
        const area = module._container.querySelector('[data-ref="rg-hist"]');
        if (!area || gen !== this._renderGen) return;
        area.replaceChildren();
        const d = DISTRIBUTIONS[this.model.currentDist];
        const distName = _t(d.nameKey);
        const chart = await module._context.chartManager.create(area, 'histogram', {
          title: `${_t('histogram')  } — ${  distName}`,
          data: this.genData,
          binMethod: 'sturges',
          showNormalCurve: !d.discrete,
          barColor: 'var(--color-chart-1)',
          normalCurveColor: 'var(--color-chart-2)',
          showLegend: !d.discrete,
          xLabel: distName,
          yLabel: '',
        });
        if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
        this._chart = chart;
      },

      async _renderAttrChart(gen) {
        this._destroyChart();
        const area = module._container.querySelector('[data-ref="rg-hist"]');
        if (!area || gen !== this._renderGen) return;
        area.replaceChildren();
        const attrOrder = this.model.attributes.map(a => a.name);
        const items = frequency(this.genData).map(([name, value]) => {
          const idx = attrOrder.indexOf(name);
          return { name, value, color: idx >= 0 ? this.attrColor(idx) : 'var(--color-chart-1)' };
        });
        const chart = await module._context.chartManager.create(area, 'pareto', {
          title: `${_t('distAttributive')  } — ${  _t('frequency')}`,
          items,
          refLineValue: 80,
        });
        if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
        this._chart = chart;
      },

      // ── CSV export ────────────────────────────────────────────

      exportCSV() {
        if (!this.genData.length) return;
        const lines = ['Value'];
        if (this.isAttributive()) {
          this.genData.forEach(v => lines.push(csvEscape(v)));
        } else {
          const d = DISTRIBUTIONS[this.model.currentDist];
          this.genData.forEach(v => lines.push(d.discrete ? v.toString() : v.toFixed(8)));
        }
        const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const seed = this.isAttributive() ? this.attrSeedInput : this.seedInput;
        a.download = `${this.model.currentDist}_seed${seed}_n${this.genData.length}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
        module._context.notify(_t('csvExported'));
      },

      // ── To Worksheet ──────────────────────────────────────────

      toWorksheet() {
        if (!this.genData.length) return;
        const pickerValue = this._picker?.value;
        if (!pickerValue) {
          module._context.notify(_t('selectTarget'));
          return;
        }

        const isAttr = this.isAttributive();
        const name = isAttr ? _t('distAttributive') : _t(DISTRIBUTIONS[this.model.currentDist].nameKey);
        const discrete = isAttr ? true : Boolean(DISTRIBUTIONS[this.model.currentDist].discrete);
        const type = isAttr ? 'text' : 'numeric';
        const values = [...this.genData];

        if (pickerValue === ColumnPicker.NEW_WORKSHEET) {
          this._createWorksheetAndSend(name, values, type, discrete);
          return;
        }

        module._context.eventBus.emit('worksheet:appendColumn', {
          instanceId: pickerValue.instanceId,
          sheetId: pickerValue.sheetId,
          colId: pickerValue.columnId,
          name, values, discrete, type,
        });
        module._context.notify(_t('sentToWorksheet'));
      },

      _createWorksheetAndSend(name, values, type, discrete) {
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
            name, values, discrete, type,
          });
          module._context.notify(_t('sentToWorksheet'));
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

      // ── Input synchronisation (model → raw string inputs) ─────

      _syncParamInputs(key) {
        const d = DISTRIBUTIONS[key];
        const inputs = {};
        const stored = this.model.params || {};
        d.params.forEach(p => {
          inputs[p.id] = String(stored[p.id] !== undefined ? stored[p.id] : p.default);
        });
        this.paramInputs = inputs;
        this.countInput = String(this.model.count ?? 1000);
        this.seedInput = String(this.model.seed ?? 42);
      },

      _syncAttrInputs() {
        this.attrCountInput = String(this.model.attrCount ?? 50);
        this.attrSeedInput = String(this.model.attrSeed ?? 42);
      },

      // ── ColumnPicker (imperative widget) ──────────────────────

      _mountPicker() {
        const wrap = module._container.querySelector('[data-ref="rg-target-wrap"]');
        if (!wrap) return;
        this._picker?.destroy();
        this._picker = new ColumnPicker(wrap, module._context, {
          mode: 'single',
          maxCount: 0,
          allowCreateWorksheet: true,
        });
      },

      // ── Lifecycle (per Alpine component) ──────────────────────

      init() {
        this._unsubs = [];
        this.genData = [];

        const eb = module._context.eventBus;
        const onActivated = ({ instanceId }) => {
          if (instanceId === module._context.instanceId) this._picker?.refresh();
        };
        eb.on('module:activated', onActivated);
        this._unsubs.push(() => eb.off('module:activated', onActivated));

        const onTheme = () => {
          if (this.genData.length) {
            const gen = ++this._renderGen;
            if (this.isAttributive()) this._renderAttrChart(gen);
            else this._renderHistogram(gen);
          }
        };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

        // Restore inputs + regenerate from persisted state.
        if (this.model.currentDist === ATTRIBUTIVE_KEY) {
          this._syncAttrInputs();
        } else if (this.isNumeric()) {
          this._syncParamInputs(this.model.currentDist);
        }
        this.$nextTick(() => {
          if (this.model.currentDist) {
            this._mountPicker();
            this.generate();
          }
        });
      },

      destroy() {
        clearTimeout(this._autoTimer);
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        this._destroyChart();
        this._picker?.destroy();
        this._picker = null;
        this.genData = [];
      },
    };
  },
});
