/**
 * D.Mike — MSA Typ 2: Beispiele der Modulablage.
 *
 * Die drei Beispiele liegen unter `resources/examples/`; ihre Projektdateien
 * behalten die flache Altform. `fromExample` übersetzt sie in die Form des
 * Models; die Rechnung liefert je Beispiel Art und %GRR, auf die der
 * Katalogtext verweist.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/msa-typ2/domain/model.js';
import { buildDataArrays, computeAnalysis } from '../../../js/modules/msa-typ2/domain/data.js';
import { fromExample } from '../../../js/modules/msa-typ2/io/example.js';

const BASE = '../../../js/modules/msa-typ2/resources/examples/';
const IDS = ['msa-typ2-akzeptabel', 'msa-typ2-problematisch', 'msa-typ3-akzeptabel'];

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

/** Ladeweg des Moduls nachbilden: Projektdatei, fromExample, Model, Rechnung. */
async function load(name) {
  const data = await fetchJson(`${BASE}projects/${name}.json`);
  const ws = await fetchJson(`${BASE}${data.sourceWorksheetFile}`);
  const out = fromExample(data);
  const model = State.fromJSON(out);
  const cols = Object.fromEntries(ws.sheets[0].state.columns.map(c => [c.id, c.values]));
  const arrays = buildDataArrays({
    parts: cols[model.part.columnId],
    operators: model.operator ? cols[model.operator.columnId] : null,
    measurements: cols[model.measurement.columnId],
  });
  const run = computeAnalysis(arrays, {
    alpha: model.alpha, studyVarMultiplier: model.k, lsl: model.lsl, usl: model.usl,
  });
  return { model, run };
}

suite('msa-typ2 Beispiele: Ablage und Katalog', () => {
  test('die drei Beispiele stehen in der Modulablage, nicht im Gesamtkatalog', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map(e => e.id), IDS);
    own.examples.forEach((e) => {
      assertEqual(e.type, 'project');
      assertEqual(e.format, 'json');
      assertEqual(e.file, `projects/${e.id}.json`);
      assertEqual(typeof e.title.de, 'string');
      assertEqual(typeof e.title.en, 'string');
      assertEqual(typeof e.description.de, 'string');
      assertEqual(typeof e.description.en, 'string');
    });
    const catalog = await fetchJson('../../../examples/index.json');
    assertEqual(catalog.examples.filter(e => IDS.includes(e.id)).length, 0);
  });
});

suite('msa-typ2 Beispiele: Rechnung', () => {
  test('msa-typ2-akzeptabel: Typ 2, %GRR ≈ 5 %', async () => {
    const { model, run } = await load('msa-typ2-akzeptabel');
    assertEqual(model.lsl, 6);
    assertEqual(model.usl, 14);
    assertEqual(run.mode, 'typ2');
    assertTrue(Math.abs(run.varComp.grr.pctStudyVar - 5.410077863184201) < 1e-9, String(run.varComp.grr.pctStudyVar));
  });
  test('msa-typ2-problematisch: Typ 2, %GRR ≈ 79 %', async () => {
    const { run } = await load('msa-typ2-problematisch');
    assertEqual(run.mode, 'typ2');
    const v = run.varComp.grr.pctStudyVar;
    assertTrue(v > 78.5 && v < 79.5, String(v));
  });
  test('msa-typ3-akzeptabel: Typ 3, %GRR ≈ 8 %', async () => {
    const { model, run } = await load('msa-typ3-akzeptabel');
    assertEqual(model.operator, null);
    assertEqual(run.mode, 'typ3');
    const v = run.varComp.grr.pctStudyVar;
    assertTrue(v > 7.5 && v < 8.5, String(v));
  });
});
