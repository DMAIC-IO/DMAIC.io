/**
 * Korrelation: Migration '0→1.0' (domain/migrations.js) — jeder Fall des
 * alten `fromJSON`, fehlend gegen `null`, Altpaar `colRefX/Y` und die
 * Altinstanzen aus Task 0 gegen das `read()` der Altform.
 */
import { suite, test, assertEqual, assertDeepEqual, assertDeepClose } from '../../test-utils.js';
import { from0 } from '../../../js/modules/correlation/domain/migrations.js';
import { State } from '../../../js/modules/correlation/domain/model.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { storedSource } from '../../helpers/stored-source.js';

setModelName(State, 'correlation');

const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };
const r = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });
const plain = (v) => JSON.parse(JSON.stringify(v));

/** @param {string} path @returns {Promise<any>} */
async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

suite('correlation: Migration 0→1.0', () => {
  test('Liste: leere und unvollständige Einträge fallen, nur drei Texte bleiben', () => {
    const out = from0({ colRefs: [r('a'), null, { instanceId: 'w', columnId: 'b' }, { ...r('c'), extra: 1 }, { instanceId: 1, sheetId: 's', columnId: 'd' }] });
    assertDeepEqual(out.colRefs, [r('a'), r('c')]);
  });

  test('Altpaar colRefX/colRefY wird die Liste, fehlende Hälfte fällt', () => {
    assertDeepEqual(from0({ colRefX: r('a'), colRefY: r('b') }).colRefs, [r('a'), r('b')]);
    assertDeepEqual(from0({ colRefX: null, colRefY: r('b') }).colRefs, [r('b')]);
    assertDeepEqual(from0({}).colRefs, []);
    assertDeepEqual(from0({ colRefs: 'x' }).colRefs, []);
  });

  test('Doppelte bleiben in der Migration; die Reparatur nimmt sie beim Laden', () => {
    assertDeepEqual(from0({ colRefs: [r('a'), r('a')] }).colRefs, [r('a'), r('a')]);
    const m = State.fromJSON({ colRefs: [r('a'), r('b'), r('a')] }, { repair: true, context: CTX });
    assertDeepEqual(plain(m.colRefs), [r('a'), r('b')]);
  });

  test('Konfidenz: fehlend → Kontext, null/ungültig → 0,95, gültig bleibt', () => {
    assertEqual('confidenceLevel' in from0({}), false);
    assertEqual(State.fromJSON({}, { context: { ...CTX, confidenceLevel: 90 } }).confidenceLevel, 0.9);
    assertEqual(from0({ confidenceLevel: null }).confidenceLevel, 0.95);
    assertEqual(from0({ confidenceLevel: '0.9' }).confidenceLevel, 0.95);
    assertEqual(from0({ confidenceLevel: 0.3 }).confidenceLevel, 0.95);
    assertEqual(from0({ confidenceLevel: NaN }).confidenceLevel, 0.95);
    assertEqual(from0({ confidenceLevel: 0.975 }).confidenceLevel, 0.975);
  });

  test('Methode, Filter, Beispielblatt; abgeleitete und fremde Schlüssel fallen', () => {
    const out = from0({ matrixMethod: 'foo', filterMinR: 2, filterMaxP: 0.05, exampleWorksheetId: 5, result: {}, matrixResult: {}, fremd: 1 });
    assertDeepEqual(out, { colRefs: [], matrixMethod: 'pearson', filterMinR: null, filterMaxP: 0.05, exampleWorksheetId: null });
    assertEqual(from0({ matrixMethod: 'kendall', filterMinR: Infinity, exampleWorksheetId: 'w' }).matrixMethod, 'kendall');
    assertEqual(from0({ filterMinR: Infinity }).filterMinR, null);
    assertEqual(from0({ exampleWorksheetId: 'w' }).exampleWorksheetId, 'w');
  });

  test('Altinstanzen aus Task 0: Laden ohne Reparatur, derived wie das read() der Altform', async () => {
    const fx = await fetchJson('./legacy-project.json');
    const legacy = await fetchJson('./legacy-read.json');
    const ui = await fetchJson('../../../js/modules/correlation/resources/i18n/ui.en.json');
    const T = (k, p) => String(ui[k]).replace(/\{(\w+)\}/g, (_, n) => String(p?.[n]));
    const src = storedSource({ [fx.worksheetId]: fx.worksheet });
    for (const id of ['legacy-a', 'legacy-b', 'legacy-c']) {
      const repaired = [];
      const m = State.fromJSON(fx[id], { repair: true, onRepair: (f) => repaired.push(f), context: CTX });
      assertDeepEqual(repaired, [], id);
      const old = legacy[id];
      const d = plain(evaluateDerived(m, src, undefined, T));
      assertDeepEqual(plain(m.colRefs), old.colRefs, `${id} colRefs`);
      assertEqual(m.confidenceLevel, old.confidenceLevel, `${id} Konfidenz`);
      assertEqual(m.matrixMethod, old.matrixMethod, `${id} Methode`);
      assertEqual(d.mode, old.mode, `${id} mode`);
      assertDeepEqual(d.activeParams, old.activeParams, `${id} activeParams`);
      assertDeepEqual(d.error?.message ?? '', old.errorMsg, `${id} Fehler`);
      compareResults(id, d, old);
    }
    const b = State.fromJSON(fx['legacy-b'], { context: CTX });
    assertEqual(b.filterMinR, 0.3);
    assertEqual(b.filterMaxP, 0.05);
  });
});

/**
 * `result`/`matrixResult` und Rohpaare gegen die Altform (`_x`/`_y` bzw.
 * `matrixResult.pairs` stehen jetzt im Massenfeld `pairs`).
 * @param {string} id @param {any} d @param {any} old
 */
export function compareResults(id, d, old) {
  if (old.result) {
    const { _x, _y, ...rest } = old.result;
    assertDeepClose(d.result, rest, undefined, `${id} result`);
    assertDeepEqual(d.pairs, [{ i: 0, j: 1, x: _x, y: _y }], `${id} pairs`);
  } else {
    assertEqual(d.result, null, `${id} result`);
  }
  if (old.matrixResult) {
    const { pairs, ...rest } = old.matrixResult;
    assertDeepClose(d.matrixResult, rest, undefined, `${id} matrixResult`);
    assertDeepEqual(d.pairs, pairs, `${id} pairs`);
  } else {
    assertEqual(d.matrixResult, null, `${id} matrixResult`);
  }
}
