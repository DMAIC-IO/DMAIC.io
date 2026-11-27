/**
 * Die freigegebenen Module und die Abhilfe je Verstoß.
 *
 * `RELEASED_MODULES` ist die EINE festgeschriebene Liste: der Freigabetest
 * in `agent-release.test.mjs` vergleicht sie mit `collectAgentData`, der
 * E2E-Test `agent-surface.spec.js` mit dem Katalog zur Laufzeit. Ein Modul
 * kommt hinzu, wenn es freigegeben wird — absichtlich von Hand: eine lose
 * Schranke ließe eine versehentliche Freigabe und ein stilles Herausfallen
 * gleichermaßen durch.
 */

/** @type {readonly string[]} sortiert */
export const RELEASED_MODULES = Object.freeze([
  'activity-flowchart', 'attribute-control-chart', 'attribute-test', 'bar', 'boxplot',
  'calculator', 'ce-matrix', 'chart-suggestion', 'contour-plot', 'control-chart', 'correlation',
  'data-import', 'data-transformation', 'deployment-flowchart', 'distribution-fit',
  'dmaic-calendar', 'doe-advisor', 'doe-planner', 'five-why', 'fmea', 'gage-run-chart',
  'glm-regression', 'heatmap', 'histogram', 'hypothesis-test', 'individual-value-plot', 'ishikawa',
  'kano', 'lessons-learned', 'makigami', 'model-data-generator', 'morphological-box', 'mosaic', 'msa-typ1', 'msa-typ2', 'msa-typ4',
  'msa-typ5', 'msa-typ6', 'multi-vari', 'multivariate-control-chart',
  'opportunity-flowchart', 'outlier-test', 'pairwise-comparison', 'pareto',
  'pie-chart', 'probability-plot', 'process-capability', 'process-map', 'project-charter', 'raci-matrix',
  'random-generator', 'rare-event-chart', 'regression', 'resampling',
  'response-optimization', 'rest-api', 'run-chart', 'sample-size', 'short-run-chart',
  'sipoc', 'stakeholder-analysis', 'survey-builder', 'time-weighted-chart', 'todo',
  'transformed-imr-chart', 'triz-9-windows', 'triz-contradiction-matrix',
  'triz-evolution-trends', 'triz-function-analysis', 'triz-ifr', 'triz-physical-contradiction', 'triz-resources',
  'triz-sufield', 'unit-converter', 'voc-ctx-tree', 'worksheet', 'xy-plot',
]);

/**
 * Abweichungen der Freigaben von `RELEASED_MODULES`, je Zeile mit Abhilfe.
 * @param {Record<string, { available?: boolean }>} modules
 *   Registry-Einträge aus `collectAgentData`
 * @param {readonly string[]} [released]
 * @returns {string[]} leer, wenn die Freigaben genau der Liste entsprechen
 */
export function releaseDiff(modules, released = RELEASED_MODULES) {
  const out = [];
  for (const id of released) {
    if (modules[id]?.available !== true) {
      out.push(`${id}: nicht freigegeben → in CONVERTED_MODULES aufnehmen (tools/build/converted-modules.mjs) oder aus RELEASED_MODULES streichen`);
    }
  }
  for (const [id, entry] of Object.entries(modules)) {
    if (entry.available === true && !released.includes(id)) {
      out.push(`${id}: neu freigegeben → in RELEASED_MODULES aufnehmen`);
    }
  }
  return out;
}
