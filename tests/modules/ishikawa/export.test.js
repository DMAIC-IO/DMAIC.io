/**
 * Tests for modules/ishikawa/io/export.js — Tabellen-Mapper, verglichen mit
 * den Abschnitten der bisherigen CSV.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { exportTable } from '../../../js/modules/ishikawa/io/export.js';
import { State } from '../../../js/modules/ishikawa/domain/model.js';
import { scoreOf } from '../../../js/modules/ishikawa/domain/scores.js';
import { resolveDateOffset } from '../../../js/core/date-offset.js';

const BASE = new URL('../../../js/modules/ishikawa/resources/examples/projects/', import.meta.url);
const t = (k) => `«${k}»`;

async function lieferzeit() {
  const raw = await (await fetch(new URL('ishikawa-lieferzeit-zu-lang.json', BASE), { cache: 'no-cache' })).json();
  for (const f of raw.facts ?? []) f.date = resolveDateOffset(f.date);
  for (const e of raw.experiments ?? []) { e.startDate = resolveDateOffset(e.startDate); e.endDate = resolveDateOffset(e.endDate); }
  return State.fromJSON(raw, { onRepair: () => {} });
}

suite('ishikawa/io/export', () => {
  test('Lieferzeit: Problem, Baumkopf, Zeilen, Fakten', async () => {
    const m = await lieferzeit();
    const { headers, rows } = exportTable(m, { t, lang: 'de' });
    assertDeepEqual(headers, ['«problemStatement»', m.problem]);
    assertDeepEqual(rows[0], []);
    assertDeepEqual(rows[1], ['#', '«level»', '«category»', '«effCat»', '«name»', '«description»',
      ...m.experts.map((e) => e.name), '«avgScore»', '«status»']);
    const tree = rows.slice(2, 2 + m.rows.length);
    assertEqual(tree.length, m.rows.length);
    assertEqual(tree[0][0], '1');
    assertEqual(tree[0][1], '«main»');
    const n = m.experts.length;
    for (const r of tree) {
      assertEqual(r.length, 8 + n);
      for (let i = 0; i < n; i++) assertEqual(r[6 + i] === '' || typeof r[6 + i] === 'number', true);
      assertEqual(r[6 + n] === '' || typeof r[6 + n] === 'number', true);
    }
    const first = m.rows.find((r) => r.id === m.rows[0].id);
    const exp = scoreOf(first);
    const line = tree.find((r) => r[4] === first.name);
    assertEqual(line[6 + n], exp ?? '');
    const at = 2 + m.rows.length;
    assertDeepEqual(rows[at], []);
    assertDeepEqual(rows[at + 1], ['«tabFacts»']);
    assertDeepEqual(rows[at + 2], ['#', '«factName»', '«factDescription»', '«factDate»', '«factOwner»']);
    assertEqual(rows.length, at + 3 + m.facts.length);
    assertDeepEqual(rows[at + 3], [1, m.facts[0].name, m.facts[0].description, m.facts[0].date, m.facts[0].owner]);
  });

  test('eigene Kategoriebezeichnung, geerbte Kategorie, ohne Fakten kein Faktenblock', () => {
    const m = State.fromJSON({
      problem: 'P', experts: [{ id: 1, name: 'A' }], catLabels: { man: ' Mensch ' },
      rows: [
        { id: 1, stableId: 'H-001', parentId: null, category: 'man', name: 'x', description: 'd', ratings: { 1: 4 }, status: 'open' },
        { id: 2, stableId: 'H-002', parentId: 1, category: '', name: 'y', description: '', ratings: {}, status: 'confirmed' },
      ],
    }, { onRepair: () => {} });
    const { rows } = exportTable(m, { t });
    assertDeepEqual(rows[2], ['1', '«main»', 'Mensch', 'Mensch', 'x', 'd', 4, 4, '«status.open»']);
    assertDeepEqual(rows[3], ['1.1', '«sub»', '', 'Mensch', 'y', '  ', '', '', '«status.confirmed»']);
    assertEqual(rows.length, 4);
  });
});
