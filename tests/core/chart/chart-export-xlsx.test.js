import { suite, test, assertEqual } from '../../test-utils.js';
import ChartBase from '../../../js/core/chart/chart-base.js';

suite('ChartBase.exportXLSX', () => {
  test('writes <fileName>.xlsx (SheetJS reached through ensureXLSX)', async () => {
    const downloads = [];
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
    try {
      const fake = {
        _getExportData: () => ({ headers: ['x'], rows: [[1], [2]] }),
        _getFileName: () => 'chart-data',
      };
      await ChartBase.prototype.exportXLSX.call(fake);
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
    }
    assertEqual(downloads.at(-1), 'chart-data.xlsx');
  });
});
