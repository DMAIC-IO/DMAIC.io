/**
 * D.Mike — DoE planner evaluation (viewmodel/evaluation.js)
 *
 * Sub-viewmodel of the design summary and the design evaluation: run count
 * and resolution from the design type (designs/), D-/A-/G-efficiency,
 * condition number, leverage, VIF, alias structure and power. Read-only: it
 * writes nothing.
 */
import { powerDisplay } from '../doe-planner-analysis.js';
import { sourceRowCount } from '../doe-planner-worksheet.js';
import { designOf, checkConfig, plannedRuns } from '../designs/index.js';

/** Algorithm Lab entry of the efficiency cards. */
const ALGO_ID_DEFF = 'd-efficiency';

export class EvaluationViewModel {
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
  }

  /**
   * Binds the component's model.
   * @noagent lifecycle
   * @param {{model: object}} binding
   */
  attach({ model }) { this.model = model; }

  /**
   * Nothing to release.
   * @noagent lifecycle
   */
  detach() {}

  // ── Summary ───────────────────────────────────────────────

  /**
   * Planned runs including replicates.
   * @noagent view transform
   * @returns {number|'?'}
   */
  summaryRuns() {
    const runs = plannedRuns(this.model);
    return runs === null ? '?' : runs;
  }

  /**
   * Resolution label of the design type.
   * @noagent view transform
   * @returns {string}
   */
  summaryRes() {
    const type = designOf(this.model);
    return type ? type.resolution(this.model) : '';
  }

  /**
   * Runs of the generated design, 0 without one.
   * @noagent view transform
   * @returns {number}
   */
  summaryGeneratedRuns() {
    return this.model.design && this.model.design.runOrder ? this.model.design.runOrder.length : 0;
  }

  /**
   * Whether the configuration can be generated.
   * @noagent view transform
   * @returns {boolean}
   */
  configValid() {
    return checkConfig(this.model, { sourceRowCount: sourceRowCount(this._context, this.model.sourceWorksheet) }).ok;
  }

  // ── Efficiency ────────────────────────────────────────────

  /** @returns {?object} */
  _eff() { return this.model.evaluation ? this.model.evaluation.efficiency : null; }

  /**
   * D-, A-, G-efficiency cards.
   * @noagent view transform
   * @returns {object[]}
   */
  effCards() {
    const eff = this._eff();
    if (!eff) return [];
    const mk = (label, val, tipKey) => {
      const cls = val >= 80 ? 'dmike-kpi--good' : val >= 50 ? 'dmike-kpi--warn' : 'dmike-kpi--bad';
      const helpKey = `modules.doe-planner.${tipKey}`;
      return { label, value: `${Math.round(val)}%`, helpKey, algoId: ALGO_ID_DEFF, cls, barWidth: Math.min(100, val) };
    };
    return [
      mk(this._t('dEff'), eff.dEfficiency, 'tipDEff'),
      mk(this._t('aEff'), eff.aEfficiency, 'tipAEff'),
      mk(this._t('gEff'), eff.gEfficiency, 'tipGEff'),
    ];
  }

  /**
   * Condition number, one decimal.
   * @noagent view transform
   * @returns {string}
   */
  condNumValue() { const e = this._eff(); return e ? e.conditionNumber.toFixed(1) : ''; }

  /**
   * Maximum leverage, three decimals.
   * @noagent view transform
   * @returns {string}
   */
  maxLeverageValue() { const e = this._eff(); return e ? e.maxLeverage.toFixed(3) : ''; }

  // ── VIF ───────────────────────────────────────────────────

  /** @returns {object[]} */
  _vifArr() {
    const ev = this.model.evaluation;
    return ev && Array.isArray(ev.vif) ? ev.vif : [];
  }

  /**
   * VIF of the main effects.
   * @noagent view transform
   * @returns {object[]}
   */
  vifMain() { return this._vifArr().filter((v) => !v.term.includes('*')); }

  /**
   * VIF of the interactions.
   * @noagent view transform
   * @returns {object[]}
   */
  vifInter() { return this._vifArr().filter((v) => v.term.includes('*')); }

  /**
   * Whether any VIF exists.
   * @noagent view transform
   * @returns {boolean}
   */
  hasVif() { return this.vifMain().length > 0 || this.vifInter().length > 0; }

  /**
   * CSS class of a VIF value.
   * @noagent view transform
   * @param {number} v
   * @returns {string}
   */
  vifRating(v) {
    return v <= 1.01 ? 'doe__vif-perfect' : v <= 5 ? 'doe__vif-ok' : v <= 10 ? 'doe__vif-warn' : 'doe__vif-bad';
  }

  // ── Alias structure ───────────────────────────────────────

  /** @returns {?object} */
  _alias() {
    const ev = this.model.evaluation;
    return ev && ev.aliasStructure ? ev.aliasStructure : null;
  }

  /**
   * Whether an alias structure exists.
   * @noagent view transform
   * @returns {boolean}
   */
  hasAlias() {
    const al = this._alias();
    return Boolean(al && (al.aliases.length > 0 || (al.generatorStrings && al.generatorStrings.length > 0)));
  }

  /**
   * Generator strings of the alias structure.
   * @noagent view transform
   * @returns {string[]}
   */
  aliasGenerators() { const al = this._alias(); return al && al.generatorStrings ? al.generatorStrings : []; }

  /**
   * Alias table rows.
   * @noagent view transform
   * @returns {Array<{term: string, aliasedWith: string}>}
   */
  aliasRows() {
    const al = this._alias();
    if (!al || !al.aliases) return [];
    return al.aliases.map((a) => ({ term: a.term, aliasedWith: a.aliasedWith.join(', ') }));
  }

  // ── Power ─────────────────────────────────────────────────

  /** @returns {object[]} */
  _power() {
    const ev = this.model.evaluation;
    return ev && Array.isArray(ev.power) ? ev.power : [];
  }

  /**
   * Whether power values exist.
   * @noagent view transform
   * @returns {boolean}
   */
  hasPower() { return this._power().length > 0; }

  /**
   * Power table rows.
   * @noagent view transform
   * @returns {object[]}
   */
  powerRows() { return this._power(); }

  /**
   * CSS class of a power value.
   * @noagent view transform
   * @param {?number} p
   * @returns {string}
   */
  powerRating(p) { return powerDisplay(p).rating; }

  /**
   * Power as text.
   * @noagent view transform
   * @param {?number} p
   * @returns {string}
   */
  powerPct(p) { return powerDisplay(p).text; }

  /**
   * Bar width of a power value.
   * @noagent view transform
   * @param {?number} p
   * @returns {number}
   */
  powerBarWidth(p) { return powerDisplay(p).width; }

  /**
   * Whether no error degrees of freedom remain.
   * @noagent view transform
   * @returns {boolean}
   */
  powerSaturated() { const p = this._power(); return p.length > 0 && p[0].power === null; }

  /**
   * Description line of the power table.
   * @noagent view transform
   * @returns {string}
   */
  powerDescText() {
    const p = this._power();
    return this._t('powerDesc', {
      n: (this.model.design && this.model.design.runOrder ? this.model.design.runOrder.length : '?'),
      dfError: (p[0] && p[0].dfError != null) ? p[0].dfError : '?',
      alpha: '0.05',
    });
  }

  /**
   * Opens the Algorithm Lab at an algorithm.
   * @noagent navigation
   * @param {string} algoId
   * @param {?Event} event
   */
  algoNavigate(algoId, event) {
    if (event) event.stopPropagation();
    if (algoId && this._context.eventBus) this._context.eventBus.emit('lab:navigate', { algoId, tab: 'docs' });
  }
}
