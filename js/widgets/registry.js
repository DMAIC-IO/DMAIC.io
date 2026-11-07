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
import statsTable from './stats-table/schema.js';
import { mount as mountStatsTable } from './stats-table/mount.js';

export const WIDGETS = Object.freeze({
  'column-picker': { schema: columnPicker, mount: mountColumnPicker },
  'dataset-picker': { schema: datasetPicker, mount: mountDatasetPicker },
  'stats-table': { schema: statsTable, mount: mountStatsTable },
  'histogram-chart': { schema: histogramChart, mount: mountHistogramChart },
  'control-chart': { schema: controlChart, mount: mountControlChart },
  'probability-plot-chart': { schema: probabilityPlotChart, mount: mountProbabilityPlotChart },
  'scatter-chart': { schema: scatterChart, mount: mountScatterChart },
});
