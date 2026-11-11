/**
 * Tests für die Parser in core/parser/ und das Formatregister: CSV-Byteweg
 * (Trennzeichenerkennung, deutsches Zahlenformat), Typregel in JSON, XLSX und
 * AQDEF, Registerinhalt. DOM-frei.
 */
import { suite, test, assert, assertEqual, assertDeepEqual } from '../test-utils.js';
import { parseCsv } from '../../js/core/parser/csv.js';
import { parseJson } from '../../js/core/parser/json.js';
import { parseXlsx } from '../../js/core/parser/xlsx.js';
import { parseMpx } from '../../js/core/parser/mpx.js';
import { parseAqdef } from '../../js/core/parser/aqdef.js';
import { FORMATS, ACCEPT, TEXT_FORMATS, formatForFilename } from '../../js/core/parser/index.js';
import { ensureXLSX } from '../../js/core/export-utils.js';

const buf = (s) => new TextEncoder().encode(s).buffer;

suite('Parser — parseCsv', () => {
  test('deutsches CSV bei auto: Semikolon, Dezimalkomma', async () => {
    const out = await parseCsv(buf('A;B\n1,5;2,5\n3,5;4,5\n'), { delimiter: 'auto' });
    const cols = out.sheets[0].columns;
    assertEqual(cols.length, 2);
    assertEqual(cols[0].name, 'A');
    assertEqual(cols[0].type, 'numeric');
    assertDeepEqual(cols[0].values, [1.5, 3.5]);
    assertDeepEqual(cols[1].values, [2.5, 4.5]);
  });

  test('englisches CSV mit ; im Quote-Text bleibt Komma-getrennt', async () => {
    const out = await parseCsv(buf('Name,Note\nx,"a; b; c"\ny,"d; e"\n'), {});
    const cols = out.sheets[0].columns;
    assertEqual(cols.length, 2);
    assertDeepEqual(cols[1].values, ['a; b; c', 'd; e']);
  });

  test('Tausenderpunkt mit Dezimalkomma: 1.234,5 → 1234.5', async () => {
    const out = await parseCsv(buf('Wert;X\n1.234,5;1\n2,5;2\n'), {});
    const col = out.sheets[0].columns[0];
    assertEqual(col.type, 'numeric');
    assertDeepEqual(col.values, [1234.5, 2.5]);
  });

  test('englische Dezimalpunkte bleiben numerisch', async () => {
    const out = await parseCsv(buf('A,B\n1.5,2e3\n-3.25,4\n'), {});
    const cols = out.sheets[0].columns;
    assertDeepEqual(cols[0].values, [1.5, -3.25]);
    assertDeepEqual(cols[1].values, [2000, 4]);
  });

  test('Text-Spalte bleibt Text', async () => {
    const out = await parseCsv(buf('A;B\nfoo;1\nbar;2\n'), {});
    assertEqual(out.sheets[0].columns[0].type, 'text');
  });
});

const xlsxBuf = async (rows) => {
  const XLSX = await ensureXLSX();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'S1');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return out instanceof ArrayBuffer ? out : new Uint8Array(out).buffer;
};

suite('Parser — JSON', () => {
  test('Datumsspalte wird date', async () => {
    const out = await parseJson(buf('[{"d":"24.12.2026"},{"d":"01.01.2027"}]'), {});
    assertEqual(out.sheets[0].columns[0].type, 'date');
  });

  test('7 von 10 Zahlen: numeric, Rest null', async () => {
    const rows = [1, 2, 3, 4, 5, 6, 7, 'a', 'b', 'c'].map(v => ({ x: v }));
    const out = await parseJson(buf(JSON.stringify(rows)), {});
    const col = out.sheets[0].columns[0];
    assertEqual(col.type, 'numeric');
    assertDeepEqual(col.values, [1, 2, 3, 4, 5, 6, 7, null, null, null]);
  });

  test('6 von 10 Zahlen: text, nichts geht verloren', async () => {
    const rows = [1, 2, 3, 4, 5, 6, 'a', 'b', 'c', 'd'].map(v => ({ x: v }));
    const col = (await parseJson(buf(JSON.stringify(rows)), {})).sheets[0].columns[0];
    assertEqual(col.type, 'text');
    assertDeepEqual(col.values, ['1', '2', '3', '4', '5', '6', 'a', 'b', 'c', 'd']);
  });

  test('Währung und Prozent werden erkannt', async () => {
    const out = await parseJson(buf('[{"p":"5,00 €","q":"12 %"},{"p":"7,50 €","q":"15 %"}]'), {});
    const [p, q] = out.sheets[0].columns;
    assertEqual(p.type, 'currency');
    assertDeepEqual(p.values, [5, 7.5]);
    assertEqual(q.type, 'percent');
  });

  test('leere Spalte ist text', async () => {
    const out = await parseJson(buf('[{"a":1,"b":null},{"a":2,"b":null}]'), {});
    assertEqual(out.sheets[0].columns[1].type, 'text');
    assertDeepEqual(out.sheets[0].columns[1].values, [null, null]);
  });
});

