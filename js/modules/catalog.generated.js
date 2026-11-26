// ERZEUGT von tools/build/catalog.mjs — nicht von Hand ändern.
import legacy from './manifest.js';
import { fromDescriptor } from '../core/module-catalog.js';
import m0 from './attribute-control-chart/module.js';
import m1 from './bar/module.js';
import m2 from './boxplot/module.js';
import m3 from './ce-matrix/module.js';
import m4 from './chart-suggestion/module.js';
import m5 from './contour-plot/module.js';
import m6 from './control-chart/module.js';
import m7 from './data-import/module.js';
import m8 from './distribution-fit/module.js';
import m9 from './dmaic-calendar/module.js';
import m10 from './doe-planner/module.js';
import m11 from './gage-run-chart/module.js';
import m12 from './heatmap/module.js';
import m13 from './histogram/module.js';
import m14 from './hypothesis-test/module.js';
import m15 from './individual-value-plot/module.js';
import m16 from './ishikawa/module.js';
import m17 from './morphological-box/module.js';
import m18 from './mosaic/module.js';
import m19 from './msa-typ2/module.js';
import m20 from './msa-typ5/module.js';
import m21 from './multi-vari/module.js';
import m22 from './multivariate-control-chart/module.js';
import m23 from './opportunity-flowchart/module.js';
import m24 from './outlier-test/module.js';
import m25 from './pareto/module.js';
import m26 from './pie-chart/module.js';
import m27 from './probability-plot/module.js';
import m28 from './process-capability/module.js';
import m29 from './project-charter/module.js';
import m30 from './raci-matrix/module.js';
import m31 from './rare-event-chart/module.js';
import m32 from './resampling/module.js';
import m33 from './run-chart/module.js';
import m34 from './short-run-chart/module.js';
import m35 from './sipoc/module.js';
import m36 from './survey-builder/module.js';
import m37 from './time-weighted-chart/module.js';
import m38 from './transformed-imr-chart/module.js';
import m39 from './triz-9-windows/module.js';
import m40 from './triz-contradiction-matrix/module.js';
import m41 from './triz-evolution-trends/module.js';
import m42 from './triz-function-analysis/module.js';
import m43 from './triz-ifr/module.js';
import m44 from './triz-physical-contradiction/module.js';
import m45 from './triz-resources/module.js';
import m46 from './triz-sufield/module.js';
import m47 from './worksheet/module.js';
import m48 from './xy-plot/module.js';

/** Menüreihenfolge (tools/build/catalog.mjs MODULE_ORDER). */
export const MODULE_ORDER = Object.freeze(["worksheet","xy-plot","pie-chart","bar","pareto","mosaic","heatmap","contour-plot","histogram","boxplot","individual-value-plot","run-chart","probability-plot","chart-suggestion","data-import","rest-api","random-generator","model-data-generator","calculator","unit-converter","data-transformation","project-charter","dmaic-calendar","todo","stakeholder-analysis","voc-ctx-tree","kano","survey-builder","raci-matrix","sipoc","five-why","process-map","gage-run-chart","msa-typ1","msa-typ2","msa-typ4","msa-typ5","msa-typ6","process-capability","ce-matrix","ishikawa","makigami","activity-flowchart","opportunity-flowchart","deployment-flowchart","correlation","distribution-fit","fmea","hypothesis-test","attribute-test","resampling","multi-vari","sample-size","pairwise-comparison","outlier-test","doe-advisor","doe-planner","regression","glm-regression","response-optimization","control-chart","attribute-control-chart","time-weighted-chart","rare-event-chart","multivariate-control-chart","short-run-chart","transformed-imr-chart","lessons-learned","triz-contradiction-matrix","triz-9-windows","morphological-box","triz-physical-contradiction","triz-ifr","triz-resources","triz-evolution-trends","triz-sufield","triz-function-analysis"]);

/** Ids der Module in der neuen Form (module.js), sortiert. */
export const CONVERTED = Object.freeze(["attribute-control-chart","bar","boxplot","ce-matrix","chart-suggestion","contour-plot","control-chart","data-import","distribution-fit","dmaic-calendar","doe-planner","gage-run-chart","heatmap","histogram","hypothesis-test","individual-value-plot","ishikawa","morphological-box","mosaic","msa-typ2","msa-typ5","multi-vari","multivariate-control-chart","opportunity-flowchart","outlier-test","pareto","pie-chart","probability-plot","process-capability","project-charter","raci-matrix","rare-event-chart","resampling","run-chart","short-run-chart","sipoc","survey-builder","time-weighted-chart","transformed-imr-chart","triz-9-windows","triz-contradiction-matrix","triz-evolution-trends","triz-function-analysis","triz-ifr","triz-physical-contradiction","triz-resources","triz-sufield","worksheet","xy-plot"]);

/** Alle Registry-Einträge: alte Form aus manifest.js, neue aus module.js; in Menüreihenfolge. */
export const MODULES = Object.freeze([...legacy, ...[m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12, m13, m14, m15, m16, m17, m18, m19, m20, m21, m22, m23, m24, m25, m26, m27, m28, m29, m30, m31, m32, m33, m34, m35, m36, m37, m38, m39, m40, m41, m42, m43, m44, m45, m46, m47, m48].map(fromDescriptor)]
  .sort((a, b) => MODULE_ORDER.indexOf(a.id) - MODULE_ORDER.indexOf(b.id)));

