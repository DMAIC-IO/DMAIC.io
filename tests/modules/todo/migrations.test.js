/**
 * Tests for modules/todo/domain/migrations.js — '0→1.0' übernimmt jeden Stand
 * des alten `State.fromJSON`: Nicht-Texte leer, fremder Status `open`, `cal`
 * nur bei `true`, fehlende ids fest aus der Position, Filter und Sortierung
 * nur aus ihren Wertemengen, `TT.MM.JJJJ` wird ISO, anderer Datumstext
 * bleibt, fremde Schlüssel entfallen. Dazu Liste 2 des Altprojekts und die
 * goldenen Fixtures über das Model.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { from0, fillItemIds } from '../../../js/modules/todo/domain/migrations.js';
import { State } from '../../../js/modules/todo/domain/model.js';
import { setModelName } from '../../../js/core/model.js';

setModelName(State, 'todo');

const FIXTURES = new URL('../../fixtures/exports/', import.meta.url);
const VIEW = { filterStatus: 'all', filterOwner: 'all', search: '', sortCol: 'due', sortAsc: true };
const json = (v) => JSON.stringify(v);
const plain = (v) => JSON.parse(JSON.stringify(v));
const item = (over) => ({ id: '', text: '', owner: '', due: '', status: 'open', cal: false, ...over });

/** @param {URL} url @returns {Promise<any>} */
async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${url}: HTTP ${res.status}`);
  return res.json();
}

/** Alle todo-Zustände eines Exports. @param {any} v @param {any[]} [acc] @returns {any[]} */
function todoStates(v, acc = []) {
  if (Array.isArray(v)) v.forEach((x) => todoStates(x, acc));
  else if (v && typeof v === 'object') {
    if (v.phases && v.moduleStates) {
      for (const list of Object.values(v.phases)) {
        for (const e of Array.isArray(list) ? list : []) {
          if (e?.moduleId === 'todo') acc.push(v.moduleStates[e.instanceId] ?? e.state);
        }
      }
    }
    Object.values(v).forEach((x) => todoStates(x, acc));
  }
  return acc;
}

suite('todo migrations: 0→1.0 wie das alte fromJSON', () => {
  test('kein Objekt, null, {} → Vorgabe', () => {
    for (const v of [null, undefined, 'x', [], {}]) assertEqual(json(from0(v)), json({ items: [], ...VIEW }), json(v));
  });

  test('vollständiger Stand bleibt, fremde Schlüssel entfallen', () => {
    const old = {
      items: [{ id: 'i1', text: 'A1', owner: 'Max', due: '2026-01-01', status: 'open', cal: false, extra: 1 },
        { id: 'i2', text: 'A2', owner: 'Erika', due: '2026-12-31', status: 'done', cal: true }],
      filterStatus: 'done', filterOwner: 'Erika', search: 'test', sortCol: 'owner', sortAsc: false, _dateNote: 'x',
    };
    assertEqual(json(from0(old)), json({
      items: [item({ id: 'i1', text: 'A1', owner: 'Max', due: '2026-01-01' }),
        item({ id: 'i2', text: 'A2', owner: 'Erika', due: '2026-12-31', status: 'done', cal: true })],
      filterStatus: 'done', filterOwner: 'Erika', search: 'test', sortCol: 'owner', sortAsc: false,
    }));
  });

  test('Einträge: Nicht-Texte leer, fremder Status open, cal nur bei true, jedes Listenelement wird ein Eintrag', () => {
    const out = from0({ items: [{ id: 'a', text: 123, owner: null, due: undefined, cal: 'not-boolean', status: 'invalid' }, null, 'x'] });
    assertEqual(json(out.items), json([item({ id: 'a' }), item({ id: 't2' }), item({ id: 't3' })]));
  });

  test('fehlende, leere und doppelte ids: Ersatz aus der Position, Kollision mit „_“, vorhandene bleiben', () => {
    const out = from0({ items: [{ id: 't2' }, { text: 'ohne' }, { id: '' }, { id: 't2' }, { id: 7 }] });
    assertDeepEqual(out.items.map((i) => i.id), ['t2', 't2_', 't3', 't4', 't5']);
    assertDeepEqual(fillItemIds([{ id: 'x' }, { id: 'x' }]).map((i) => i.id), ['x', 't2']);
  });

  test('Zieldatum: TT.MM.JJJJ (auch einstellig) wird ISO, anderer Text und ungültige Daten bleiben', () => {
    const dues = ['15.06.2026', '1.2.2026', '2026-06-20', 'KW 23', '31.02.2026', '', 'morgen'];
    const out = from0({ items: dues.map((due, i) => ({ id: `d${i}`, due })) });
    assertDeepEqual(out.items.map((i) => i.due), ['2026-06-15', '2026-02-01', '2026-06-20', 'KW 23', '31.02.2026', '', 'morgen']);
  });

  test('Filter und Sortierung nur aus ihren Wertemengen, sonst Vorgabe; manual bleibt', () => {
    assertEqual(from0({ filterStatus: '' }).filterStatus, 'all');
    assertEqual(from0({ filterStatus: 'invalid' }).filterStatus, 'all');
    assertEqual(from0({ filterStatus: 'blocked' }).filterStatus, 'blocked');
    assertEqual(from0({ filterOwner: '' }).filterOwner, '');
    assertEqual(from0({ filterOwner: 3 }).filterOwner, 'all');
    assertEqual(from0({ sortCol: 'manual' }).sortCol, 'manual');
    assertEqual(from0({ sortCol: 'x' }).sortCol, 'due');
    assertEqual(from0({ sortAsc: 'yes' }).sortAsc, true);
    assertEqual(from0({ sortAsc: false }).sortAsc, false);
    assertEqual(from0({ items: 'not-array' }).items.length, 0);
  });

  test('importiert nichts aus model.js', async () => {
    const res = await fetch(new URL('../../../js/modules/todo/domain/migrations.js', import.meta.url), { cache: 'no-cache' });
    assertTrue(!/from\s+['"][^'"]*model\.js['"]/.test(await res.text()));
  });
});

suite('todo migrations: über das Model', () => {
  test('Liste 2 des Altprojekts (ohne _schema): lädt streng, Datum ISO, fehlende id aus der Position', () => {
    const old = {
      items: [
        { text: 'Messsystemanalyse durchführen', owner: 'Søren Ähnlich', due: '15.06.2026', status: 'in-progress', cal: false },
        { id: 'x2', text: 'Daten erheben', owner: 'Anna Müller', due: '2026-06-20', status: 'open', cal: false },
      ],
      filterStatus: '', filterOwner: 'all', search: '', sortAsc: true,
    };
    const m = State.fromJSON(plain(old));
    assertEqual(json(m.toJSON()), json({
      _schema: { name: 'todo', version: '1.0' },
      items: [
        item({ id: 't1', text: 'Messsystemanalyse durchführen', owner: 'Søren Ähnlich', due: '2026-06-15', status: 'in-progress' }),
        item({ id: 'x2', text: 'Daten erheben', owner: 'Anna Müller', due: '2026-06-20' }),
      ],
      ...VIEW,
    }));
    // Wiederholtes Laden der Altform ergibt dieselben ids.
    assertEqual(json(State.fromJSON(plain(old)).toJSON()), json(m.toJSON()));
  });

  test('goldene Fixtures v0.2.0/v0.3.0/v0.5.0 laden streng und ohne Reparatur', async () => {
    let count = 0;
    for (const f of ['v0.2.0_all_projects.json', 'v0.2.0_single_project.json', 'v0.3.0_all_projects.json',
      'v0.3.0_single_project.json', 'v0.5.0_8d_project.json']) {
      for (const s of todoStates(await fetchJSON(new URL(f, FIXTURES)))) {
        const fields = [];
        const m = State.fromJSON(plain(s), { repair: true, onRepair: (x) => fields.push(x) });
        State.fromJSON(plain(s));
        assertDeepEqual(fields, [], f);
        assertDeepEqual(m.items.map((i) => i.id), s.items.map((i) => i.id), f);
        assertDeepEqual(m.items.map((i) => i.text), s.items.map((i) => i.text), f);
        assertEqual(m.filterStatus, 'all', f);
        count += 1;
      }
    }
    assertTrue(count >= 5, `nur ${count} Zustände gefunden`);
  });
});