suite('Parser — XLSX', () => {
  test('7 Zahlen und 3 Texte: numeric', async () => {
    const rows = [['x'], [1], [2], [3], [4], [5], [6], [7], ['a'], ['b'], ['c']];
    const out = await parseXlsx(await xlsxBuf(rows), {});
    const col = out.sheets[0].columns[0];
    assertEqual(col.type, 'numeric');
    assertDeepEqual(col.values, [1, 2, 3, 4, 5, 6, 7, null, null, null]);
  });

  test('Zahlenzellen und Textzellen, Kopfzeile abschaltbar', async () => {
    const out = await parseXlsx(await xlsxBuf([['A', 'B'], [1.5, 'x'], [2.5, 'y']]), { hasHeader: false });
    const cols = out.sheets[0].columns;
    assertEqual(out.sheets[0].rowCount, 3);
    assertEqual(cols[1].type, 'text');
  });
});

/** ZIP ohne Kompression (Methode 0); die Prüfsumme liest der Leser nicht. */
function storedZip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const cd = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const nm = enc.encode(name);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, nm.length, true);
    chunks.push(new Uint8Array(lh.buffer), nm, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true);
    ch.setUint16(28, nm.length, true);
    ch.setUint32(42, offset, true);
    cd.push(new Uint8Array(ch.buffer), nm);
    offset += 30 + nm.length + data.length;
  }
  const cdSize = cd.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...cd, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of all) { out.set(c, p); p += c.length; }
  return out.buffer;
}

const utf16Blob = (cells) => {
  const u = new Uint16Array(1 + cells.reduce((n, c) => n + c.length + 1, 0));
  let p = 0;
  u[p++] = 0xfeff;
  for (const c of cells) { for (const ch of c) u[p++] = ch.charCodeAt(0); u[p++] = 0; }
  return new Uint8Array(u.buffer);
};

suite('Parser — MPX', () => {
  test('Textspalte mit Zahlenwerten behält den Typ aus der Datei', async () => {
    const sheet = { Data: { Name: 'Blatt', Columns: [{ WorksheetVarBody: {
      Name: 'Charge',
      VarData: { VarDataBody: { CellCt: 3, HasTextData: true, TextData: '/blobs/blob1?size=3' } },
    } }] } };
    const zip = storedZip({
      'sheets/1/sheet.json': new TextEncoder().encode(JSON.stringify(sheet)),
      'blobs/blob1': utf16Blob(['1', '2', '3']),
    });
    const col = (await parseMpx(zip)).sheets[0].columns[0];
    assertEqual(col.type, 'text');
    assertDeepEqual(col.values, ['1', '2', '3']);
  });
});

suite('Parser — AQDEF', () => {
  test('Merkmalswerte bleiben numerisch', async () => {
    const txt = 'K0100 1\nK2002/1 Länge\nK0001/1 1,5\nK0001/1 2,5\nK0001/1 3,5\n';
    const out = await parseAqdef(buf(txt), { encoding: 'utf-8' });
    const col = out.sheets[0].columns[0];
    assertEqual(col.type, 'numeric');
    assertDeepEqual(col.values, [1.5, 2.5, 3.5]);
  });
});

suite('Parser — Formatregister', () => {
  test('Reihenfolge der Kennungen', () => {
    assertDeepEqual(FORMATS.map(f => f.id), ['mpx', 'csv', 'xlsx', 'json', 'aqdef']);
  });

  test('formatForFilename: Endung ohne Rücksicht auf Groß-/Kleinschreibung', () => {
    assertEqual(formatForFilename('x.DFQ').id, 'aqdef');
    assertEqual(formatForFilename('daten.tsv').id, 'csv');
    assertEqual(formatForFilename('a.b.JSONL').id, 'json');
    assertEqual(formatForFilename('x.pdf'), null);
    assertEqual(formatForFilename('ohne'), null);
  });

  test('ACCEPT enthält alle 14 Endungen', () => {
    const exts = ACCEPT.split(',');
    assertEqual(exts.length, 14);
    assertDeepEqual(exts, ['.mpx', '.csv', '.tsv', '.txt', '.xlsx', '.xlsm', '.xls', '.ods',
      '.json', '.ndjson', '.jsonl', '.dfq', '.dfd', '.dfx']);
    assert(exts.includes('.dfq'));
  });

  test('TEXT_FORMATS', () => {
    assertDeepEqual(TEXT_FORMATS, ['csv', 'json']);
  });

  test('Optionsschemata', () => {
    const get = (id) => FORMATS.find(f => f.id === id).options;
    assertEqual(get('xlsx').shape.hasHeader.default, true);
    assertEqual(get('aqdef').shape.encoding.default, 'windows-1252');
    assertEqual(get('csv').shape.delimiter.default, 'auto');
    assertEqual(get('json'), null);
    assertEqual(get('mpx'), null);
  });
});
