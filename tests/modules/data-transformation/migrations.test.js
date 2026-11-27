/**
 * Tests for modules/data-transformation/domain/migrations.js — '0→1.0'
 * übernimmt jeden Stand des alten `State.fromJSON` (Transformation,
 * Spaltenbezug, Beispielblatt), alle Parameter mit Vorgaben und leerem λ;
 * dazu das Altprojekt aus den E2E-Fixtures (Task 0) und die goldene Fixture
 * v0.3.0, alle ohne Reparatur.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { from0 } from '../../../js/modules/data-transformation/domain/migrations.js';
import { State } from '../../../js/modules/data-transformation/domain/model.js';
import { setModelName } from '../../../js/core/model.js';

setModelName(State, 'data-transformation');

const plain = (v) => JSON.parse(JSON.stringify(v));
const FIXTURES = new URL('../../fixtures/exports/', import.meta.url);
const DEFAULTS = plain(new State().toJSON());
delete DEFAULTS._schema;
// Die Editor-Einstellungen setzt die Migration nicht; ihre Vorgabe greift beim Laden.
for (const k of ['histOrigEdits', 'histTransEdits', 'ppOrigEdits', 'ppTransEdits']) delete DEFAULTS[k];

/** @param {URL} url */
async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${url}: HTTP ${res.status}`);
  return res.json();
}
/** @param {object} j */
function repaired(j) {
  const fields = [];
  const m = State.fromJSON(plain(j), { repair: true, onRepair: (f) => fields.push(f) });
  return { m, fields };
}

const WS = '5d1e7c3a-2b4f-4a6e-9d81-0c3b5a7e9f01';
/** Das Altprojekt der E2E-Fixture (Task 0), Stände ohne `_schema`. */
const LEGACY = {
  a: { currentTF: 'boxcox', columnRef: { instanceId: WS, sheetId: 'sheet_1', columnId: 'col_dt_pos' }, exampleWorksheetId: null },
  b: { currentTF: 'yeojohnson', columnRef: { instanceId: WS, sheetId: 'sheet_1', columnId: 'col_dt_neg' }, exampleWorksheetId: null },
  c: {
    currentTF: 'johnson_su',
    columnRef: { instanceId: WS, sheetId: 'sheet_1', columnId: 'col_dt_geloescht', extra: 'x' },
    exampleWorksheetId: '5d1e7c3a-2b4f-4a6e-9d81-0c3b5a7e9fff',
    lambda: 0.5,
  },
};

suite('data-transformation Migration 0→1.0 — Fälle des alten fromJSON', () => {
  test('leer oder kein Objekt: Vorgaben', () => {
    for (const old of [undefined, null, 'x', [], {}]) assertDeepEqual(from0(old), DEFAULTS, JSON.stringify(old));
  });

  test('bekannte Transformation bleibt, unbekannte wird boxcox', () => {
    assertEqual(from0({ currentTF: 'johnson_sb' }).currentTF, 'johnson_sb');
    assertEqual(from0({ currentTF: 'yeojohnson' }).currentTF, 'yeojohnson');
    assertEqual(from0({ currentTF: 'cube' }).currentTF, 'boxcox');
    assertEqual(from0({ currentTF: 7 }).currentTF, 'boxcox');
  });

  test('Spaltenbezug nur mit allen drei ids, als Text, ohne fremde Eigenschaften', () => {
    assertDeepEqual(from0({ columnRef: { instanceId: 1, sheetId: 's', columnId: 'c', x: 1 } }).columnRef,
      { instanceId: '1', sheetId: 's', columnId: 'c' });
    assertEqual(from0({ columnRef: { instanceId: 'i', sheetId: 's' } }).columnRef, null);
    assertEqual(from0({ columnRef: 'i|s|c' }).columnRef, null);
  });

  test('Beispielblatt nur als Text; Parameter immer Vorgaben mit leerem λ; fremde Schlüssel entfallen', () => {
    assertEqual(from0({ exampleWorksheetId: 'w' }).exampleWorksheetId, 'w');
    assertEqual(from0({ exampleWorksheetId: 3 }).exampleWorksheetId, null);
    assertDeepEqual(from0({ params: { lambda: 2 }, lambda: 2 }).params, DEFAULTS.params);
    assertDeepEqual(Object.keys(from0({ foo: 1 })), Object.keys(DEFAULTS));
  });
});

suite('data-transformation Migration — Altprojekt (Task 0)', () => {
  test('(a) Box-Cox und (b) Yeo-Johnson laden ohne Reparatur', () => {
    for (const k of ['a', 'b']) {
      const { m, fields } = repaired(LEGACY[k]);
      assertDeepEqual(fields, [], k);
      assertEqual(m.currentTF, LEGACY[k].currentTF, k);
      assertDeepEqual(plain(m.columnRef), LEGACY[k].columnRef, k);
      assertEqual(m.params.boxcox.lambda, null, k);
    }
  });

  test('(c) Johnson SU: Bezug ohne fremde Eigenschaft bleibt, fremder Schlüssel entfällt, Beispielblatt bleibt', () => {
    const { m, fields } = repaired(LEGACY.c);
    assertDeepEqual(fields, []);
    assertEqual(m.currentTF, 'johnson_su');
    assertDeepEqual(plain(m.columnRef), { instanceId: WS, sheetId: 'sheet_1', columnId: 'col_dt_geloescht' });
    assertEqual(m.exampleWorksheetId, '5d1e7c3a-2b4f-4a6e-9d81-0c3b5a7e9fff');
    assertDeepEqual(plain(m.params.johnson_su), { gamma: 0, delta: 1, xi: 0, lambdaJ: 1 });
    assertTrue(!Object.hasOwn(plain(m.toJSON()), 'lambda'));
  });
});

suite('data-transformation Migration — goldene Fixture', () => {
  test('v0.3.0_all_projects.json (i-tf-1) lädt ohne Reparatur', async () => {
    const file = await fetchJSON(new URL('v0.3.0_all_projects.json', FIXTURES));
    const states = [];
    for (const p of file.projects) {
      for (const list of Object.values(p.phases ?? {})) {
        for (const e of list) if (e.moduleId === 'data-transformation') states.push(p.moduleStates[e.instanceId]);
      }
    }
    assertEqual(states.length, 1);
    const { m, fields } = repaired(states[0]);
    assertDeepEqual(fields, []);
    assertEqual(m.currentTF, 'boxcox');
    assertDeepEqual(plain(m.columnRef), { instanceId: 'i-ws-1', sheetId: 'sh-1', columnId: 'c-amount' });
    assertDeepEqual(plain(m.params), DEFAULTS.params);
  });
});
