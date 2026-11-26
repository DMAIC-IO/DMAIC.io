/**
 * D.Mike — MSA Typ 1: Beispiele.
 *
 * Das Hubschrauber-Beispiel liegt in der Modulablage, sein Arbeitsblatt unter
 * `examples/shared/worksheets/` (der globale Datensammlungs-Eintrag nutzt es
 * mit). Die drei Lehrbuch-Beispiele teilt sich das Modul mit `histogram`, sie
 * bleiben im Gesamtkatalog. Jedes lädt über `fromExample` ohne Reparatur und
 * rechnet dasselbe wie die Altform (Cg, Cgk, Gesamturteil als Literal).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/msa-typ1/domain/model.js';
import { analyzeTyp1, readValues } from '../../../js/modules/msa-typ1/domain/analyze.js';
import { fromExample } from '../../../js/modules/msa-typ1/io/example.js';
import { sheetSource } from '../../helpers/sheet-source.js';

const OWN = '../../../js/modules/msa-typ1/resources/examples/';
const GLOBAL = '../../../examples/';
const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

/** Ladeweg nachbilden: Projektdatei, fromExample, Model (mit Reparaturprotokoll), Rechnung. */
async function load(base, name) {
  const data = await fetchJson(`${base}projects/${name}.json`);
  const ws = await fetchJson(`${GLOBAL}${data.sourceWorksheetFile}`);
  const reports = [];
  const model = State.fromJSON(fromExample(data), { repair: true, onRepair: (n) => reports.push(n), context: CTX });
  const sheet = ws.sheets.find((s) => s.id === model.columnRef.sheetId);
  const cols = Object.fromEntries(sheet.state.columns.map((c) => [c.id, c.values]));
  const { instanceId, sheetId } = model.columnRef;
  const values = readValues(model, sheetSource(cols, { instanceId, sheetId }));
  return { model, reports, values };
}

// Altform (msa-typ1.js, State.fromJSON + Engine) an denselben Dateien gerechnet.
const LEGACY = {
  'msa-typ1-faehig': { Cg: 2.5553727582979775, Cgk: 2.5078428249938, overall: 'pass' },
  'msa-typ1-grenzwertig': { Cg: 1.2391894829680454, Cgk: 1.0964348545300935, overall: 'warn' },
  'msa-typ1-nicht-faehig': { Cg: 0.3979935899069613, Cgk: 0.17344560648145596, overall: 'fail' },
  'msa-typ1-hubschrauber-flyer': { Cg: 1.3492731253135841, Cgk: 1.1467472292040157, overall: 'warn' },
};

suite('msa-typ1 Beispiele: Ablage und Katalog', () => {
  test('das Hubschrauber-Beispiel steht in der Modulablage, sein Arbeitsblatt unter shared/', async () => {
    const own = await fetchJson(`${OWN}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), ['msa-typ1-hubschrauber-flyer']);
    const [e] = own.examples;
    assertEqual(e.type, 'project');
    assertEqual(e.format, 'json');
    assertEqual(e.file, 'projects/msa-typ1-hubschrauber-flyer.json');
    assertEqual(e.modules, undefined);
    const data = await fetchJson(`${OWN}${e.file}`);
    assertEqual(data.sourceWorksheetFile, 'shared/worksheets/msa-typ1-hubschrauber-flyer.json');
    const catalog = await fetchJson(`${GLOBAL}index.json`);
    assertEqual(catalog.examples.filter((x) => x.id === 'msa-typ1-hubschrauber-flyer').length, 0);
    const ws = catalog.examples.find((x) => x.id === 'worksheet-msa-typ1-hubschrauber-flyer');
    assertEqual(ws.file, 'shared/worksheets/msa-typ1-hubschrauber-flyer.json');
  });

  test('die drei Lehrbuch-Beispiele bleiben geteilt im Gesamtkatalog', async () => {
    const catalog = await fetchJson(`${GLOBAL}index.json`);
    const shared = catalog.examples.filter((x) => (x.modules ?? []).includes('msa-typ1'));
    assertDeepEqual(shared.map((x) => x.id), ['msa-typ1-faehig', 'msa-typ1-grenzwertig', 'msa-typ1-nicht-faehig']);
    shared.forEach((x) => assertDeepEqual(x.modules, ['msa-typ1', 'histogram']));
  });
});

suite('msa-typ1 Beispiele: Laden und Rechnung gleich der Altform', () => {
  for (const [name, legacy] of Object.entries(LEGACY)) {
    test(`${name}: lädt ohne Reparatur, Cg/Cgk/Urteil wie die Altform`, async () => {
      const base = name === 'msa-typ1-hubschrauber-flyer' ? OWN : GLOBAL;
      const { model, reports, values } = await load(base, name);
      assertDeepEqual(reports, []);
      assertEqual(values.length, 25);
      const r = analyzeTyp1(model.params, values);
      assertTrue(r && !r.invalid, 'gültiges Ergebnis');
      assertEqual(r.Cg, legacy.Cg);
      assertEqual(r.Cgk, legacy.Cgk);
      assertEqual(r.overall, legacy.overall);
    });
  }
});
