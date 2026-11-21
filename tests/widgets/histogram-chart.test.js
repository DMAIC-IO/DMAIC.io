/**
 * D.Mike — Widget histogram-chart: Konfigurationsschlüssel normalCurveColor
 * (nicht editierbar) und seine Wirkung auf die gezeichnete Normalkurve.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { checkValue } from '../../js/core/model.js';
import histogramChart from '../../js/widgets/histogram-chart/schema.js';
import HistogramChart from '../../js/core/chart/types/histogram.js';

suite('histogram-chart: normalCurveColor', () => {
  test('Schema nimmt normalCurveColor an', () => {
    const cfg = { data: [1, 2, 3], showNormalCurve: true, normalCurveColor: 'var(--color-info)' };
    assertDeepEqual(checkValue(histogramChart.props.config, 'c', cfg), cfg);
  });

  test('normalCurveColor ist nicht editierbar', () => {
    assertTrue(!histogramChart.editable.base.includes('normalCurveColor'));
    assertDeepEqual(Object.keys(histogramChart.edits().fields || {}).filter((k) => k === 'normalCurveColor'), []);
  });

  test('der Pfad der Normalkurve trägt die konfigurierte Farbe', () => {
    const host = document.createElement('div');
    host.style.width = '900px';
    host.style.height = '480px';
    document.body.appendChild(host);
    const chart = new HistogramChart(host, { data: [1, 2, 2, 3, 3, 3, 4, 4, 5], showNormalCurve: true, normalCurveColor: 'rgb(1, 2, 3)' }, { language: 'de' });
    chart.render();
    // Der Chart löst CSS-Variablen beim Zeichnen auf; ein Literal bleibt unverändert.
    const curves = [...chart._svg.querySelectorAll('polyline')].filter((p) => p.getAttribute('stroke') === 'rgb(1, 2, 3)');
    assertEqual(curves.length, 1);
    chart.destroy();
    host.remove();
  });
});
