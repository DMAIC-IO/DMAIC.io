/**
 * Aufgabenliste: Beispiele.
 *
 * Beide Beispiele laden über `fromExample` (Versätze zu heute werden Daten,
 * `_dateNote` entfällt) und die Migration der Stände ohne `_schema` streng
 * und ohne Reparatur; `read()` gleicht dem der Altform (dieselben Einträge
 * mit aufgelösten Daten).
 */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import { setModelName } from '../../../js/core/model.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';
import { addDaysISO, todayISO } from '../../../js/core/local-date.js';
import { State } from '../../../js/modules/todo/domain/model.js';
import { fromExample } from '../../../js/modules/todo/io/example.js';

setModelName(State, 'todo');

const BASE = '../../../examples/projects/';
const IDS = ['todo-pizza-lieferzeit', 'todo-hubschrauber-flyer'];
const plain = (v) => JSON.parse(JSON.stringify(v));

/** @param {string} relPath */
async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

/** Ein Versatz `+Nd`/`-Nd` als Datum zu heute; alles andere bleibt. @param {string} v */
const due = (v) => {
  const m = /^([+-]\d+)d$/.exec(v);
  return m ? addDaysISO(todayISO(), Number(m[1])) : v;
};

suite('todo: Beispiele', () => {
  test('fromExample löst die Versätze auf und lässt _dateNote weg', () => {
    const out = fromExample({ _dateNote: 'x', items: [{ id: 'a', due: '+2d' }, { id: 'b', due: '' }], sortCol: 'due' });
    assertEqual(JSON.stringify(out), JSON.stringify({ items: [{ id: 'a', due: addDaysISO(todayISO(), 2) }, { id: 'b', due: '' }], sortCol: 'due' }));
  });

  for (const id of IDS) {
    test(`${id}: lädt streng ohne Reparatur, read() gleicht der Altform`, async () => {
      const raw = await fetchJson(`${BASE}${id}.json`);
      assertEqual(raw._schema, undefined);
      const data = fromExample(plain(raw));
      State.fromJSON(plain(data));
      /** @type {string[]} */
      const repairs = [];
      const m = State.fromJSON(plain(data), { repair: true, onRepair: (f) => repairs.push(f) });
      assertEqual(repairs.length, 0, repairs.join());
      assertTrue(m.hasContent(), 'hasContent');
      const legacyItems = raw.items.map((i) => ({ id: i.id, text: i.text, owner: i.owner, due: due(i.due), status: i.status, cal: i.cal === true }));
      const read = readSchemaModel(schemaAgentEntry(State), m, { fields: ['items'] });
      assertEqual(JSON.stringify(read), JSON.stringify({ items: legacyItems }));
      assertEqual(m.sortCol, raw.sortCol);
      assertEqual(m.filterStatus, raw.filterStatus === '' ? 'all' : raw.filterStatus);
    });
  }
});
