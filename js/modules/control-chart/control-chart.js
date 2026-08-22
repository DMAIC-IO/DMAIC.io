/**
 * D.Mike — Control Chart Module (control-chart.js)
 * Control phase: SPC control charts (I-MR, X̄-R, X̄-S).
 *
 * Migrated to createModule + Alpine CSP. The Model (control-chart-model.js)
 * holds only persistence state + thin helpers; all heavy computation
 * (limits, Nelson rules, capability) is delegated to the unchanged engine
 * (engines/control-chart-engine.js). The analysis RESULT is derived
 * transiently in the view from the live worksheet column + model inputs.
 *
 * Imperative widgets (mounted in init(), disposed in destroy()):
 *   - the shared ColumnPicker ('single' mode) into [data-ref="col-picker-wrap"]
 *   - one chartManager 'control-chart' per subchart into the templated
 *     [data-chart-host] hosts (chart-section headers are declarative)
 *
 * POM-byte-parity output (stats bar, chart-section headers, violation rows)
 * is rendered declaratively via the Alpine template (x-text escapes); the
 * charts mount imperatively into the x-for hosts. The annotation dialog is
 * declarative too.
 */

import { createModule } from '../../core/template-module.js';
import { State } from './control-chart-model.js';
import {
  ColumnPicker, getColumnValues, getColumnName,
} from '../../ui/column-picker.js';
import {
  getChartType, NELSON_RULES,
  evaluateNelsonRules, computeCapability,
} from '../../engines/control-chart-engine.js';
import {
  csvPayloadToWorksheetState, loadExampleViaWorksheet,
} from '../../core/examples-registry.js';

/** Auto-run debounce (ms) — matches legacy behaviour. */
const AUTORUN_DELAY = 120;

