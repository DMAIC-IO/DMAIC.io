/**
 * ChartBase margins follow the drawn elements: everything shown keeps
 * DEFAULT_MARGIN, hidden elements give their room to the plot area.
 */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import ScatterChart from '../../../js/core/chart/types/scatter.js';
import BarChart, { wrapCategoryLabel } from '../../../js/core/chart/types/bar.js';
import IndividualValuePlotChart from '../../../js/core/chart/types/individual-value-plot.js';
import MultiVariChart from '../../../js/core/chart/types/multi-vari.js';
import {
  DEFAULT_MARGIN, COMPACT_MARGIN, X_TICKS_BOTTOM, X_LABEL_ONLY_BOTTOM, Y_LABEL_GUTTER,
} from '../../../js/core/chart/chart-base.js';

function mount(Type, cfg) {
  const host = document.createElement('div');
  host.style.width = '600px';
  host.style.height = '400px';
  document.body.appendChild(host);
  const chart = new Type(host, cfg, { language: 'de' });
  chart.render();
  return { host, chart };
}

/** Margins as the plot area reveals them. */
function margins(chart) {
  const pa = chart._getPlotArea();
  return { top: pa.y, bottom: pa.totalH - pa.y - pa.h, left: pa.x };
}

const XY = { series: [{ name: 'A', x: [1, 2, 3], y: [4, 5, 6] }] };
const ALL_ON = { ...XY, title: 'T', xLabel: 'X', yLabel: 'Y', showLegend: false };
const ALL_OFF = {
  ...ALL_ON, showTitle: false, showXLabel: false, showYLabel: false,
  showXTicks: false, showYTicks: false,
};

