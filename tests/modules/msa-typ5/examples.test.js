/**
 * D.Mike — MSA Typ 5: Beispiele der Modulablage.
 *
 * Die sechs Beispiele liegen unter `resources/examples/`; ihre Projektdateien
 * behalten die flache Altform. `fromExample` übersetzt sie in die Form des
 * Models; die Rechnung liefert je Beispiel Fleiss κ und Urteil, auf die der
 * Katalogtext verweist.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/msa-typ5/domain/model.js';
import { fromExample } from '../../../js/modules/msa-typ5/io/example.js';
import { readAnalysis } from '../../../js/modules/msa-typ5/viewmodel/present.js';

const BASE = '../../../js/modules/msa-typ5/resources/examples/';
const IDS = [
  'msa-typ5-binary-good', 'msa-typ5-binary-marginal', 'msa-typ5-binary-wide',
  'msa-typ5-nominal-3classes', 'msa-typ5-ordinal-scale5', 'msa-typ5-zaehltest',
];
/** Erwartung: Fleiss κ (gerundet auf 2 Stellen) und Urteil. */
const EXPECTED = {
  'msa-typ5-binary-good': [0.92, 'good'],
  'msa-typ5-binary-marginal': [0.58, 'unacceptable'],
  'msa-typ5-binary-wide': [0.92, 'good'],
  'msa-typ5-nominal-3classes': [0.84, 'good'],
  'msa-typ5-ordinal-scale5': [0.77, 'good'],
  'msa-typ5-zaehltest': [0.78, 'unacceptable'],
};

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

/** Ladeweg des Moduls nachbilden: Projektdatei, fromExample, Model, Rechnung. */
async function load(id) {
  const project = await fetchJson(`${BASE}projects/${id}.json`);
  const ws = (await fetchJson(`${BASE}${project.sourceWorksheetFile}`)).sheets[0];
  const sheet = Object.fromEntries(ws.state.columns.map((c) => [c.id, c.values]));
  const names = Object.fromEntries(ws.state.columns.map((c) => [c.id, c.name]));
  const data = {
    values: (r) => (r && sheet[r.columnId] ? [...sheet[r.columnId]] : null),
    name: (r) => (r && sheet[r.columnId] ? names[r.columnId] : null),
    columns: () => [],
  };
  const model = State.fromJSON(fromExample(project));
  return { model, run: readAnalysis(model, data) };
}

suite('msa-typ5 Beispiele: Ablage und Katalog', () => {
  test('die sechs Beispiele stehen in der Modulablage, nicht im Gesamtkatalog', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), IDS);
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
    assertEqual(catalog.examples.filter((e) => IDS.includes(e.id)).length, 0);
  });
});

suite('msa-typ5 Beispiele: Rechnung', () => {
  for (const id of IDS) {
    test(`${id}: Fleiss κ und Urteil`, async () => {
      const { run } = await load(id);
      const [kappa, level] = EXPECTED[id];
      assertTrue(run && !run.error && !run.invalid, `${id}: keine Analyse`);
      assertEqual(Math.round(run.betweenAppraisers.fleissKappa.kappa * 100) / 100, kappa);
      assertEqual(run.verdict.level, level);
    });
  }

  test('binary-wide rechnet wie binary-good (gleiche Daten, breites Layout)', async () => {
    const a = await load('msa-typ5-binary-good');
    const b = await load('msa-typ5-binary-wide');
    assertEqual(b.model.layout, 'wide');
    assertEqual(b.run.betweenAppraisers.fleissKappa.kappa, a.run.betweenAppraisers.fleissKappa.kappa);
  });
});
