/**
 * D.Mike — MSA Typ 4: Beispiele.
 *
 * Beide Beispiele gehören allein dem Modul und liegen samt Arbeitsblättern in
 * der Modulablage. Jedes lädt ohne Reparatur und rechnet dasselbe wie die
 * Altform (Kennzahlen, Urteile und Deutungsschlüssel als Literal).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/msa-typ4/domain/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { sheetSource } from '../../helpers/sheet-source.js';

const OWN = '../../../js/modules/msa-typ4/resources/examples/';
const GLOBAL = '../../../examples/';
const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

/** Ladeweg nachbilden: Projektdatei, Model (mit Reparaturprotokoll), Ableitung. */
async function load(name) {
  const data = await fetchJson(`${OWN}projects/${name}.json`);
  const ws = await fetchJson(`${OWN}${data.sourceWorksheetFile}`);
  const reports = [];
  const model = State.fromJSON(data, { repair: true, onRepair: (n) => reports.push(n), context: CTX });
  const sheet = ws.sheets.find((s) => s.id === model.refColumn.sheetId);
  const cols = Object.fromEntries(sheet.state.columns.map((c) => [c.id, c.values]));
  const { instanceId, sheetId } = model.refColumn;
  const { result } = evaluateDerived(model, sheetSource(cols, { instanceId, sheetId }));
  return { model, reports, result };
}

// Altform (msa-typ4-model.js State.fromJSON + _buildDataArrays + Engine) an denselben Dateien gerechnet;
// das ganze Ergebnis war zeichengleich mit der Ableitung der Zielform.
const LEGACY = {
  'msa-typ4-linear': {
    percentLinearity: 0.07396666666666805, maxPercentBias: 0.05583333333333088,
    slope: 0.0011095000000000208, pSlope: 0.15057613070807885, Q_MS_BI: 0.15074582759411922,
    aiag: 'green', vda: 'green', textKey: 'modules.msa-typ4.interpAIAG_green', refs: 5,
  },
  'msa-typ4-drift': {
    percentLinearity: 13.407300000000001, maxPercentBias: 13.42558333333333,
    slope: 0.20110950000000002, pSlope: 0, Q_MS_BI: 26.85138019279904,
    aiag: 'red', vda: 'yellow', textKey: 'modules.msa-typ4.interpAIAG_red', refs: 5,
  },
};

suite('msa-typ4 Beispiele: Ablage und Katalog', () => {
  test('beide Beispiele stehen in der Modulablage, nicht mehr im Gesamtkatalog', async () => {
    const own = await fetchJson(`${OWN}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), Object.keys(LEGACY));
    for (const e of own.examples) {
      assertEqual(e.type, 'project');
      assertEqual(e.format, 'json');
      assertEqual(e.file, `projects/${e.id}.json`);
      assertEqual(e.modules, undefined);
      const data = await fetchJson(`${OWN}${e.file}`);
      assertEqual(data.sourceWorksheetFile, `worksheets/${e.id}.json`);
    }
    const catalog = await fetchJson(`${GLOBAL}index.json`);
    assertEqual(catalog.examples.filter((x) => (x.modules ?? []).includes('msa-typ4')).length, 0);
    assertEqual(catalog.examples.filter((x) => x.id.startsWith('msa-typ4-')).length, 0);
  });
});

suite('msa-typ4 Beispiele: Laden und Rechnung gleich der Altform', () => {
  for (const [name, legacy] of Object.entries(LEGACY)) {
    test(`${name}: lädt ohne Reparatur, Kennzahlen und Urteile wie die Altform`, async () => {
      const { model, reports, result } = await load(name);
      assertDeepEqual(reports, []);
      assertEqual(model.refColumn.instanceId, '__source__');
      assertEqual(model.measColumn.instanceId, '__source__');
      assertTrue(result && !result.invalid, 'gültiges Ergebnis');
      assertEqual(result.kpi.aiag.percentLinearity, legacy.percentLinearity);
      assertEqual(result.kpi.aiag.maxPercentBias, legacy.maxPercentBias);
      assertEqual(result.regression.slope, legacy.slope);
      assertEqual(result.regression.pSlope, legacy.pSlope);
      assertEqual(result.kpi.vda5.Q_MS_BI, legacy.Q_MS_BI);
      assertEqual(result.kpi.aiag.verdict.color, legacy.aiag);
      assertEqual(result.kpi.vda5.verdict.color, legacy.vda);
      assertEqual(result.interpretation.textKey, legacy.textKey);
      assertEqual(result.perReference.length, legacy.refs);
    });
  }
});
