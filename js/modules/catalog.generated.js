// ERZEUGT von tools/build/catalog.mjs — nicht von Hand ändern.
import legacy from './manifest.js';
import { fromDescriptor } from '../core/module-catalog.js';
import m0 from './attribute-control-chart/module.js';
import m1 from './bar/module.js';
import m2 from './chart-suggestion/module.js';
import m3 from './contour-plot/module.js';
import m4 from './data-import/module.js';
import m5 from './dmaic-calendar/module.js';
import m6 from './doe-planner/module.js';
import m7 from './heatmap/module.js';
import m8 from './histogram/module.js';
import m9 from './hypothesis-test/module.js';
import m10 from './individual-value-plot/module.js';
import m11 from './ishikawa/module.js';
import m12 from './morphological-box/module.js';
import m13 from './mosaic/module.js';
import m14 from './msa-typ2/module.js';
import m15 from './msa-typ5/module.js';
import m16 from './multi-vari/module.js';
import m17 from './opportunity-flowchart/module.js';
import m18 from './pareto/module.js';
import m19 from './pie-chart/module.js';
import m20 from './process-capability/module.js';
import m21 from './project-charter/module.js';
import m22 from './resampling/module.js';
import m23 from './sipoc/module.js';
import m24 from './survey-builder/module.js';
import m25 from './triz-function-analysis/module.js';
import m26 from './worksheet/module.js';
import m27 from './xy-plot/module.js';

/** Menüreihenfolge (tools/build/catalog.mjs MODULE_ORDER). */
export const MODULE_ORDER = Object.freeze(["worksheet","xy-plot","pie-chart","bar","pareto","mosaic","heatmap","contour-plot","histogram","boxplot","individual-value-plot","run-chart","probability-plot","chart-suggestion","data-import","rest-api","random-generator","model-data-generator","calculator","unit-converter","data-transformation","project-charter","dmaic-calendar","todo","stakeholder-analysis","voc-ctx-tree","kano","survey-builder","raci-matrix","sipoc","five-why","process-map","gage-run-chart","msa-typ1","msa-typ2","msa-typ4","msa-typ5","msa-typ6","process-capability","ce-matrix","ishikawa","makigami","activity-flowchart","opportunity-flowchart","deployment-flowchart","correlation","distribution-fit","fmea","hypothesis-test","attribute-test","resampling","multi-vari","sample-size","pairwise-comparison","outlier-test","doe-advisor","doe-planner","regression","glm-regression","response-optimization","control-chart","attribute-control-chart","time-weighted-chart","rare-event-chart","multivariate-control-chart","short-run-chart","transformed-imr-chart","lessons-learned","triz-contradiction-matrix","triz-9-windows","morphological-box","triz-physical-contradiction","triz-ifr","triz-resources","triz-evolution-trends","triz-sufield","triz-function-analysis"]);

/** Ids der Module in der neuen Form (module.js), sortiert. */
export const CONVERTED = Object.freeze(["attribute-control-chart","bar","chart-suggestion","contour-plot","data-import","dmaic-calendar","doe-planner","heatmap","histogram","hypothesis-test","individual-value-plot","ishikawa","morphological-box","mosaic","msa-typ2","msa-typ5","multi-vari","opportunity-flowchart","pareto","pie-chart","process-capability","project-charter","resampling","sipoc","survey-builder","triz-function-analysis","worksheet","xy-plot"]);

/** Alle Registry-Einträge: alte Form aus manifest.js, neue aus module.js; in Menüreihenfolge. */
export const MODULES = Object.freeze([...legacy, ...[m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12, m13, m14, m15, m16, m17, m18, m19, m20, m21, m22, m23, m24, m25, m26, m27].map(fromDescriptor)]
  .sort((a, b) => MODULE_ORDER.indexOf(a.id) - MODULE_ORDER.indexOf(b.id)));

/** Beispiel-Id → Besitzermodul (Module in neuer Form, resources/examples/examples.json). */
export const EXAMPLES = Object.freeze({"bar-defekte-pro-schicht":"bar","chart-suggestion-bubble-lieferanten":"chart-suggestion","chart-suggestion-bubble-maschinenpark":"chart-suggestion","charter-pizza-lieferzeit":"project-charter","contour-rsm-yield":"contour-plot","dmaic-calendar-pizza-projekt":"dmaic-calendar","doe-optimal-augment-3f":"doe-planner","doe-optimal-mixed-4f":"doe-planner","doe-optimal-rsm-3f":"doe-planner","doe-optimal-screening-5f":"doe-planner","doe-planner-hubschrauber-flyer":"doe-planner","heatmap-zykluszeit-schicht-linie":"heatmap","hypothesis-1-stichprobe-fuellmenge":"hypothesis-test","hypothesis-2-stichproben-grosse-n":"hypothesis-test","hypothesis-2-stichproben-rang":"hypothesis-test","hypothesis-5-filialen":"hypothesis-test","hypothesis-pizza-fahrer":"hypothesis-test","individual-value-plot-hubschrauber-flyer":"individual-value-plot","ishikawa-hubschrauber-flyer":"ishikawa","ishikawa-lieferzeit-zu-lang":"ishikawa","ivplot-pizza-fahrer":"individual-value-plot","morphological-box-pizza-lieferung":"morphological-box","mosaic-lieferantenfreigabe":"mosaic","msa-typ2-akzeptabel":"msa-typ2","msa-typ2-problematisch":"msa-typ2","msa-typ3-akzeptabel":"msa-typ2","msa-typ5-binary-good":"msa-typ5","msa-typ5-binary-marginal":"msa-typ5","msa-typ5-binary-wide":"msa-typ5","msa-typ5-nominal-3classes":"msa-typ5","msa-typ5-ordinal-scale5":"msa-typ5","msa-typ5-zaehltest":"msa-typ5","multi-vari-abfuellanlage":"multi-vari","multi-vari-pressen":"multi-vari","multi-vari-spritzguss":"multi-vari","opportunity-flowchart-angebotsprozess":"opportunity-flowchart","pareto-reklamationskosten":"pareto","pie-defekte-ausschuss":"pie-chart","pie-reklamationen-q1":"pie-chart","project-charter-hubschrauber-flyer":"project-charter","resampling-pizza-k":"resampling","resampling-pizza-two":"resampling","resampling-ppk-bolzen":"resampling","resampling-ruestzeit-paired":"resampling","sipoc-hubschrauber-flyer":"sipoc","sipoc-pizza-lieferprozess":"sipoc","spc-attribute-c-chart":"attribute-control-chart","spc-attribute-np-chart":"attribute-control-chart","spc-attribute-p-chart":"attribute-control-chart","spc-attribute-u-chart":"attribute-control-chart","survey-builder-software":"survey-builder","triz-function-analysis-toothbrush":"triz-function-analysis","xy-plot-bubble-fertigungslinien":"xy-plot","xy-plot-bubble-projektportfolio":"xy-plot","xy-plot-hubschrauber-flyer":"xy-plot","xy-plot-pizza-delivery":"xy-plot","xy-plot-regression-collinear":"xy-plot","xy-plot-regression-outliers":"xy-plot"});

/** Beispiel-Id → Module, die es per exampleRefs (module.js) nutzen. */
export const EXAMPLE_REFS = Object.freeze({});
