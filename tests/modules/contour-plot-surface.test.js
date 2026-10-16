import { suite, test, assertEqual, assertClose } from '../test-utils.js';
import { scanSurface } from '../../js/modules/contour-plot/contour-plot-surface.js';

suite('contour-plot scanSurface', () => {
  test('findet das Maximum einer nach unten offenen Parabel', () => {
    const r = scanSurface((x, y) => 10 - x * x - y * y, { xMin: -1, xMax: 1, yMin: -1, yMax: 1 }, 21);
    assertClose(r.zMax, 10, 1e-12);
    assertClose(r.optimum.x, 0, 1e-12);
    assertClose(r.optimum.y, 0, 1e-12);
    assertClose(r.zMin, 8, 1e-12);
    assertEqual(r.grid.length, 21);
  });
});
