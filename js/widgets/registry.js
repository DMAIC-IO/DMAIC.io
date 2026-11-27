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
import ganttChart from './gantt-chart/schema.js';
import { mount as mountGanttChart } from './gantt-chart/mount.js';
import cumulativeCostChart from './cumulative-cost-chart/schema.js';
import { mount as mountCumulativeCostChart } from './cumulative-cost-chart/mount.js';
import pieChart from './pie-chart/schema.js';
import { mount as mountPieChart } from './pie-chart/mount.js';
import contourChart from './contour-chart/schema.js';
import { mount as mountContourChart } from './contour-chart/mount.js';
import nodeDiagram from './node-diagram/schema.js';
import { mount as mountNodeDiagram } from './node-diagram/mount.js';
import nodeLinks from './node-links/schema.js';
import { mount as mountNodeLinks } from './node-links/mount.js';
import datagrid from './datagrid/schema.js';
import { mount as mountDatagrid } from './datagrid/mount.js';
import statsTable from './stats-table/schema.js';
import { mount as mountStatsTable } from './stats-table/mount.js';
import richText from './rich-text/schema.js';
import { mount as mountRichText } from './rich-text/mount.js';
import colorLegend from './color-legend/schema.js';
import { mount as mountColorLegend } from './color-legend/mount.js';
import algoLabLink from './algo-lab-link/schema.js';
import { mount as mountAlgoLabLink } from './algo-lab-link/mount.js';

export const WIDGETS = Object.freeze({
  'column-picker': { schema: columnPicker, mount: mountColumnPicker },
  'rich-text': { schema: richText, mount: mountRichText },
  'dataset-picker': { schema: datasetPicker, mount: mountDatasetPicker },
  'stats-table': { schema: statsTable, mount: mountStatsTable },
  datagrid: { schema: datagrid, mount: mountDatagrid },
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
  'color-legend': { schema: colorLegend, mount: mountColorLegend },
  'multi-vari-chart': { schema: multiVariChart, mount: mountMultiVariChart },
  'gage-run-chart': { schema: gageRunChart, mount: mountGageRunChart },
  'algo-lab-link': { schema: algoLabLink, mount: mountAlgoLabLink },
  'trend-chart': { schema: trendChart, mount: mountTrendChart },
  'gantt-chart': { schema: ganttChart, mount: mountGanttChart },
  'cumulative-cost-chart': { schema: cumulativeCostChart, mount: mountCumulativeCostChart },
  'pie-chart': { schema: pieChart, mount: mountPieChart },
  'node-diagram': { schema: nodeDiagram, mount: mountNodeDiagram },
  'node-links': { schema: nodeLinks, mount: mountNodeLinks },
});
