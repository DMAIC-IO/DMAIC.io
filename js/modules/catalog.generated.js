// ERZEUGT von tools/build/catalog.mjs — nicht von Hand ändern.
import legacy from './manifest.js';
import { fromDescriptor } from '../core/module-catalog.js';
import m0 from './dmaic-calendar/module.js';
import m1 from './sipoc/module.js';

/** Menüreihenfolge (tools/build/catalog.mjs MODULE_ORDER). */
export const MODULE_ORDER = Object.freeze(["worksheet","xy-plot","pie-chart","bar","pareto","mosaic","heatmap","contour-plot","histogram","boxplot","individual-value-plot","run-chart","probability-plot","chart-suggestion","data-import","rest-api","random-generator","model-data-generator","calculator","unit-converter","data-transformation","project-charter","dmaic-calendar","todo","stakeholder-analysis","voc-ctx-tree","kano","survey-builder","raci-matrix","sipoc","five-why","process-map","gage-run-chart","msa-typ1","msa-typ2","msa-typ4","msa-typ5","msa-typ6","process-capability","ce-matrix","ishikawa","makigami","activity-flowchart","opportunity-flowchart","deployment-flowchart","correlation","distribution-fit","fmea","hypothesis-test","attribute-test","resampling","multi-vari","sample-size","pairwise-comparison","outlier-test","doe-advisor","doe-planner","regression","glm-regression","response-optimization","control-chart","attribute-control-chart","time-weighted-chart","rare-event-chart","multivariate-control-chart","short-run-chart","transformed-imr-chart","lessons-learned","triz-contradiction-matrix","triz-9-windows","morphological-box","triz-physical-contradiction","triz-ifr","triz-resources","triz-evolution-trends","triz-sufield","triz-function-analysis"]);

/** Ids der Module in der neuen Form (module.js), sortiert. */
export const CONVERTED = Object.freeze(["dmaic-calendar","sipoc"]);

/** Alle Registry-Einträge: alte Form aus manifest.js, neue aus module.js; in Menüreihenfolge. */
export const MODULES = Object.freeze([...legacy, ...[m0, m1].map(fromDescriptor)]
  .sort((a, b) => MODULE_ORDER.indexOf(a.id) - MODULE_ORDER.indexOf(b.id)));

/** Beispiel-Id → Besitzermodul (Module in neuer Form, resources/examples/examples.json). */
export const EXAMPLES = Object.freeze({"dmaic-calendar-pizza-projekt":"dmaic-calendar","sipoc-hubschrauber-flyer":"sipoc","sipoc-pizza-lieferprozess":"sipoc"});

/** Beispiel-Id → Module, die es per exampleRefs (module.js) nutzen. */
export const EXAMPLE_REFS = Object.freeze({});