const mod = createModule({
  config: {
    id: 'control-chart',
    engine: 'alpine',
    phase: 'control',
    icon: 'module.control-chart',
    version: '1.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ──────────────────
      _charts: [],
      _unsubs: [],
      _debTimer: null,
      _renderGen: 0,
      _picker: null,
      _lastResult: null,
      // Annotation dialog (transient UI)
      annOpen: false,
      annIdx: -1,
      annComment: '',
      annExcluded: false,
      // KPI strip (declarative — structured cells, see _renderStats)
      kpiCells: [],
      // Chart sections (declarative — header markup; chart mounted imperatively
      // into the templated host via _whenAnchor). See _renderCharts.
      /** @type {Array<{id:string, title:string, badgeText:string, badgeClass:string}>} */
      chartViews: [],
      // No-violations empty state (declarative — x-if/x-text).
      noViolations: false,
      // Populated violations panel (declarative — structured reactive rows).
      /** @type {Array<{index:number, ruleId:(string|number), desc:string, hasAnn:boolean, annText:string, annExcluded:boolean}>} */
      violationRows: [],
      violationsTitle: '',

      // ── Chart-type / subgroup view helpers ────────────────────

      _ct() { return getChartType(this.model.chartTypeId); },

      showSubgroup() {
        const ct = this._ct();
        return Boolean(ct) && ct.minSubgroupSize !== ct.maxSubgroupSize;
      },
      subgroupMin() {
        const ct = this._ct();
        return ct ? ct.minSubgroupSize : 2;
      },
      subgroupMax() {
        const ct = this._ct();
        return ct ? ct.maxSubgroupSize : 25;
      },

      // ── Input <-> model binding (POM dispatches `change`) ──────

      chartTypeChanged() {
        // model.chartTypeId already set by x-model; clamp subgroup size.
        this.model.setChartType(this.model.chartTypeId);
        this.scheduleAnalysis();
      },
      subgroupSizeChanged(e) {
        this.model.subgroupSize = parseInt(e.target.value, 10) || 2;
        this.scheduleAnalysis();
      },
      baselineValue() {
        return this.model.baselineCount ?? '';
      },
      baselineChanged(e) {
        const val = parseInt(e.target.value, 10);
        this.model.baselineCount = isNaN(val) ? null : val;
        this.scheduleAnalysis();
      },
      stagesChanged(e) {
        this.model.stagesText = e.target.value || '';
        this.scheduleAnalysis();
      },
      uslValue() { return this.model.usl ?? ''; },
      uslChanged(e) {
        const val = parseFloat(e.target.value);
        this.model.usl = isNaN(val) ? null : val;
        this.scheduleAnalysis();
      },
      lslValue() { return this.model.lsl ?? ''; },
      lslChanged(e) {
        const val = parseFloat(e.target.value);
        this.model.lsl = isNaN(val) ? null : val;
        this.scheduleAnalysis();
      },

      // ── Phase II ──────────────────────────────────────────────

      phase2BadgeText() {
        return this.model.frozenLimits ? _t('phase2_frozen') : _t('phase2_live');
      },
      phase2BadgeClass() {
        return this.model.frozenLimits ? 'control-chart__phase2-badge--frozen' : '';
      },
      phase2BadgeIcon() {
        return this.model.frozenLimits ? 'action.lock' : 'action.unlock';
      },
      phase2BtnText() {
        return this.model.frozenLimits ? _t('phase2_unfreeze') : _t('phase2_freeze');
      },
      phase2BtnClass() {
        return this.model.frozenLimits ? 'btn--secondary' : 'btn--primary';
      },
      phase2Toggle() {
        if (this.model.frozenLimits) {
          this.model.frozenLimits = null;
          this.runAnalysis();
          return;
        }
        if (!this._lastResult) {
          module._context.notify?.(_t('phase2_needsData'), 'warning');
          return;
        }
        if (State.parseStages(this.model.stagesText).length > 0) {
          module._context.notify?.(_t('phase2_noStages'), 'warning');
          return;
        }
        this.model.frozenLimits = this.model.buildFrozenLimits(this._lastResult);
        this.runAnalysis();
      },

      // ── Nelson rules ──────────────────────────────────────────

      nelsonCollapsed: false,
      toggleNelson() { this.nelsonCollapsed = !this.nelsonCollapsed; },
      nelsonPanelClass() {
        return this.nelsonCollapsed ? 'control-chart__nelson-panel--collapsed' : '';
      },
      nelsonToggleClass() {
        return this.nelsonCollapsed ? 'control-chart__collapsible--collapsed' : '';
      },

      /** Localized Nelson-rule view rows. */
      rulesView() {
        const lang = module._context.language || 'de';
        return NELSON_RULES.map(r => ({
          id: r.id,
          short: r.short[lang] || r.short.de,
          desc: r.desc[lang] || r.desc.de,
        }));
      },
      isRuleEnabled(id) {
        return this.model.enabledRules.includes(id);
      },
      toggleRule(id, e) {
        const rid = parseInt(id, 10);
        if (e.target.checked) {
          if (!this.model.enabledRules.includes(rid)) this.model.enabledRules.push(rid);
        } else {
          this.model.enabledRules = this.model.enabledRules.filter(r => r !== rid);
        }
        this.scheduleAnalysis();
      },

      // ── Annotation dialog (declarative) ───────────────────────

      annTitle() { return _t('annotationTitle', { idx: this.annIdx + 1 }); },
      cancelLabel() { return module._context.i18n.t('common.cancel'); },
      annRemoveStyle() {
        // Object form so Alpine renders the canonical "visibility: hidden;"
        // (with a space) — the POM checks getAttribute('style') for that exact
        // substring. A bare string ('visibility:hidden') would fail the match.
        return this.model.annotations[this.annIdx] ? {} : { visibility: 'hidden' };
      },
      openAnnotation(idx) {
        const existing = this.model.annotations[idx] || { comment: '', excluded: false };
        this.annIdx = idx;
        this.annComment = existing.comment || '';
        this.annExcluded = Boolean(existing.excluded);
        this.annOpen = true;
        this.$nextTick(() => {
          module._container.querySelector('[data-ref="ann-comment"]')?.focus();
        });
      },
      closeAnnotation() {
        this.annOpen = false;
        this.annIdx = -1;
      },
      annOverlayClick(e) {
        if (e.target.classList.contains('dmike-chart-popout-overlay')) this.closeAnnotation();
      },
      saveAnnotation() {
        const idx = this.annIdx;
        const comment = this.annComment || '';
        const excluded = Boolean(this.annExcluded);
        if (!comment && !excluded) delete this.model.annotations[idx];
        else this.model.annotations[idx] = { comment, excluded };
        this.closeAnnotation();
        this.scheduleAnalysis();
      },
      removeAnnotation() {
        delete this.model.annotations[this.annIdx];
        this.closeAnnotation();
        this.scheduleAnalysis();
      },

      // ── Analysis (controller — needs context + live worksheet data) ──

      scheduleAnalysis() {
        clearTimeout(this._debTimer);
        this._debTimer = setTimeout(() => this.runAnalysis(), AUTORUN_DELAY);
      },

      async runAnalysis() {
        const clearOutput = () => {
          this._renderGen++;
          this._destroyCharts();
          this.chartViews = [];
          this.kpiCells = [];
          this.noViolations = false;
          this.violationRows = [];
          this.violationsTitle = '';
          this._lastResult = null;
        };

        if (!this.model.columnRef) { clearOutput(); return; }

        const rawValues = getColumnValues(module._context.stateManager, this.model.columnRef);
        const values = rawValues.filter(v => v != null && typeof v === 'number' && !isNaN(v));
        if (values.length < 2) { clearOutput(); return; }

        const ct = this._ct();
        if (!ct) return;

        const n = this.model.subgroupSize;
        const stagesParsed = State.parseStages(this.model.stagesText)
          .filter(b => b > 0 && b < values.length);
        const usingStages = stagesParsed.length > 0;
        const baselineEnd = usingStages ? values.length : (this.model.baselineCount || values.length);
        const excluded = this.model.excludedIndices();
        const fl = this.model.frozenLimits;

        let result;
        if (fl && !usingStages
            && fl.chartTypeId === this.model.chartTypeId
            && fl.subgroupSize === this.model.subgroupSize) {
          const fresh = ct.compute(values, n, baselineEnd, undefined, excluded);
          const primaryId = ct.subcharts[0].id;
          const secondaryId = ct.subcharts[1].id;
          result = {
            subcharts: {
              [primaryId]:   { values: fresh.subcharts[primaryId].values,   ...fl.primary },
              [secondaryId]: { values: fresh.subcharts[secondaryId].values, ...fl.secondary },
            },
            labels: fresh.labels,
          };
        } else {
          result = ct.compute(values, n, baselineEnd, usingStages ? stagesParsed : undefined, excluded);
        }

        const primaryId = ct.subcharts[0].id;
        const primaryData = result.subcharts[primaryId];
        const refCL    = Array.isArray(primaryData.cl)    ? primaryData.cl[0]    : primaryData.cl;
        const refSigma = Array.isArray(primaryData.sigma) ? primaryData.sigma[0] : primaryData.sigma;

        const primaryViolations = evaluateNelsonRules(
          primaryData.values, refCL, refSigma, this.model.enabledRules,
        );
        const capability = computeCapability(
          primaryData.values.filter(v => v !== null),
          refCL, refSigma, this.model.usl, this.model.lsl,
        );

        this._lastResult = { result, ct, primaryViolations, capability, baselineEnd, n, stages: stagesParsed };

        this._renderStats(primaryData, primaryViolations, capability);
        await this._renderCharts(result, ct, primaryViolations, baselineEnd, n, stagesParsed);
        this._renderViolations(primaryViolations);
      },

      // ── KPI strip (declarative — structured cells) ───────────
      //
      // Cells carry RAW text (NOT esc()'d — x-text escapes structurally).
      // The staged CL hint is a separate structured field (labelHint),
      // rendered as its own conditional <span> in the template instead of
      // embedded inline markup. No HTML strings, no x-html.

      _renderStats(data, violations, capability) {
        const vCount = new Set(violations.map(v => v.index)).size;
        const total = data.values.filter(v => v !== null).length;
        const fmt = (v) => v.toFixed(4);
        const first = (v) => Array.isArray(v) ? v[0] : v;
        const isStaged = Array.isArray(data.cl);

        const cells = [
          {
            value: fmt(first(data.cl)),
            label: _t('statCL'),
            labelHint: isStaged ? _t('stage1') : '',
            sub: `σ̂ = ${fmt(first(data.sigma))}`,
            mod: '',
          },
          {
            value: first(data.ucl).toFixed(3),
            label: 'UCL / LCL',
            labelHint: '',
            sub: first(data.lcl).toFixed(3),
            mod: '',
          },
          {
            value: vCount,
            label: _t('statViolations'),
            labelHint: '',
            sub: _t('statOf', { total }),
            mod: vCount === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad',
          },
        ];

        if (capability) {
          const cls = capability.cpk >= 1.33 ? '--good' : capability.cpk >= 1.0 ? '--warn' : '--bad';
          cells.push({
            value: capability.cpk.toFixed(3),
            label: 'Cpk',
            labelHint: '',
            sub: capability.cp ? `Cp = ${  capability.cp.toFixed(3)}` : '',
            mod: `dmike-kpi${cls}`,
          });
        }

        this.kpiCells = cells;
      },

      /**
       * Bounded rAF-poll for a templated host. Alpine may materialise the
       * x-for host across several reactive flush cycles, so poll (bounded)
       * until it exists. Aborts if a newer render started (stale gen).
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

      async _renderCharts(result, ct, primaryViolations, baselineEnd, n, stages) {
        this._destroyCharts();

        const blEndForChart = ct.id === 'i-mr' ? baselineEnd : Math.ceil(baselineEnd / n);
        const primaryId = ct.subcharts[0].id;
        const lang = module._context.language || 'de';
        const colName = getColumnName(module._context.stateManager, this.model.columnRef);
        const usingStages = Array.isArray(stages) && stages.length > 0;
        const stageBoundariesFor = (_id) => {
          if (!usingStages) return null;
          if (ct.id === 'i-mr') return stages.slice();
          return stages.map(b => Math.ceil(b / n));
        };

        const gen = ++this._renderGen;

        // Pre-compute violations / chart options per subchart, build the
        // declarative chart-section headers, then mount the imperative charts
        // into the templated hosts.
        const plans = ct.subcharts.map(sc => {
          const scData = result.subcharts[sc.id];
          const scViolations = sc.id === primaryId
            ? primaryViolations
            : evaluateNelsonRules(scData.values, scData.cl, scData.sigma, this.model.enabledRules);
          const isStable = scViolations.length === 0;
          const violationIndices = new Set(scViolations.map(v => v.index));
          const chartName = _t(`subchart_${  sc.id}`, { col: colName });
          return { sc, scData, scViolations, isStable, violationIndices, chartName };
        });

        // Declarative header markup (RAW text — x-text escapes).
        this.chartViews = plans.map(p => ({
          id: p.sc.id,
          title: p.chartName,
          badgeText: p.isStable
            ? _t('stable')
            : _t('unstable', { count: p.scViolations.length }),
          badgeClass: p.isStable
            ? 'control-chart__badge--stable'
            : 'control-chart__badge--unstable',
          badgeIcon: p.isStable ? 'status.ok' : 'status.warning',
        }));

        for (const p of plans) {
          const { sc, scData, violationIndices } = p;
          const host = await this._whenAnchor(`[data-chart-host="${  sc.id  }"]`, gen);
          if (!host) return;

          const yLabel = sc.yLabel[lang] || sc.yLabel.de || '';

          const specOpts = sc.id === primaryId
            ? { usl: this.model.usl, lsl: this.model.lsl }
            : { usl: null, lsl: null };

          const excludedRaw = this.model.excludedIndices();
          const excludedForSub = (sc.id === 'i' || sc.id === 'mr')
            ? new Set(excludedRaw)
            : new Set(excludedRaw.map(i => Math.floor(i / n)));

          const chart = await module._context.chartManager.create(host, 'control-chart', {
            title: '',
            xLabel: _t('xLabelSample'),
            yLabel,
            showLegend: false,
            showTitle: false,
            values: scData.values,
            cl: scData.cl,
            ucl: scData.ucl,
            lcl: scData.lcl,
            sigma: scData.sigma,
            violationIndices,
            excludedIndices: excludedForSub,
            baselineEnd: !usingStages && blEndForChart < scData.values.length ? blEndForChart : null,
            stageBoundaries: stageBoundariesFor(sc.id),
            ...specOpts,
          });
          // Stale-render guard: a newer render started while we awaited.
          if (gen !== this._renderGen) {
            module._context.chartManager.destroy(chart);
            return;
          }
          this._charts.push(chart);
        }
      },

      // ── Violations panel (declarative — structured reactive rows) ──
      // RAW text on each cell (x-text escapes structurally). The per-row click /
      // keyboard opens the annotation dialog; the annotation hint has two
      // sub-states (existing annotation vs. "add").

      _renderViolations(violations) {
        if (violations.length === 0) {
          this.noViolations = true;
          this.violationRows = [];
          this.violationsTitle = '';
          return;
        }
        this.noViolations = false;

        const lang = module._context.language || 'de';
        const unique = [];
        const seen = new Set();
        violations.forEach(v => {
          const k = `${v.index}-${v.ruleId}`;
          if (!seen.has(k)) { seen.add(k); unique.push(v); }
        });
        unique.sort((a, b) => a.index - b.index);

        this.violationRows = unique.map(v => {
          const rule = NELSON_RULES.find(r => r.id === v.ruleId);
          const ann = this.model.annotations[v.index];
          return {
            index: v.index,
            ruleId: v.ruleId,
            desc: rule ? (rule.short[lang] || rule.short.de) : '',
            hasAnn: Boolean(ann),
            annText: ann ? ((ann.comment || '') + (ann.excluded ? ' ⊘' : '')) : '',
            annExcluded: Boolean(ann && ann.excluded),
          };
        });
        this.violationsTitle = _t('violationsTitle', { count: unique.length });
      },

      // View helpers for the declarative violation rows.
      violationsHeaderText() { return `⚑ ${  this.violationsTitle}`; }, // ⚑
      vIdxLabel(r)  { return `#${  r.index + 1}`; },
      vRuleLabel(r) { return `Rule ${  r.ruleId}`; },
      openViolation(r) { this.openAnnotation(r.index); },
      onViolationKey(r, event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.openAnnotation(r.index);
        }
      },

      _destroyCharts() {
        for (const c of this._charts) {
          try { module._context.chartManager.destroy(c); } catch { /* ignore */ }
        }
        this._charts = [];
      },

      // ── Column picker (imperative, 'single' mode) ─────────────

      _mountPicker() {
        const wrap = module._container.querySelector('[data-ref="col-picker-wrap"]');
        if (!wrap) return;
        if (this._picker) { this._picker.destroy(); this._picker = null; }
        this._picker = new ColumnPicker(wrap, module._context, {
          mode: 'single',
          types: ['numeric'],
          minCount: 2,
          onChange: (ref) => {
            this.model.columnRef = ref;
            this.scheduleAnalysis();
          },
        });
        if (this.model.columnRef) this._picker.value = this.model.columnRef;
      },

      // ── Lifecycle (per Alpine component) ──────────────────────

      init() {
        this._charts = [];
        this._unsubs = [];

        this._mountPicker();

        const eb = module._context.eventBus;

        const onData = () => this.scheduleAnalysis();
        eb.on('state:saved', onData);
        eb.on('worksheet:dataChanged', onData);
        this._unsubs.push(() => eb.off('state:saved', onData));
        this._unsubs.push(() => eb.off('worksheet:dataChanged', onData));

        // The shared ColumnPicker self-refreshes its option list on
        // module:added/removed; here we only need to re-derive the analysis
        // result when the worksheet set changes.
        const onMod = ({ moduleId }) => { if (moduleId === 'worksheet') this.scheduleAnalysis(); };
        eb.on('module:added', onMod);
        eb.on('module:removed', onMod);
        this._unsubs.push(() => eb.off('module:added', onMod));
        this._unsubs.push(() => eb.off('module:removed', onMod));

        const onTheme = () => { if (this._lastResult) this.runAnalysis(); };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

        this.runAnalysis();
      },

      destroy() {
        clearTimeout(this._debTimer);
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        if (this._picker) { this._picker.destroy(); this._picker = null; }
        this._destroyCharts();
      },
    };
  },
});

/**
 * Custom loadExample: control-chart examples ship either a project-shape
 * payload (`sourceWorksheetData` + `columnRef`) or a CSV-shape dataset
 * (`columns`). Either way we provision a worksheet (replacing any
 * previously example-provisioned one), rewrite the `__source__` placeholder,
 * then apply the state via setState (which rebuilds the Alpine tree and
 * re-runs the analysis).
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadExampleViaWorksheet(this, payload, {
    State,
    // CSV-shape payload → synthesize sourceWorksheetData + columnRef.
    synthesizeFromCsv(data, meta) {
      const wsState = csvPayloadToWorksheetState(data, meta);
      if (!wsState) return null;
      return {
        sourceWorksheetData: wsState,
        columnRef: { instanceId: '__source__', sheetId: wsState.activeSheetId, columnId: 'c-0' },
      };
    },
    rewriteRefs(data, instanceId) {
      if (data.columnRef?.instanceId === '__source__') {
        data.columnRef = { ...data.columnRef, instanceId };
      }
      return data;
    },
  });
};

export default mod;
