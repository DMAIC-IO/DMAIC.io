/**
 * Tests for modules/ishikawa/io/export.js — Tabellen-Mapper, Zelle für Zelle
 * mit der bisherigen CSV (viewmodel/causes.js `causesCsv`) verglichen.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { exportTable } from '../../../js/modules/ishikawa/io/export.js';
import { State } from '../../../js/modules/ishikawa/domain/model.js';
import { State as OldState } from '../../../js/modules/ishikawa/ishikawa-model.js';
import { causesCsv } from '../../../js/modules/ishikawa/viewmodel/causes.js';
import { resolveDateOffset } from '../../../js/core/date-offset.js';

const BASE = new URL('../../../js/modules/ishikawa/resources/examples/projects/', import.meta.url);
const t = (k) => `«${k}»`;

/** @returns {Promise<any>} das Beispiel Lieferzeit mit aufgelösten Datumsangaben */
async function lieferzeitRaw() {
  const raw = await (await fetch(new URL('ishikawa-lieferzeit-zu-lang.json', BASE), { cache: 'no-cache' })).json();
  for (const f of raw.facts ?? []) f.date = resolveDateOffset(f.date);
  for (const e of raw.experiments ?? []) { e.startDate = resolveDateOffset(e.startDate); e.endDate = resolveDateOffset(e.endDate); }
  return raw;
}

/**
 * Zerlegt die alte CSV (BOM, "…"-Zellen, "" als Anführungszeichen) in Zeilen.
 * @param {string} csv @returns {string[][]}
 */
function parseCsv(csv) {
  const lines = [];
  let row = [];
  let cell = '';
  let q = false;
  const s = csv.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); lines.push(row); row = []; cell = ''; } else cell += c;
  }
  if (cell || row.length) { row.push(cell); lines.push(row); }
  return lines;
}

/** Alt-Zellen in die Zahlenform des neuen Mappers bringen (nur A1: Zahlen als Zahlen). */
const asNumbers = (row, from, to) => row.map((c, i) => (i >= from && i <= to && c !== '' ? Number(c) : c));

suite('ishikawa/io/export', () => {
  test('Lieferzeit: Zelle für Zelle wie die bisherige CSV', async () => {
    const raw = await lieferzeitRaw();
    const m = State.fromJSON(raw, { onRepair: () => {} });
    const old = parseCsv(causesCsv(OldState.fromJSON(JSON.parse(JSON.stringify(raw))), t));
    const rows = exportTable(m, { t });
    const n = m.experts.length;
    const at = 3 + m.rows.length;
    assertDeepEqual(rows[0], old[0]);
    assertDeepEqual(rows[1], []);
    assertDeepEqual(old[1], ['']);
    assertDeepEqual(rows[2], old[2]);
    for (let i = 3; i < at; i++) {
      assertDeepEqual(rows[i], asNumbers(old[i], 6, 6 + n));
      assertEqual(typeof rows[i][6 + n], 'number');
    }
    assertDeepEqual(rows[at], []);
    assertDeepEqual(rows[at + 1], old[at + 1]);
    assertDeepEqual(rows[at + 2], old[at + 2]);
    assertEqual(rows.length, at + 3 + m.facts.length);
    for (let i = at + 3; i < rows.length; i++) assertDeepEqual(rows[i], asNumbers(old[i], 0, 0));
  });

  test('Score auf eine Dezimale gerundet, als Zahl', () => {
    const m = State.fromJSON({
      problem: 'P', experts: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }],
      rows: [{ id: 1, stableId: 'H-001', parentId: null, category: 'man', name: 'x', description: '', ratings: { 1: 3, 2: 3, 3: 4 }, status: 'open' }],
    }, { onRepair: () => {} });
    assertEqual(exportTable(m, { t })[3][9], 3.3);
  });

  test('eigene Kategoriebezeichnung, geerbte Kategorie, ohne Fakten kein Faktenblock', () => {
    const m = State.fromJSON({
      problem: 'P', experts: [{ id: 1, name: 'A' }], catLabels: { man: ' Mensch ' },
      rows: [
        { id: 1, stableId: 'H-001', parentId: null, category: 'man', name: 'x', description: 'd', ratings: { 1: 4 }, status: 'open' },
        { id: 2, stableId: 'H-002', parentId: 1, category: '', name: 'y', description: '', ratings: {}, status: 'confirmed' },
      ],
    }, { onRepair: () => {} });
    const rows = exportTable(m, { t });
    assertDeepEqual(rows[3], ['1', '«main»', 'Mensch', 'Mensch', 'x', 'd', 4, 4, '«status.open»']);
    assertDeepEqual(rows[4], ['1.1', '«sub»', '', 'Mensch', 'y', '  ', '', '', '«status.confirmed»']);
    assertEqual(rows.length, 5);
  });
});
