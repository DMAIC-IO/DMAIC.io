import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { fromExample } from '../../../js/modules/msa-typ2/io/example.js';

async function project(name) {
  const res = await fetch(new URL(`../../../js/modules/msa-typ2/resources/examples/projects/${name}.json`, import.meta.url));
  assertTrue(res.ok, name);
  return res.json();
}

suite('MSA Typ 2 — fromExample', () => {
  test('Altform: Spaltenbezüge und Vorgaben im Model', async () => {
    const out = fromExample(await project('msa-typ2-akzeptabel'));
    assertEqual(out.part.instanceId, '__source__');
    assertEqual(out.part.columnId, 'c-teil');
    assertEqual(out.operator.columnId, 'c-operator');
    assertEqual(out.measurement.columnId, 'c-messwert');
    assertEqual(out.lsl, 6);
    assertEqual(out.usl, 14);
    assertEqual(out.k, 6);
    assertEqual(out.sourceWorksheetFile, undefined);
  });
  test('sourceWorksheetData bleibt daneben erhalten', async () => {
    const data = { ...(await project('msa-typ2-akzeptabel')), sourceWorksheetData: { sheets: [] } };
    const out = fromExample(data);
    assertDeepEqual(out.sourceWorksheetData, { sheets: [] });
    assertEqual(out.part.instanceId, '__source__');
  });
  test('ohne Arbeitsblattdaten kein Schlüssel', async () => {
    const out = fromExample(await project('msa-typ2-problematisch'));
    assertEqual('sourceWorksheetData' in out, false);
  });
});
