/**
 * Tests für runExport (js/core/exporter.js): Dateien je Format, Meldungen,
 * Fehlerpfad. Ein-/Ausgabe über einen Ersatz für io — kein echter Download.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { runExport } from '../../js/core/exporter.js';

/** Fake-Umgebung; `log` hält jede Aktion in Reihenfolge. */
function setup(exportsDef, { failRaster = false, failXlsx = false, lang = 'en' } = {}) {
  const log = [];
  const files = {};
  const component = { model: { rows: [['K'], ['a"b']] }, label: 'X' };
  const ui = {
    exports: exportsDef,
    component,
    moduleId: 'demo',
    i18n: { getLanguage: () => lang, t: (k, p) => (p ? `${k}|${JSON.stringify(p)}` : k) },
    notify: (...a) => log.push(['notify', ...a]),
  };
  const io = {
    downloadFile: (content, name, mime) => { files[name] = { content, mime, bom: true }; log.push(['file', name]); },
    downloadBlob: async (blob, name) => { files[name] = { blob, type: blob.type }; log.push(['file', name]); },
    ensureXLSX: async () => {
      if (failXlsx) throw new Error('chunk');
      return {
        utils: {
          book_new: () => ({ sheets: [] }),
          aoa_to_sheet: (rows) => ({ rows }),
          book_append_sheet: (wb, sheet, name) => wb.sheets.push([name, sheet.rows]),
        },
        writeFile: (wb, name) => { files[name] = { sheets: wb.sheets }; log.push(['file', name]); },
      };
    },
    svgStringToPngBlob: async (svg, opts) => {
      log.push(['raster', opts]);
      if (failRaster) throw new Error('raster');
      await new Promise((r) => setTimeout(r, 5));
      return new Blob([svg], { type: 'image/png' });
    },
    fontFaces: async () => '@font-face{x}',
  };
  return { ui, io, log, files, component };
}

const SVG = '<svg width="10" height="4"><rect/></svg>';

suite('runExport', () => {
  test('csv: Text aus table(), Download mit BOM, this = Komponente', async () => {
    const { ui, io, log, files } = setup({ table() { return this.model.rows; } });
    await runExport(ui, 'csv', io);
    assertEqual(files['demo.csv'].content, 'sep=;\n"K"\n"a""b"\n');
    assertEqual(files['demo.csv'].mime, 'text/csv;charset=utf-8');
    assertDeepEqual(log.at(-1), ['notify', 'CSV', 'success', 'status.ok']);
  });

  test('csv: Dezimalzeichen der App-Sprache', async () => {
    const { ui, io, files } = setup({ table() { return [['a', 1.5]]; } }, { lang: 'de' });
    await runExport(ui, 'csv', io);
    assertEqual(files['demo.csv'].content, 'sep=;\n"a";1,5\n');
  });

  test('xlsx: Zahl bleibt Zahlzelle', async () => {
    const { ui, io, files } = setup({ table() { return [['a', 1.5]]; } }, { lang: 'de' });
    await runExport(ui, 'xlsx', io);
    const cell = files['demo.xlsx'].sheets[0][1][0][1];
    assertEqual(typeof cell, 'number');
    assertEqual(cell, 1.5);
  });

  test('json: ohne BOM als application/json, fileName als Text', async () => {
    const { ui, io, files } = setup({ fileName: 'sipoc', tree() { return { a: 1 }; } });
    await runExport(ui, 'json', io);
    const f = files['sipoc.json'];
    assertEqual(f.type, 'application/json');
    assertEqual(await f.blob.text(), '{\n  "a": 1\n}');
  });

  test('fileName als Funktion mit this = Komponente', async () => {
    const { ui, io, files } = setup({ fileName() { return `n-${this.label}`; }, tree() { return 1; } });
    await runExport(ui, 'json', io);
    assertTrue('n-X.json' in files);
  });

  test('xlsx aus table(): ein Blatt mit dem Modulnamen', async () => {
    const { ui, io, log, files } = setup({ table() { return [['K'], [1]]; } });
    await runExport(ui, 'xlsx', io);
    assertDeepEqual(files['demo.xlsx'].sheets, [['modules.demo.name', [['K'], [1]]]]);
    assertDeepEqual(log.at(-1), ['notify', 'Excel', 'success', 'status.ok']);
  });

  test('xlsx aus tables(): ein Blatt je Eintrag, Namen bereinigt', async () => {
    const { ui, io, files } = setup({ table() { return []; }, tables() { return { 'A/B': [['x']], C: [['y']] }; } });
    await runExport(ui, 'xlsx', io);
    assertDeepEqual(files['demo.xlsx'].sheets, [['AB', [['x']]], ['C', [['y']]]]);
  });

  test('xlsx: Ladefehler von SheetJS endet still', async () => {
    const { ui, io, log } = setup({ table() { return []; } }, { failXlsx: true });
    await runExport(ui, 'xlsx', io);
    assertEqual(log.filter(([k]) => k === 'notify').length, 0);
  });

  test('svg: image() als image/svg+xml', async () => {
    const { ui, io, files } = setup({ image() { return SVG; } });
    await runExport(ui, 'svg', io);
    assertEqual(files['demo.svg'].type, 'image/svg+xml');
    assertEqual(await files['demo.svg'].blob.text(), SVG);
  });

  test('png: Größe aus dem SVG, Schriften eingebettet, Meldung erst nach fertigem Bild', async () => {
    const { ui, io, log, files } = setup({ async image() { return SVG; } });
    await runExport(ui, 'png', io);
    assertDeepEqual(log.map(([k]) => k), ['raster', 'file', 'notify']);
    assertDeepEqual(log[0][1], { width: 10, height: 4, scale: 2 });
    assertEqual(await files['demo.png'].blob.text(), '<svg width="10" height="4"><defs><style>@font-face{x}</style></defs><rect/></svg>');
    assertDeepEqual(log.at(-1), ['notify', 'PNG', 'success', 'status.ok']);
  });

  test('png ohne Schriften: unverändertes SVG', async () => {
    const { ui, io, files } = setup({ image() { return SVG; } });
    io.fontFaces = async () => '';
    await runExport(ui, 'png', io);
    assertEqual(await files['demo.png'].blob.text(), SVG);
  });

  test('Rasterfehler → export.failed, keine Erfolgsmeldung', async () => {
    const { ui, io, log } = setup({ image() { return SVG; } }, { failRaster: true });
    const orig = console.error; console.error = () => {};
    try { await runExport(ui, 'png', io); } finally { console.error = orig; }
    assertDeepEqual(log.filter(([k]) => k === 'notify'), [['notify', 'export.failed|{"format":"PNG"}', 'error']]);
  });

  test('Mapper wirft → export.failed', async () => {
    const { ui, io, log } = setup({ table() { throw new Error('kaputt'); } });
    const orig = console.error; console.error = () => {};
    try { await runExport(ui, 'csv', io); } finally { console.error = orig; }
    assertDeepEqual(log, [['notify', 'export.failed|{"format":"CSV"}', 'error']]);
  });

  test('json: tree() liefert undefined → export.failed, keine Datei', async () => {
    const { ui, io, log, files } = setup({ tree() { return undefined; } });
    const orig = console.error; console.error = () => {};
    try { await runExport(ui, 'json', io); } finally { console.error = orig; }
    assertDeepEqual(log, [['notify', 'export.failed|{"format":"JSON"}', 'error']]);
    assertDeepEqual(Object.keys(files), []);
  });
});
