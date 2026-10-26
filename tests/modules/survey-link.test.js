/**
 * D.Mike — Survey hand-over tests (survey-link.test.js)
 * Worksheet state, Kano hand-over, VoC tree hand-over.
 */

import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { buildWorksheetState, listInstances, treePhaseForCycle, kanoStateFromSurvey, vocsFromAnswers, appendVocs } from '../../js/modules/survey-builder/survey-link.js';

suite('survey-link — buildWorksheetState', () => {
  const columns = [
    { name: 'Antwort-ID', type: 'text', role: 'identifier', values: ['x1', 'x2'] },
    { name: 'R: R1', type: 'numeric', role: 'ordinal', values: [5, null] },
  ];

  test('one sheet with DataGrid columns', () => {
    const wb = buildWorksheetState(columns, 'Umfrage');
    assertEqual(wb.activeSheetId, 'sheet_1');
    assertEqual(wb.sheetCounter, 1);
    assertEqual(wb.sheets.length, 1);
    assertEqual(wb.sheets[0].name, 'Umfrage');
    const st = wb.sheets[0].state;
    assertEqual(st.rowCount, 2);
    assertDeepEqual(st.colWidths, {});
    assertEqual(st.sortCol, null);
    assertDeepEqual(st.columns.map((c) => c.shortName), ['C1', 'C2']);
    assertDeepEqual(st.columns[1].values, [5, null]);
    assertDeepEqual(st.columns[1].formulas, [null, null]);
    assertEqual(st.columns[1].role, 'ordinal');
    assertEqual(st.columns[1].roleManual, true);
    assertEqual(st.columns[1].unit, '');
    assertTrue(typeof st.columns[0].id === 'string' && st.columns[0].id !== st.columns[1].id);
  });

  test('values are copied, not shared', () => {
    const wb = buildWorksheetState(columns, 'X');
    wb.sheets[0].state.columns[0].values.push('x3');
    assertEqual(columns[0].values.length, 2);
  });
});

const KANO_Q = {
  id: 'kq', type: 'kano', text: 'Kano', hint: '', required: false, when: null, importance: true,
  rows: [{ id: 'row1', text: 'Export' }, { id: 'row2', text: 'Dark mode' }],
};
const RESPONSES = [
  { id: 'a', recipientId: 'p1', viaRecipient: true, answers: { kq: { row1: { f: 1, d: 5, w: 9 }, row2: { f: 2, d: 3, w: null } } } },
  { id: 'b', recipientId: null, viaRecipient: false, answers: { kq: { row1: { f: 1, d: 3, w: 4 } } } },
  { id: 'c', recipientId: null, viaRecipient: false, answers: {} },
];
const input = (over = {}) => ({
  surveyInstanceId: 'sb1', question: KANO_Q, responses: RESPONSES,
  recipients: [{ id: 'p1', name: 'Anna' }], anonymous: false,
  respondentLabel: (n) => `Befragte ${n}`, ...over,
});

