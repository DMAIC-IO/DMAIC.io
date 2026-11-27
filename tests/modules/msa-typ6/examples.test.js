/**
 * D.Mike — MSA Typ 6: Beispiele.
 *
 * Die vier Beispiele gehören allein dem Modul und liegen samt Arbeitsblättern
 * in der Modulablage. Jedes lädt ohne Reparatur und rechnet dasselbe wie die
 * Altform (Urteil, Treiber, Nelson-Zahl, Drift-p und Punktzahl als Literal).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/msa-typ6/domain/model.js';
import { analyzeTyp6, readInputs } from '../../../js/modules/msa-typ6/domain/analyze.js';
import { sheetSource } from '../../helpers/sheet-source.js';

const OWN = '../../../js/modules/msa-typ6/resources/examples/';
const GLOBAL = '../../../examples/';
const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

/** Ladeweg nachbilden: Projektdatei, Model (mit Reparaturprotokoll), Rechnung. */
async function load(name) {
  const data = await fetchJson(`${OWN}projects/${name}.json`);
  const ws = await fetchJson(`${OWN}${data.sourceWorksheetFile}`);
  const reports = [];
  const model = State.fromJSON(data, { repair: true, onRepair: (n) => reports.push(n), context: CTX });
  const sheet = ws.sheets.find((s) => s.id === model.columns.value.sheetId);
  const cols = Object.fromEntries(sheet.state.columns.map((c) => [c.id, c.values]));
  const { instanceId, sheetId } = model.columns.value;
  const result = analyzeTyp6(model.params, readInputs(model, sheetSource(cols, { instanceId, sheetId })));
  return { model, reports, result };
}

// Altform (msa-typ6-model.js State.fromJSON + _buildInputs + Engine) an denselben Dateien gerechnet.
const LEGACY = {
  'msa-typ6-imr-stable': { level: 'stable', driver: 'none', nelsonCount: 0, driftP: 0.8387833083074974, pointCount: 50, warnings: [] },
  'msa-typ6-imr-drift': { level: 'unstable', driver: 'both', nelsonCount: 34, driftP: 0.00008696605452663912, pointCount: 50, warnings: ['W_LIMITS_FROM_UNSTABLE_BASELINE'] },
  'msa-typ6-xbar-r-stable': { level: 'stable', driver: 'none', nelsonCount: 0, driftP: 0.41126988929478425, pointCount: 125, warnings: [] },
  'msa-typ6-xbar-r-shift': { level: 'unstable', driver: 'nelson', nelsonCount: 7, driftP: 0.01199267447542513, pointCount: 125, warnings: ['W_BASELINE_LT_20'] },
};

suite('msa-typ6 Beispiele: Ablage und Katalog', () => {
  test('die vier Beispiele stehen in der Modulablage, nicht mehr im Gesamtkatalog', async () => {
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
    assertEqual(catalog.examples.filter((x) => (x.modules ?? []).includes('msa-typ6')).length, 0);
    assertEqual(catalog.examples.filter((x) => x.id.startsWith('msa-typ6-')).length, 0);
  });
});

suite('msa-typ6 Beispiele: Laden und Rechnung gleich der Altform', () => {
  for (const [name, legacy] of Object.entries(LEGACY)) {
    test(`${name}: lädt ohne Reparatur, Urteil und Drift wie die Altform`, async () => {
      const { model, reports, result } = await load(name);
      assertDeepEqual(reports, []);
      assertEqual(model.columns.value.instanceId, '__source__');
      assertTrue(result && !result.invalid, 'gültiges Ergebnis');
      assertEqual(result.verdict.level, legacy.level);
      assertEqual(result.verdict.driver, legacy.driver);
      assertEqual(result.verdict.nelsonCount, legacy.nelsonCount);
      assertEqual(result.verdict.driftP, legacy.driftP);
      assertEqual(result.meta.pointCount, legacy.pointCount);
      assertDeepEqual(result.meta.warnings.map((w) => w.code), legacy.warnings);
    });
  }
});
