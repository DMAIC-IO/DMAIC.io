import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { fromExample } from '../../../js/modules/msa-typ5/io/example.js';

async function project(name) {
  const res = await fetch(new URL(`../../../js/modules/msa-typ5/resources/examples/projects/${name}.json`, import.meta.url));
  assertTrue(res.ok, name);
  return res.json();
}

suite('MSA Typ 5 — fromExample', () => {
  test('Altform: Spaltenbezüge auf das Quellblatt', async () => {
    const out = fromExample(await project('msa-typ5-binary-wide'));
    assertEqual(out.ratings[0].instanceId, '__source__');
    assertEqual(out.layout, 'wide');
    assertEqual('params' in out, false);
  });
  test('sourceWorksheetData bleibt daneben erhalten', async () => {
    const data = { ...(await project('msa-typ5-binary-wide')), sourceWorksheetData: { sheets: [] } };
    assertDeepEqual(fromExample(data).sourceWorksheetData, { sheets: [] });
  });
  test('ohne Arbeitsblattdaten kein Schlüssel', () => {
    assertEqual('sourceWorksheetData' in fromExample({}), false);
  });
});
