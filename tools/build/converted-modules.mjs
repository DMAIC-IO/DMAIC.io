/**
 * Die umgestellten Module (Gates in module-gates.mjs).
 *
 * `CONVERTED_MODULES` ist die EINE Liste der Module in der neuen Form
 * (`module.js`, `domain/`, `viewmodel/`, `resources/`, deklaratives Model).
 * Nur für sie gelten die Gates aus `module-gates.mjs` und die Typprüfung
 * (`typecheck.mjs`); nur sie bekommen in `agent-data.mjs` den
 * Schema-Platzhalter. Ein Modul kommt hinzu, wenn es VOLLSTÄNDIG umgestellt
 * ist — absichtlich von Hand, wie `RELEASED_MODULES`.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RELEASED_MODULES } from './agent-release.mjs';

/** @type {readonly string[]} sortiert */
export const CONVERTED_MODULES = Object.freeze(['activity-flowchart', 'attribute-control-chart', 'attribute-test', 'bar', 'boxplot', 'calculator', 'ce-matrix', 'chart-suggestion', 'contour-plot', 'control-chart', 'correlation', 'data-import', 'data-transformation', 'deployment-flowchart', 'distribution-fit', 'dmaic-calendar', 'doe-advisor', 'doe-planner', 'five-why', 'fmea', 'gage-run-chart', 'heatmap', 'histogram', 'hypothesis-test', 'individual-value-plot', 'ishikawa', 'kano', 'lessons-learned', 'makigami', 'model-data-generator', 'morphological-box', 'mosaic', 'msa-typ1', 'msa-typ2', 'msa-typ4', 'msa-typ5', 'msa-typ6', 'multi-vari', 'multivariate-control-chart', 'opportunity-flowchart', 'outlier-test', 'pairwise-comparison', 'pareto', 'pie-chart', 'probability-plot', 'process-capability', 'process-map', 'project-charter', 'raci-matrix', 'random-generator', 'rare-event-chart', 'resampling', 'rest-api', 'run-chart', 'sample-size', 'short-run-chart', 'sipoc', 'stakeholder-analysis', 'survey-builder', 'time-weighted-chart', 'todo', 'transformed-imr-chart', 'triz-9-windows', 'triz-contradiction-matrix', 'triz-evolution-trends', 'triz-function-analysis', 'triz-ifr', 'triz-physical-contradiction', 'triz-resources', 'triz-sufield', 'unit-converter', 'voc-ctx-tree', 'worksheet', 'xy-plot']);

const NEW_FORM_MARKERS = ['module.js', 'domain/model.js'];

/**
 * Liste, Freigabe und Dateibaum gegeneinander prüfen.
 * @param {string} appDir Wurzel von app/dev
 * @param {readonly string[]} [converted]
 * @param {readonly string[]} [released]
 * @returns {string[]} Befunde, leer = stimmig
 */
export function conversionDiff(appDir, converted = CONVERTED_MODULES, released = RELEASED_MODULES) {
  const root = join(appDir, 'js', 'modules');
  const out = [];
  for (const id of converted) {
    const dir = join(root, id);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      out.push(`converted: ${id}: kein Verzeichnis js/modules/${id}/`);
      continue;
    }
    if (!released.includes(id)) {
      out.push(`converted: ${id}: nicht in RELEASED_MODULES (agent-release.mjs) — ein umgestelltes Modul ist vollständig freigegeben`);
    }
  }
  if (!existsSync(root)) return out;
  for (const id of readdirSync(root).sort()) {
    if (converted.includes(id) || !statSync(join(root, id)).isDirectory()) continue;
    for (const marker of NEW_FORM_MARKERS) {
      if (existsSync(join(root, id, marker))) {
        out.push(`converted: ${id}: hat ${marker}, steht aber nicht in CONVERTED_MODULES — Module werden nur vollständig umgestellt`);
      }
    }
  }
  return out;
}
