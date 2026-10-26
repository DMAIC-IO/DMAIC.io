/**
 * D.Mike — DoE planner read surface (doe-planner-read.js)
 *
 * The agent's view of a DoE planner instance, the shape of `@typedef
 * AgentRead` in doe-planner.js. Not the persisted form: the coded and real
 * matrices and the design copies in the phases stay out (spec E7); the run
 * table comes from the pure run table (E4), the fill state from the
 * response state (E5). factors, responses, options and sourceWorksheet are
 * the persisted form, so the read example compares them one to one.
 */
import { checkConfig, designOf, plannedRuns } from './designs/index.js';
import { sourceRowCount } from './doe-planner-worksheet.js';
import { readResponses, staleness } from './doe-planner-responses.js';
import { runRows } from './doe-planner-runtable.js';

/** @param {*} v @returns {*} a plain deep copy */
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

/**
 * @param {object} m a State
 * @returns {?object} DoeEvaluation
 */
function evaluationOf(m) {
  const ev = m.evaluation;
  if (!ev) return null;
  const al = ev.aliasStructure;
  return {
    efficiency: clone(ev.efficiency) ?? null,
    vif: clone(ev.vif) ?? [],
    alias: al ? {
      generators: [...(al.generatorStrings || [])],
      aliases: (al.aliases || []).map((a) => ({ term: a.term, aliasedWith: [...a.aliasedWith] })),
    } : null,
    power: clone(ev.power) ?? [],
  };
}

/**
 * @param {object} m a State
 * @returns {?object} DoeEvop
 */
function evopOf(m) {
  if (!m.projectMode) return null;
  return {
    projectMode: true,
    projectName: m.projectName,
    activePhaseIdx: m.activePhaseIdx,
    phases: m.projectPhases.map((ph) => ({
      cycleNumber: ph.cycleNumber,
      doeName: ph.doeName,
      decision: ph.decision ?? null,
      completedAt: ph.completedAt ?? null,
      yValues: clone(ph.yValues) ?? null,
    })),
    summary: m.evopSummary(),
  };
}

/**
 * The read surface of one instance.
 * @param {object} model a State
 * @param {object} context module context
 * @returns {object} AgentRead
 */
export function agentSnapshot(model, context) {
  const m = model;
  const check = checkConfig(m, { sourceRowCount: sourceRowCount(context, m.sourceWorksheet) });
  const type = designOf(m);
  const state = staleness(context, m);
  const resp = state === 'unbound' ? null : readResponses(context, m);
  const ref = m.worksheetRef;
  return {
    doeName: m.doeName,
    designType: m.designType,
    factors: clone(m.factors),
    responses: clone(m.responses),
    options: clone(m.options),
    typeParams: { selectedRes: clone(m.selectedRes), selectedPBIdx: m.selectedPBIdx },
    valid: check.ok,
    invalidReason: check.ok ? null : check.reason,
    summary: {
      runs: plannedRuns(m),
      resolution: type ? type.resolution(m) : '',
      generatedRuns: m.design && m.design.actualMatrix ? m.design.actualMatrix.length : 0,
    },
    analysisResponseIdx: m.analysisResponseIdx,
    sourceWorksheet: clone(m.sourceWorksheet),
    runs: m.design && m.design.actualMatrix && m.design.actualMatrix.length
      ? runRows(m, state === 'bound' && resp ? resp.values : null)
      : [],
    worksheet: state === 'unbound' ? null : {
      instanceId: ref.instanceId,
      sheetId: ref.sheetId,
      stale: state === 'stale',
      filled: resp ? resp.filledCount : 0,
      total: resp ? resp.totalCount : 0,
    },
    evaluation: evaluationOf(m),
    evop: evopOf(m),
  };
}
