import { suite, test, assertEqual } from '../test-utils.js';
import {
  State,
  DEFAULT_CSV_OPTIONS,
  DEFAULT_XLSX_OPTIONS,
  DEFAULT_AQDEF_OPTIONS,
  clampSkipRows,
} from '../../js/modules/data-import/data-import-model.js';

// ─── State defaults ──────────────────────────────────────────────
suite('Data Import Model — State defaults', () => {
  test('constructor sets file to null', () => {
    const s = new State();
    assertEqual(s.file, null);
  });

  test('constructor applies default CSV options', () => {
    const s = new State();
    assertEqual(s.csvOptions.delimiter, 'auto');
    assertEqual(s.csvOptions.encoding, 'utf-8');
    assertEqual(s.csvOptions.hasHeader, true);
    assertEqual(s.csvOptions.skipRows, 0);
    assertEqual(s.csvOptions.preset, 'generic');
  });

  test('constructor applies default XLSX options', () => {
    const s = new State();
    assertEqual(s.xlsxOptions.hasHeader, true);
  });

  test('constructor applies default AQDEF options', () => {
    const s = new State();
    assertEqual(s.aqdefOptions.encoding, 'windows-1252');
  });

  test('default option constants exposed', () => {
    assertEqual(DEFAULT_CSV_OPTIONS.preset, 'generic');
    assertEqual(DEFAULT_XLSX_OPTIONS.hasHeader, true);
    assertEqual(DEFAULT_AQDEF_OPTIONS.encoding, 'windows-1252');
  });
});

// ─── hasContent ──────────────────────────────────────────────────
suite('Data Import Model — hasContent', () => {
  test('empty state has no content', () => {
    const s = new State();
    assertEqual(s.hasContent(), false);
  });

  test('state with a file has content', () => {
    const s = new State();
    s.file = { name: 'a.csv', size: 10, formatId: 'csv' };
    assertEqual(s.hasContent(), true);
  });
});

// ─── toJSON ──────────────────────────────────────────────────────
suite('Data Import Model — toJSON', () => {
  test('toJSON returns file + the three option sets (legacy getState shape)', () => {
    const s = new State();
    s.file = { name: 'x.csv', size: 5, formatId: 'csv' };
    const j = s.toJSON();
    assertEqual(Object.keys(j).sort().join(','), 'aqdefOptions,csvOptions,file,xlsxOptions');
    assertEqual(j.file.name, 'x.csv');
    assertEqual(j.csvOptions.delimiter, 'auto');
    assertEqual(j.xlsxOptions.hasHeader, true);
    assertEqual(j.aqdefOptions.encoding, 'windows-1252');
  });

  test('toJSON file is null by default', () => {
    const s = new State();
    assertEqual(s.toJSON().file, null);
  });
});

// ─── fromJSON ────────────────────────────────────────────────────
suite('Data Import Model — fromJSON', () => {
  test('fromJSON(null) returns valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.file, null);
    assertEqual(s.csvOptions.delimiter, 'auto');
  });

  test('fromJSON(undefined) returns valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.file, null);
    assertEqual(s.aqdefOptions.encoding, 'windows-1252');
  });

  test('fromJSON restores file and options', () => {
    const s = State.fromJSON({
      file: { name: 'd.dfq', size: 99, formatId: 'aqdef' },
      csvOptions: { delimiter: 'semicolon', skipRows: 4, preset: 'zeiss-calypso' },
      xlsxOptions: { hasHeader: false },
      aqdefOptions: { encoding: 'utf-8' },
    });
    assertEqual(s.file.name, 'd.dfq');
    assertEqual(s.file.formatId, 'aqdef');
    assertEqual(s.csvOptions.delimiter, 'semicolon');
    assertEqual(s.csvOptions.skipRows, 4);
    assertEqual(s.csvOptions.preset, 'zeiss-calypso');
    // missing csv keys defaulted
    assertEqual(s.csvOptions.encoding, 'utf-8');
    assertEqual(s.xlsxOptions.hasHeader, false);
    assertEqual(s.aqdefOptions.encoding, 'utf-8');
  });

  test('fromJSON ignores partial option overrides safely', () => {
    const s = State.fromJSON({ csvOptions: { hasHeader: false } });
    assertEqual(s.csvOptions.hasHeader, false);
    assertEqual(s.csvOptions.delimiter, 'auto');
  });

  test('toJSON → fromJSON round-trip is lossless', () => {
    const s = new State();
    s.file = { name: 'r.csv', size: 1234, formatId: 'csv' };
    s.csvOptions = { ...DEFAULT_CSV_OPTIONS, delimiter: 'pipe', skipRows: 2 };
    s.xlsxOptions = { hasHeader: false };
    s.aqdefOptions = { encoding: 'iso-8859-1' };
    const back = State.fromJSON(s.toJSON());
    assertEqual(back.file.name, 'r.csv');
    assertEqual(back.file.size, 1234);
    assertEqual(back.csvOptions.delimiter, 'pipe');
    assertEqual(back.csvOptions.skipRows, 2);
    assertEqual(back.xlsxOptions.hasHeader, false);
    assertEqual(back.aqdefOptions.encoding, 'iso-8859-1');
  });
});

// ─── clampSkipRows ───────────────────────────────────────────────
suite('Data Import Model — clampSkipRows', () => {
  test('negative clamps to 0', () => {
    assertEqual(clampSkipRows(-3), 0);
  });

  test('floors fractional values', () => {
    assertEqual(clampSkipRows(2.9), 2);
  });

  test('non-numeric falls back to 0', () => {
    assertEqual(clampSkipRows('abc'), 0);
  });

  test('passes through valid positive integer', () => {
    assertEqual(clampSkipRows(5), 5);
  });
});