suite('survey-link — kanoStateFromSurvey', () => {
  test('new target: items from rows, respondents from answering responses', () => {
    const s = kanoStateFromSurvey(null, input());
    assertDeepEqual(s.source, { instanceId: null, level: 'need' });
    assertEqual(s.options.importance, true);
    assertDeepEqual(s.items.map((i) => [i.label, i.nodeId, i.path]), [['Export', null, ''], ['Dark mode', null, '']]);
    assertDeepEqual(s.respondents.map((r) => r.name), ['Anna', 'Befragte 2']);
    assertDeepEqual(s.items[0].origin, { surveyInstanceId: 'sb1', questionId: 'kq' });
    assertEqual(s.activeRespondentId, s.respondents[0].id);
  });

  test('answers are copied unchanged', () => {
    const s = kanoStateFromSurvey(null, input());
    const [i1, i2] = s.items;
    const [anna, second] = s.respondents;
    assertDeepEqual(s.answers[anna.id][i1.id], { f: 1, d: 5, w: 9 });
    assertDeepEqual(s.answers[anna.id][i2.id], { f: 2, d: 3, w: null });
    assertDeepEqual(Object.keys(s.answers[second.id]), [i1.id]);
  });

  test('anonymous: never a recipient name', () => {
    const s = kanoStateFromSurvey(null, input({ anonymous: true }));
    assertDeepEqual(s.respondents.map((r) => r.name), ['Befragte 1', 'Befragte 2']);
  });

  test('repeat hand-over replaces only own entries; manual ones stay', () => {
    const first = kanoStateFromSurvey(null, input());
    first.items.push({ id: 'manual-item', nodeId: null, label: 'Manual', path: '', missing: false });
    first.respondents.push({ id: 'manual-resp', name: 'Manual' });
    first.answers['manual-resp'] = { 'manual-item': { f: 1, d: 1, w: null }, [first.items[0].id]: { f: 5, d: 5, w: null } };
    first.source = { instanceId: 'tree1', level: 'driver' };

    const again = kanoStateFromSurvey(first, input({ responses: RESPONSES.slice(0, 1) }));
    assertDeepEqual(again.items.map((i) => i.label), ['Manual', 'Export', 'Dark mode']);
    assertDeepEqual(again.respondents.map((r) => r.name), ['Manual', 'Anna']);
    assertDeepEqual(again.answers['manual-resp'], { 'manual-item': { f: 1, d: 1, w: null } }, 'answer to a replaced item is dropped');
    assertDeepEqual(again.source, { instanceId: 'tree1', level: 'driver' }, 'existing source stays');
  });

  test('entries from another survey instance stay', () => {
    const other = kanoStateFromSurvey(null, input({ surveyInstanceId: 'sb2' }));
    const mine = kanoStateFromSurvey(other, input());
    assertEqual(mine.items.length, 4);
    assertEqual(mine.respondents.length, 4);
  });

  test('answers outside the Kano scales become null', () => {
    const responses = [{
      id: 'x', recipientId: null, viaRecipient: false,
      answers: { kq: {
        row1: { f: 0, d: 6, w: 10 },
        row2: { f: '3', d: 2.5, w: -1 },
      } },
    }, {
      id: 'y', recipientId: null, viaRecipient: false,
      answers: { kq: { row1: { f: 5, d: 1, w: 1 }, row2: { f: 1, d: 5, w: 9 } } },
    }];
    const s = kanoStateFromSurvey(null, input({ responses }));
    const [i1, i2] = s.items;
    const [x, y] = s.respondents;
    assertDeepEqual(s.answers[x.id][i1.id], { f: null, d: null, w: null });
    assertDeepEqual(s.answers[x.id][i2.id], { f: null, d: null, w: null });
    assertDeepEqual(s.answers[y.id][i1.id], { f: 5, d: 1, w: 1 }, 'scale bounds are valid');
    assertDeepEqual(s.answers[y.id][i2.id], { f: 1, d: 5, w: 9 });
  });

  test('a new target takes importance from the question', () => {
    const s = kanoStateFromSurvey(null, input({ question: { ...KANO_Q, importance: false } }));
    assertEqual(s.options.importance, false);
  });

  test('an existing target keeps importance switched on', () => {
    const first = kanoStateFromSurvey(null, input());
    const again = kanoStateFromSurvey(first, input({ question: { ...KANO_Q, importance: false } }));
    assertEqual(again.options.importance, true);
  });

  test('a question with importance switches it on in an existing target', () => {
    const first = kanoStateFromSurvey(null, input({ question: { ...KANO_Q, importance: false } }));
    const again = kanoStateFromSurvey(first, input());
    assertEqual(again.options.importance, true);
  });

  test('the target object is not mutated', () => {
    const first = kanoStateFromSurvey(null, input());
    const copy = JSON.stringify(first);
    kanoStateFromSurvey(first, input());
    assertEqual(JSON.stringify(first), copy);
  });
});

suite('survey-link — VoC tree', () => {
  test('vocsFromAnswers adds the name unless anonymous', () => {
    const v = vocsFromAnswers([{ text: 'Schneller', name: 'Anna' }, { text: 'Billiger', name: '' }], 'Fragebogen „Kunden“', false);
    assertDeepEqual(v.map((x) => [x.text, x.source, x.needs]), [
      ['Schneller', 'Fragebogen „Kunden“, Anna', []],
      ['Billiger', 'Fragebogen „Kunden“', []],
    ]);
    assertTrue(typeof v[0].id === 'string' && v[0].id !== v[1].id);
    assertEqual(vocsFromAnswers([{ text: 'X', name: 'Anna' }], 'Q', true)[0].source, 'Q');
  });

  test('appendVocs keeps existing VoCs and styles', () => {
    const tree = { vocs: [{ id: 'v0', text: 'Old', source: '', needs: [] }], activeVocId: 'v0', styles: { borderWidth: 2, colors: {} } };
    const next = appendVocs(tree, [{ id: 'v1', text: 'New', source: 'Q', needs: [] }]);
    assertDeepEqual(next.vocs.map((v) => v.id), ['v0', 'v1']);
    assertEqual(next.activeVocId, 'v0');
    assertEqual(next.styles.borderWidth, 2);
    assertEqual(tree.vocs.length, 1, 'input not mutated');
  });

  test('appendVocs into an empty or missing tree activates the first new VoC', () => {
    assertEqual(appendVocs(null, [{ id: 'v1', text: 'New', source: '', needs: [] }]).activeVocId, 'v1');
    assertEqual(appendVocs({ vocs: [], activeVocId: null }, [{ id: 'v2', text: 'N', source: '', needs: [] }]).activeVocId, 'v2');
  });
});

suite('survey-link — instances and phases', () => {
  const sm = {
    get: (key) => (key === 'phases'
      ? { define: [{ instanceId: 'k1', moduleId: 'kano' }, { instanceId: 's1', moduleId: 'survey-builder' }], measure: [{ instanceId: 'k2', moduleId: 'kano' }] }
      : undefined),
    getModuleState: (id) => ({ id }),
  };

  test('listInstances finds all instances of a module across phases', () => {
    assertDeepEqual(listInstances(sm, 'kano'), [
      { instanceId: 'k1', phase: 'define', state: { id: 'k1' } },
      { instanceId: 'k2', phase: 'measure', state: { id: 'k2' } },
    ]);
    assertDeepEqual(listInstances(null, 'kano'), []);
  });

  test('treePhaseForCycle follows the manifest', () => {
    assertEqual(treePhaseForCycle('dmaic'), 'define');
    assertEqual(treePhaseForCycle('unknown-cycle'), 'define');
  });
});
