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

suite('ChartBase.exportCSV', () => {
  /** Run exportCSV with a fake chart; returns the CSV text of the download. */
  async function csvFor(locale) {
    let blob = null;
    const origClick = HTMLAnchorElement.prototype.click;
    const origUrl = URL.createObjectURL;
    HTMLAnchorElement.prototype.click = function () {};
    URL.createObjectURL = (b) => { blob = b; return 'blob:x'; };
    try {
      const fake = {
        locale,
        _getExportData: () => ({ headers: ['x', 'y'], rows: [[24.5, -0.000012], [1234.5, null]] }),
        _getFileName: () => 'chart-data',
      };
      ChartBase.prototype.exportCSV.call(fake);
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
      URL.createObjectURL = origUrl;
    }
    return (await blob.text()).replace(/^\ufeff/, '');
  }

  test('de: Dezimalkomma, verlustfrei, erste Zeile sep=;', async () => {
    const lines = (await csvFor('de')).split('\n');
    assertEqual(lines[0], 'sep=;');
    assertEqual(lines[1], 'x;y');
    assertEqual(lines[2], '24,5;-0,000012');
    assertEqual(lines[3], '1234,5;');
  });

  test('en: Dezimalpunkt, erste Zeile sep=;', async () => {
    const lines = (await csvFor('en')).split('\n');
    assertEqual(lines[0], 'sep=;');
    assertEqual(lines[2], '24.5;-0.000012');
  });
});
