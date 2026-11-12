/**
 * D.Mike — Widget-Registry (registry.js)
 *
 * Alle Widgets mit Schema und Einhänger; `app.js` reicht sie an
 * `x-widget` und `x-field`. Ein neues Widget: Ordner `js/widgets/<name>/`
 * mit `schema.js` und `mount.js`, hier eintragen.
 */
import columnPicker from './column-picker/schema.js';
import { mount as mountColumnPicker } from './column-picker/mount.js';
import datasetPicker from './dataset-picker/schema.js';
import { mount as mountDatasetPicker } from './dataset-picker/mount.js';
import histogramChart from './histogram-chart/schema.js';
import { mount as mountHistogramChart } from './histogram-chart/mount.js';
import controlChart from './control-chart/schema.js';
import { mount as mountControlChart } from './control-chart/mount.js';
import probabilityPlotChart from './probability-plot-chart/schema.js';
import { mount as mountProbabilityPlotChart } from './probability-plot-chart/mount.js';
import scatterChart from './scatter-chart/schema.js';
import { mount as mountScatterChart } from './scatter-chart/mount.js';
import barChart from './bar-chart/schema.js';
import { mount as mountBarChart } from './bar-chart/mount.js';
import mosaicChart from './mosaic-chart/schema.js';
import { mount as mountMosaicChart } from './mosaic-chart/mount.js';
import runChart from './run-chart/schema.js';
import { mount as mountRunChart } from './run-chart/mount.js';
import paretoChart from './pareto-chart/schema.js';
import { mount as mountParetoChart } from './pareto-chart/mount.js';
import boxplotChart from './boxplot-chart/schema.js';
import { mount as mountBoxplotChart } from './boxplot-chart/mount.js';
import individualValuePlotChart from './individual-value-plot-chart/schema.js';
import { mount as mountIndividualValuePlotChart } from './individual-value-plot-chart/mount.js';
import heatmapChart from './heatmap-chart/schema.js';
import { mount as mountHeatmapChart } from './heatmap-chart/mount.js';
import multiVariChart from './multi-vari-chart/schema.js';
import { mount as mountMultiVariChart } from './multi-vari-chart/mount.js';
import gageRunChart from './gage-run-chart/schema.js';
import { mount as mountGageRunChart } from './gage-run-chart/mount.js';
import trendChart from './trend-chart/schema.js';
import { mount as mountTrendChart } from './trend-chart/mount.js';
import pieChart from './pie-chart/schema.js';
import { mount as mountPieChart } from './pie-chart/mount.js';
import contourChart from './contour-chart/schema.js';
import { mount as mountContourChart } from './contour-chart/mount.js';
import statsTable from './stats-table/schema.js';
import { mount as mountStatsTable } from './stats-table/mount.js';
import algoLabLink from './algo-lab-link/schema.js';
import { mount as mountAlgoLabLink } from './algo-lab-link/mount.js';

export const WIDGETS = Object.freeze({
  'column-picker': { schema: columnPicker, mount: mountColumnPicker },
  'dataset-picker': { schema: datasetPicker, mount: mountDatasetPicker },
  'stats-table': { schema: statsTable, mount: mountStatsTable },
  'histogram-chart': { schema: histogramChart, mount: mountHistogramChart },
  'control-chart': { schema: controlChart, mount: mountControlChart },
  'probability-plot-chart': { schema: probabilityPlotChart, mount: mountProbabilityPlotChart },
  'scatter-chart': { schema: scatterChart, mount: mountScatterChart },
  'bar-chart': { schema: barChart, mount: mountBarChart },
  'mosaic-chart': { schema: mosaicChart, mount: mountMosaicChart },
  'run-chart': { schema: runChart, mount: mountRunChart },
  'pareto-chart': { schema: paretoChart, mount: mountParetoChart },
  'boxplot-chart': { schema: boxplotChart, mount: mountBoxplotChart },
  'individual-value-plot-chart': { schema: individualValuePlotChart, mount: mountIndividualValuePlotChart },
  'heatmap-chart': { schema: heatmapChart, mount: mountHeatmapChart },
  'contour-chart': { schema: contourChart, mount: mountContourChart },
  'multi-vari-chart': { schema: multiVariChart, mount: mountMultiVariChart },
  'gage-run-chart': { schema: gageRunChart, mount: mountGageRunChart },
  'algo-lab-link': { schema: algoLabLink, mount: mountAlgoLabLink },
  'trend-chart': { schema: trendChart, mount: mountTrendChart },
  'pie-chart': { schema: pieChart, mount: mountPieChart },
});
