import { suite, test, assert, assertEqual } from '../test-utils.js';
import { ensureXLSX } from '../../js/core/export-utils.js';
import { ensureKaTeX } from '../../js/core/katex-loader.js';

suite('lazy library loaders', () => {
  test('ensureXLSX resolves to SheetJS and imports once', async () => {
    const p = ensureXLSX();
    assertEqual(ensureXLSX(), p, 'same promise');
    const XLSX = await p;
    assertEqual(typeof XLSX.utils.book_new, 'function');
  });

  test('ensureKaTeX resolves to KaTeX and imports once', async () => {
    const p = ensureKaTeX();
    assertEqual(ensureKaTeX(), p, 'same promise');
    const katex = await p;
    assert(typeof katex.render === 'function', 'katex.render');
  });
});