/** Beispiel-Id → Besitzermodul (Module in neuer Form, resources/examples/examples.json). */
export const EXAMPLES = Object.freeze({"bar-defekte-pro-schicht":"bar","boxplot-pizza-fahrer":"boxplot","ce-matrix-pizza-lieferzeit":"ce-matrix","chart-suggestion-bubble-lieferanten":"chart-suggestion","chart-suggestion-bubble-maschinenpark":"chart-suggestion","charter-pizza-lieferzeit":"project-charter","contour-rsm-yield":"contour-plot","control-chart-capability":"control-chart","control-chart-hubschrauber-flyer":"control-chart","control-chart-imr-annotated-frozen":"control-chart","control-chart-imr-shift":"control-chart","control-chart-imr-trend":"control-chart","control-chart-xbar-r-stable":"control-chart","control-chart-xbar-s-stable":"control-chart","dmaic-calendar-pizza-projekt":"dmaic-calendar","doe-optimal-augment-3f":"doe-planner","doe-optimal-mixed-4f":"doe-planner","doe-optimal-rsm-3f":"doe-planner","doe-optimal-screening-5f":"doe-planner","doe-planner-hubschrauber-flyer":"doe-planner","heatmap-zykluszeit-schicht-linie":"heatmap","hypothesis-1-stichprobe-fuellmenge":"hypothesis-test","hypothesis-2-stichproben-grosse-n":"hypothesis-test","hypothesis-2-stichproben-rang":"hypothesis-test","hypothesis-5-filialen":"hypothesis-test","hypothesis-pizza-fahrer":"hypothesis-test","individual-value-plot-hubschrauber-flyer":"individual-value-plot","ishikawa-hubschrauber-flyer":"ishikawa","ishikawa-lieferzeit-zu-lang":"ishikawa","ivplot-pizza-fahrer":"individual-value-plot","morphological-box-pizza-lieferung":"morphological-box","mosaic-lieferantenfreigabe":"mosaic","msa-gage-run-chart-attributiv":"gage-run-chart","msa-typ2-akzeptabel":"msa-typ2","msa-typ2-problematisch":"msa-typ2","msa-typ3-akzeptabel":"msa-typ2","msa-typ5-binary-good":"msa-typ5","msa-typ5-binary-marginal":"msa-typ5","msa-typ5-binary-wide":"msa-typ5","msa-typ5-nominal-3classes":"msa-typ5","msa-typ5-ordinal-scale5":"msa-typ5","msa-typ5-zaehltest":"msa-typ5","multi-vari-abfuellanlage":"multi-vari","multi-vari-pressen":"multi-vari","multi-vari-spritzguss":"multi-vari","opportunity-flowchart-angebotsprozess":"opportunity-flowchart","pareto-reklamationskosten":"pareto","pie-defekte-ausschuss":"pie-chart","pie-reklamationen-q1":"pie-chart","probplot-normal":"probability-plot","probplot-resolution":"probability-plot","probplot-weibull":"probability-plot","project-charter-hubschrauber-flyer":"project-charter","raci-pizza-lieferprozess":"raci-matrix","resampling-pizza-k":"resampling","resampling-pizza-two":"resampling","resampling-ppk-bolzen":"resampling","resampling-ruestzeit-paired":"resampling","sipoc-hubschrauber-flyer":"sipoc","sipoc-pizza-lieferprozess":"sipoc","spc-attribute-c-chart":"attribute-control-chart","spc-attribute-np-chart":"attribute-control-chart","spc-attribute-p-chart":"attribute-control-chart","spc-attribute-u-chart":"attribute-control-chart","spc-multivariate-t2":"multivariate-control-chart","spc-rare-event-t-chart":"rare-event-chart","spc-run-chart-shift":"run-chart","spc-short-run-zmr":"short-run-chart","spc-time-weighted-cusum":"time-weighted-chart","spc-time-weighted-ewma":"time-weighted-chart","survey-builder-software":"survey-builder","triz-9windows-pizza-lieferung":"triz-9-windows","triz-contradiction-speed-vs-productivity":"triz-contradiction-matrix","triz-evolution-trends-pkw-beleuchtung":"triz-evolution-trends","triz-function-analysis-toothbrush":"triz-function-analysis","triz-ifr-bandfoerderer":"triz-ifr","triz-physical-contradiction-tragfluegel":"triz-physical-contradiction","triz-resources-bandfoerderer":"triz-resources","triz-sufield-bohrer-beton":"triz-sufield","xy-plot-bubble-fertigungslinien":"xy-plot","xy-plot-bubble-projektportfolio":"xy-plot","xy-plot-hubschrauber-fehlerbalken":"xy-plot","xy-plot-hubschrauber-flyer":"xy-plot","xy-plot-pizza-delivery":"xy-plot","xy-plot-regression-collinear":"xy-plot","xy-plot-regression-outliers":"xy-plot"});

/** Beispiel-Id → Module, die es per exampleRefs (module.js) nutzen. */
export const EXAMPLE_REFS = Object.freeze({});
