import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { vcTable, vcCsvText } from '../../../js/modules/multi-vari/io/export.js';

const VC = {
  totalVariance: 4,
  terms: [
    { id: 'A', df: 1, ss: 2, ms: 2, variance: 3, sd: Math.sqrt(3), percent: 75 },
    { id: 'Error', df: NaN, ss: NaN, ms: NaN, variance: 1, sd: 1, percent: 25 },
  ],
};
const HEAD = ['Term', 'df', 'SS', 'MS', 'Var', 'SD', '%'];
const labels = { head: HEAD, total: 'Total', termLabel: (t) => (t.id === 'Error' ? 'Fehler "x"' : t.id) };

suite('Multi-Vari io/export — vcTable', () => {
  test('Kopf, Terme, Summe; nicht endliche Zahlen werden zu leeren Zellen', () => {
    const rows = vcTable(VC, labels);
    assertEqual(rows.length, 4);
    assertDeepEqual(rows[0], HEAD);
    assertDeepEqual(rows[1], ['A', '1', '2', '2', '3', String(Math.sqrt(3)), '75']);
    assertDeepEqual(rows[2], ['Fehler "x"', '', '', '', '1', '1', '25']);
    assertDeepEqual(rows[3], ['Total', '', '', '', '4', '2', '100']);
  });

  test('vcCsvText setzt dieselben Zellen zusammen (Termnamen in Anführungszeichen)', () => {
    const csv = vcCsvText(VC, HEAD, 'Total', labels.termLabel);
    assertEqual(csv, [
      HEAD.join(','),
      `"A",1,2,2,3,${Math.sqrt(3)},75`,
      `"Fehler ""x""",,,,1,1,25`,
      `"Total",,,,4,2,100`,
    ].join('\n'));
  });
});
