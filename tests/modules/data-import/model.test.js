/**
 * Tests für data-import/domain (Model, Migration).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { checkValue } from '../../../js/core/model.js';
import { State } from '../../../js/modules/data-import/domain/model.js';
import { from0 } from '../../../js/modules/data-import/domain/migrations.js';
import { FORMATS } from '../../../js/core/parser/index.js';
import { CSV_PRESETS } from '../../../js/core/parser/csv.js';
import { DEFAULT_CSV_OPTIONS, DEFAULT_XLSX_OPTIONS, DEFAULT_AQDEF_OPTIONS } from '../../../js/modules/data-import/data-import-model.js';

const errOf = (fn) => { try { fn(); } catch (e) { return e; } return null; };
const derive = (m, name) => State.schema.derived[name].call(m);
const withFile = (file) => State.fromJSON({ file, options: undefined });
const shape = (s) => Object.fromEntries(Object.entries(s.shape).map(([k, v]) => [k, { kind: v.kind, values: v.values ? [...v.values] : undefined, default: v.default }]));

suite('data-import Model: Vorgaben', () => {
  test('Vorgaben entsprechen den alten', () => {
    const m = new State();
    assertDeepEqual({ ...m.options.csv }, DEFAULT_CSV_OPTIONS);
    assertDeepEqual({ ...m.options.xlsx }, DEFAULT_XLSX_OPTIONS);
    assertDeepEqual({ ...m.options.aqdef }, DEFAULT_AQDEF_OPTIONS);
    assertEqual(m.file, null);
    assertEqual(m.activeSheet, 0);
  });
  test('Schema entspricht dem Parser-Register', () => {
    const opts = State.schema.fields.options.shape;
    for (const f of FORMATS) {
      if (!f.options) { assertEqual(opts[f.id], undefined, `${f.id} ohne Optionen`); continue; }
      assertDeepEqual(shape(opts[f.id]), shape(f.options), f.id);
    }
  });
  test('Profile entsprechen CSV_PRESETS', () => {
    for (const id of Object.keys(CSV_PRESETS)) {
      const m = new State();
      m.applyPreset({ preset: id });
      assertDeepEqual({ ...m.options.csv }, { ...CSV_PRESETS[id], preset: id }, id);
    }
    assertDeepEqual([...State.schema.fields.options.shape.csv.shape.preset.values], Object.keys(CSV_PRESETS));
  });
});

suite('data-import Migration', () => {
  test('Altform wird übernommen', () => {
    const m = State.fromJSON({ file: { name: 'a.csv', size: 3, formatId: 'csv' }, csvOptions: { delimiter: 'semicolon', skipRows: 4 }, xlsxOptions: { hasHeader: false }, aqdefOptions: { encoding: 'utf-8' } });
    assertEqual(m.options.csv.delimiter, 'semicolon');
    assertEqual(m.options.csv.skipRows, 4);
    assertEqual(m.options.csv.encoding, 'utf-8');
    assertEqual(m.options.csv.hasHeader, true);
    assertEqual(m.options.xlsx.hasHeader, false);
    assertEqual(m.options.aqdef.encoding, 'utf-8');
    assertEqual(m.file.source, 'file');
  });
  test('leere Altform ergibt Vorgaben', () => {
    assertDeepEqual({ ...State.fromJSON({}).options.csv }, DEFAULT_CSV_OPTIONS);
    assertEqual(State.fromJSON({}).file, null);
    assertEqual(from0(null).activeSheet, 0);
  });
  test('ungültiger Wert lädt mit Vorgabe', () => {
    assertEqual(State.fromJSON({ csvOptions: { delimiter: 'x' } }).options.csv.delimiter, 'auto');
  });
});

suite('data-import Model: Kommandos und Ableitungen', () => {
  test('applyPreset setzt Profil', () => {
    const m = new State();
    m.applyPreset({ preset: 'zeiss-calypso' });
    assertEqual(m.options.csv.delimiter, 'semicolon');
    assertEqual(m.options.csv.encoding, 'windows-1252');
    assertEqual(m.options.csv.skipRows, 4);
    assertEqual(m.options.csv.preset, 'zeiss-calypso');
  });
  test('unbekanntes Profil wird abgewiesen', () => {
    assertEqual(errOf(() => new State().applyPreset({ preset: 'nope' })).param, 'preset');
  });
  test('activeParams', () => {
    const f = (formatId, source = 'file') => ({ name: 'x', size: 1, formatId, source });
    assertEqual(derive(withFile(f('csv')), 'activeParams').length, 5);
    const text = derive(withFile(f('csv', 'text')), 'activeParams');
    assertEqual(text.length, 4);
    assertEqual(text.includes('options.csv.encoding'), false);
    assertDeepEqual(derive(withFile(f('xlsx')), 'activeParams'), ['options.xlsx.hasHeader']);
    assertDeepEqual(derive(withFile(f('aqdef')), 'activeParams'), ['options.aqdef.encoding']);
    assertDeepEqual(derive(withFile(f('json')), 'activeParams'), []);
    assertDeepEqual(derive(withFile(f('mpx')), 'activeParams'), []);
    assertDeepEqual(derive(new State(), 'activeParams'), []);
  });
  test('textFormats', () => {
    assertDeepEqual(derive(new State(), 'textFormats'), ['csv', 'json', 'aqdef']);
  });
  test('negatives skipRows wird abgewiesen', () => {
    const m = new State();
    const bad = { ...m.options, csv: { ...m.options.csv, skipRows: -1 } };
    assertEqual(errOf(() => { m.options = bad; }) !== null, true);
    assertEqual(m.options.csv.skipRows, 0);
    assertEqual(errOf(() => checkValue(State.schema.fields.options.shape.csv.shape.skipRows, 'options.csv.skipRows', -1)) !== null, true);
  });
});
