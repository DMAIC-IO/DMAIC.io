/**
 * D.Mike — DoE planner analysis (viewmodel/analysis.js)
 *
 * Sub-viewmodel of what follows the experiment: the dispersion analysis of
 * replicated runs, the response it analyses, and the handover of the
 * linked datasheet to a regression. The response values live in the
 * linked datasheet (another module's state); rev() makes the view
 * recompute when it changes (spec E5).
 */
import { computeDispersionAnalysis } from '../doe-planner-analysis.js';
import { isWorksheetValid } from '../doe-planner-worksheet.js';
import { readResponses, staleness } from '../doe-planner-responses.js';
import { designOf } from '../designs/index.js';
import { letter } from '../doe-planner-model.js';
import { uid } from '../../../core/uid.js';
import { requireIndex } from '../../../core/agent/agent-argcheck.js';

export class AnalysisViewModel {
  /**
   * Gets only what exists before the mount; the model comes with attach().
   * @param {{t: function(string, object=): string, context: object, container: function(): ?Element}} deps
   */
  constructor({ t, context, container }) {
    this._t = t;
    this._context = context;
    this._container = container;
    /** @type {?object} the component's State, set by attach() */
    this.model = null;
    this._save = () => {};
    this._rev = () => 0;
  }

  /**
   * Binds the component's model, its save and the external revision counter.
   * @noagent lifecycle
   * @param {{model: object, save: function(): void, rev: function(): number}} binding
   */
  attach({ model, save, rev }) {
    this.model = model;
    this._save = save;
    this._rev = rev;
  }

  /**
   * Nothing to release.
   * @noagent lifecycle
   */
  detach() {}

  // ── Dispersion ────────────────────────────────────────────

  /**
   * Dispersion analysis of the replicated runs.
   * @noagent view transform
   * @returns {?object} the result, {noReplicates: true}, or null
   */
  dispersion() {
    void this._rev();
    const m = this.model;
    if (staleness(this._context, m) !== 'bound') return null;
    const resp = readResponses(this._context, m);
    if (!resp || !resp.complete) return null;
    const type = designOf(m);
    if (type && !type.dispersion) return null;
    if (!m.design || !resp.values || !resp.values.length) return null;

    const idx = Math.min(m.analysisResponseIdx, resp.values.length - 1);
    const yRaw = resp.values[idx] || [];
    const y = yRaw.map((v) => ((typeof v === 'number' && isFinite(v)) ? v : NaN));
    const factorNames = m.factors.map((f, i) => f.name || letter(i));
    const result = computeDispersionAnalysis(m.design, y, factorNames, 0.05, {
      terms: m.isOptimalType() ? m.getActiveTerms() : undefined,
    });

    if (!result.ok) {
      if (result.reason === 'no-replicates' || result.reason === 'insufficient-data') {
        if ((m.options.replicates || 1) < 2) return null;
        return { noReplicates: true };
      }
      return null;
    }
    result._respName = m.responses[idx] && m.responses[idx].name ? m.responses[idx].name : `Y${idx + 1}`;
    return result;
  }

  /**
   * @noagent view transform
   * @returns {string}
   */
  dispersionLeadText() {
    const r = this.dispersion();
    if (!r || r.noReplicates) return '';
    return this._t('dispersionLead', {
      response: r._respName,
      min: r.minReplicates,
      max: r.maxReplicates,
      points: r.groups.length,
    });
  }

  /**
   * @noagent view transform
   * @returns {object[]} mean and log-variance model
   */
  dispersionModels() {
    const r = this.dispersion();
    if (!r || r.noReplicates) return [];
    const mk = (model, titleKey) => {
      if (!model || !model.coefficients) return { title: this._t(titleKey), fitted: false };
      const rows = model.coefficients
        .filter((c) => c.term !== 'Intercept')
        .map((c) => ({ term: c.term, coefficient: c.coefficient, effect: c.effect, p: c.p, significant: c.significant }));
      const r2Text = `R² = ${(model.rSquared * 100).toFixed(1)}%, R²adj = ${(model.rSquaredAdj * 100).toFixed(1)}%`;
      return { title: this._t(titleKey), fitted: true, rows, r2Text };
    };
    return [mk(r.meanModel, 'dispersionMeanModel'), mk(r.dispersionModel, 'dispersionLogVarModel')];
  }

  /**
   * @noagent view transform
   * @returns {?object}
   */
  dispersionConclusion() {
    const r = this.dispersion();
    if (!r || r.noReplicates) return null;
    if (!r.dispersionModel) return null;
    if (r.significantDispersion.length === 0) return { none: true, cls: 'doe__dispersion-conclusion--none' };
    const items = r.significantDispersion.map((d) => {
      if (d.prefer === 'low' || d.prefer === 'high') {
        return `${d.term}: ${this._t(`dispersionPrefer_${d.prefer}`)} (β = ${d.coefficient.toFixed(3)}, p = ${d.p.toFixed(4)})`;
      }
      return `${d.term}: ${this._t('dispersionPreferInteraction')} (β = ${d.coefficient.toFixed(3)}, p = ${d.p.toFixed(4)})`;
    });
    return { none: false, items, cls: '' };
  }

  /**
   * Choose the response the dispersion analysis and the regression handover use.
   * @agent
   * @param {number} index the response, 0 = Y1
   * @returns {void}
   * @throws {Error} if the index is unknown
   */
  setAnalysisResponse(index) {
    requireIndex('index', index, this.model.responses.length - 1);
    this.model.analysisResponseIdx = index;
    this._save();
  }

  // ── Regression handover ───────────────────────────────────

  /**
   * Hand the linked datasheet to a new regression in the planner's phase,
   * with the design's model terms.
   * @agent
   * @returns {string} the instance id of the new regression
   * @throws {Error} if no datasheet is linked
   */
  transferToRegression() {
    const m = this.model;
    const ctx = this._context;
    const ref = m.worksheetRef;
    if (!ref || !isWorksheetValid(ctx, ref)) throw new Error('the handover needs a linked datasheet: create it first (runs.createDatasheet)');
    const sm = ctx.stateManager;
    const colRefs = ref.factorColumnIds.map((colId) => ({ instanceId: ref.instanceId, sheetId: ref.sheetId, columnId: colId }));
    const respColId = ref.responseColumnIds[m.analysisResponseIdx] || ref.responseColumnIds[0];
    const yKey = `${ref.instanceId}|${ref.sheetId}|${respColId}`;
    let phase = 'improve';
    for (const p of Object.keys(sm.get('phases') || {})) {
      const items = sm.get(`phases.${p}`) ?? [];
      if (items.some((i) => i.instanceId === ctx.instanceId)) { phase = p; break; }
    }
    const regInstanceId = uid();
    const existing = sm.get(`phases.${phase}`) ?? [];
    sm.set(`phases.${phase}`, [...existing, { instanceId: regInstanceId, moduleId: 'regression', order: existing.length, state: {} }]);
    sm.setModuleState(regInstanceId, {
      colRefs, yKey, regType: 'polynomial', polyDegree: 1,
      designTerms: m.modelTerms(),
      confLevel: (sm.get('settings.confidenceLevel') ?? 95) / 100,
      alpha: Number(((100 - (sm.get('settings.confidenceLevel') ?? 95)) / 100).toFixed(4)),
      showCI: true, result: null, perXResults: null, activeXKey: null,
      activeTab: 'scatter', excludedTerms: [], coefSortByP: false,
    });
    ctx.eventBus.emit('module:added', { moduleId: 'regression', phase, instanceId: regInstanceId });
    ctx.notify(this._t('transferSuccess'));
    return regInstanceId;
  }
}