suite('ChartBase margins', () => {
  test('everything shown keeps DEFAULT_MARGIN top and bottom, left >= default', () => {
    const { host, chart } = mount(ScatterChart, ALL_ON);
    const m = margins(chart);
    assertEqual(m.top, DEFAULT_MARGIN.top);
    assertEqual(m.bottom, DEFAULT_MARGIN.bottom);
    assertTrue(m.left >= DEFAULT_MARGIN.left, `left ${m.left}`);
    chart.destroy(); host.remove();
  });

  test('everything hidden gives the compact margins', () => {
    const { host, chart } = mount(ScatterChart, ALL_OFF);
    assertEqual(JSON.stringify(margins(chart)),
      JSON.stringify({ top: COMPACT_MARGIN.top, bottom: COMPACT_MARGIN.bottom, left: COMPACT_MARGIN.left }));
    chart.destroy(); host.remove();
  });

  test('an empty title counts as hidden', () => {
    const { host, chart } = mount(ScatterChart, { ...ALL_ON, title: '' });
    assertEqual(margins(chart).top, COMPACT_MARGIN.top);
    chart.destroy(); host.remove();
  });

  test('x ticks without x title reserve the tick gutter; x title without ticks moves up', () => {
    let { host, chart } = mount(ScatterChart, { ...ALL_OFF, showXTicks: true });
    assertEqual(margins(chart).bottom, X_TICKS_BOTTOM);
    chart.destroy(); host.remove();
    ({ host, chart } = mount(ScatterChart, { ...ALL_OFF, showXLabel: true }));
    assertEqual(margins(chart).bottom, X_LABEL_ONLY_BOTTOM);
    const label = [...host.querySelectorAll('svg text')].find(t => t.textContent === 'X');
    const pa = chart._getPlotArea();
    assertEqual(Number(label.getAttribute('y')), pa.y + pa.h + 20);
    chart.destroy(); host.remove();
  });

  test('y title without y ticks reserves only the title gutter', () => {
    const { host, chart } = mount(ScatterChart, { ...ALL_OFF, showYLabel: true });
    assertEqual(margins(chart).left, COMPACT_MARGIN.left + Y_LABEL_GUTTER);
    chart.destroy(); host.remove();
  });

  test('bar keeps room for its category labels without x ticks', () => {
    const { host, chart } = mount(BarChart, {
      categories: ['a', 'b', 'c'], series: [{ name: 'S', values: [1, 2, 3] }],
      showTitle: false, showXLabel: false, showYLabel: false, showXTicks: false, showYTicks: false,
    });
    assertEqual(margins(chart).bottom, X_TICKS_BOTTOM);
    chart.destroy(); host.remove();
  });

  test('bar wraps category labels that are wider than their slot instead of rotating them', () => {
    const cats = [
      'Prozesse verbessern (inkl. 8D/PDCA)', 'Projekte planen und auswerten', 'Daten auswerten und berichten',
      'Methoden anwenden (z. B. Six Sigma, 8D)', 'Moderation/Coaching anderer', 'Trainer', 'Methodenkoordination', 'keine davon',
    ];
    const { host, chart } = mount(BarChart, {
      categories: cats, groups: [{ name: 'S', values: cats.map(() => 1) }], showXLabel: false,
    });
    const pa = chart._getPlotArea();
    const slot = pa.w / cats.length;
    const labels = [...host.querySelectorAll('text.dmike-bar__category')];
    assertEqual(labels.length, cats.length, 'one label per category');
    assertTrue(labels.every(t => !t.getAttribute('transform')), 'no label is rotated');
    for (const t of labels) {
      const lines = [...t.querySelectorAll('tspan')];
      const parts = lines.length ? lines : [t];
      for (const line of parts) {
        assertTrue(line.getComputedTextLength() <= slot, `"${line.textContent}" fits ${Math.round(slot)} px`);
      }
    }
    const most = Math.max(...labels.map(t => Math.max(1, t.querySelectorAll('tspan').length)));
    assertTrue(most > 1, 'long labels take more than one line');
    const lineHeight = Math.round(chart.config.tickSize * 1.25);
    assertEqual(margins(chart).bottom, X_TICKS_BOTTOM + (most - 1) * lineHeight, 'bottom grows by the extra lines');
    const box = labels[0].getBBox();
    assertTrue(box.y + box.height <= pa.totalH, 'the last line stays inside the chart');
    chart.destroy(); host.remove();
  });

  test('bar keeps short category labels on one line', () => {
    const cats = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const { host, chart } = mount(BarChart, {
      categories: cats, groups: [{ name: 'S', values: cats.map(() => 1) }], showXLabel: false,
    });
    const labels = [...host.querySelectorAll('text.dmike-bar__category')];
    assertEqual(labels.map(t => t.textContent).join(','), cats.join(','));
    assertTrue(labels.every(t => t.querySelectorAll('tspan').length === 0 && !t.getAttribute('transform')), 'plain, unrotated');
    assertEqual(margins(chart).bottom, X_TICKS_BOTTOM);
    chart.destroy(); host.remove();
  });

  test('bar moves the x title below wrapped category labels', () => {
    const cats = ['Prozesse verbessern (inkl. 8D/PDCA)', 'Projekte planen und auswerten', 'Trainer', 'keine davon',
      'Daten auswerten und berichten', 'Methodenkoordination', 'Moderation/Coaching anderer', 'x'];
    const { host, chart } = mount(BarChart, {
      categories: cats, groups: [{ name: 'S', values: cats.map(() => 1) }], xLabel: 'Antwort',
    });
    const labels = [...host.querySelectorAll('text.dmike-bar__category')];
    const lowest = Math.max(...labels.map(t => { const b = t.getBBox(); return b.y + b.height; }));
    const title = [...host.querySelectorAll('svg text')].find(t => t.textContent === 'Antwort');
    assertTrue(title.getBBox().y >= lowest, `x title ${title.getBBox().y} below labels ${lowest}`);
    assertTrue(title.getBBox().y + title.getBBox().height <= chart._getPlotArea().totalH, 'x title inside the chart');
    chart.destroy(); host.remove();
  });

  test('bar spreads its categories over the full plot width', () => {
    const cats = Array.from({ length: 25 }, (_, i) => `Kategorie ${i + 1}`);
    const { host, chart } = mount(BarChart, {
      categories: cats, groups: [{ name: 'S', values: cats.map(() => 1) }], showXLabel: false,
    });
    const pa = chart._getPlotArea();
    assertTrue(Math.abs(chart._xScale(-0.5) - pa.x) < 0.5, `first slot starts at the plot edge (${chart._xScale(-0.5)} vs ${pa.x})`);
    assertTrue(Math.abs(chart._xScale(cats.length - 0.5) - (pa.x + pa.w)) < 0.5, 'last slot ends at the plot edge');
    chart.destroy(); host.remove();
  });

  test('bar keeps rotated category labels inside the chart and the x title below them', () => {
    const base = ['Daten visualisieren', 'Ursache-Wirkungs-Analyse (z. B. Ishikawa)', 'Versuchsplanung: Screening, Split-Plot',
      'Statistische Toleranzanalyse', 'Monte-Carlo-Simulation', 'Gage R&R'];
    const cats = Array.from({ length: 25 }, (_, i) => base[i % base.length]);
    const { host, chart } = mount(BarChart, {
      categories: cats, groups: [{ name: 'S', values: cats.map(() => 1) }], xLabel: 'Antwort', yLabel: '%',
    });
    const svg = host.querySelector('svg');
    const frame = svg.getBoundingClientRect();
    const labels = [...host.querySelectorAll('text.dmike-bar__category')];
    assertTrue(labels.every(t => t.getAttribute('transform')), 'labels are rotated');
    let lowest = 0;
    for (const t of labels) {
      const r = t.getBoundingClientRect();
      assertTrue(r.left >= frame.left - 0.5, `"${t.textContent}" not cut off left (${Math.round(r.left - frame.left)})`);
      assertTrue(r.bottom <= frame.bottom + 0.5, `"${t.textContent}" not cut off below (${Math.round(frame.bottom - r.bottom)})`);
      lowest = Math.max(lowest, r.bottom);
    }
    const title = [...svg.querySelectorAll('text')].find(t => t.textContent === 'Antwort');
    const tr = title.getBoundingClientRect();
    assertTrue(tr.top >= lowest, 'x title below the rotated labels');
    assertTrue(tr.bottom <= frame.bottom + 0.5, 'x title inside the chart');
    chart.destroy(); host.remove();
  });

  test('wrapCategoryLabel breaks at spaces, splits over-long words and ellipsises past the line limit', () => {
    const measure = (str) => str.length * 6;
    assertEqual(JSON.stringify(wrapCategoryLabel('Trainer', 60, measure, 3)), JSON.stringify(['Trainer']));
    assertEqual(JSON.stringify(wrapCategoryLabel('Daten auswerten und berichten', 60, measure, 3)),
      JSON.stringify(['Daten', 'auswerten', 'und…']));
    assertEqual(JSON.stringify(wrapCategoryLabel('keine davon', 72, measure, 3)), JSON.stringify(['keine davon']));
    assertEqual(JSON.stringify(wrapCategoryLabel('Methodenkoordination', 60, measure, 3)),
      JSON.stringify(['Methodenko', 'ordination']));
    assertEqual(JSON.stringify(wrapCategoryLabel('', 60, measure, 3)), JSON.stringify(['']));
  });

  test('individual-value plot keeps its hanging category labels inside the chart', () => {
    const { host, chart } = mount(IndividualValuePlotChart, {
      groups: [{ name: 'A', values: [1, 2, 3] }, { name: 'B', values: [2, 3, 4] }],
      showTitle: false, showXLabel: false, showYLabel: false,
    });
    const tickSize = chart.config.tickSize;
    const label = [...host.querySelectorAll('svg text')].find(t => t.textContent === 'A');
    const pa = chart._getPlotArea();
    // hanging baseline: the glyphs extend about one font height below `y`
    assertTrue(Number(label.getAttribute('y')) + tickSize <= pa.totalH, 'label inside the svg');
    chart.destroy(); host.remove();
  });

  test('multi-vari keeps its panel band above the plot without a title', () => {
    const { host, chart } = mount(MultiVariChart, { title: '', showTitle: false, panels: [] });
    assertEqual(margins(chart).top, COMPACT_MARGIN.top + 20);
    chart.destroy(); host.remove();
  });
});
