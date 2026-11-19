/**
 * Survey builder: the recipients tab and the upper part of the results tab
 * (reading answer files, the list of responses) in the browser — the real
 * module with the real template.
 *
 * The file of a recipient of the example is compared with the file the
 * earlier recipients viewmodel built, frozen in fixtures/legacy-oracles.json
 * (entries `recipientFile.example.<lang>`).
 */
import { suite, test, assert, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { mount, stored, settle, typeIn, de, helpEntry } from './view-harness.js';
import { loadTexts } from '../../../js/modules/survey-builder/viewmodel/texts.js';

/** @param {string} path relative to this file @returns {Promise<any>} */
async function loadJson(path) {
  return (await fetch(new URL(path, import.meta.url), { cache: 'no-cache' })).json();
}

const EXAMPLE = await loadJson('../../../js/modules/survey-builder/resources/examples/projects/survey-builder-software.json');
const ORACLES = await loadJson('./fixtures/legacy-oracles.json');

/** @returns {any} a fresh copy of the example project */
const example = () => JSON.parse(JSON.stringify(EXAMPLE));

/** One text question, two recipients; Anna has answered. */
const withRecipients = (over = {}) => stored({
  survey: {
    version: 1,
    sections: [{
      id: 's1', title: 'Allgemein', hint: '', when: null, questions: [
        { id: 'q1', type: 'text', text: 'Wünsche', hint: '', required: false, when: null, multiline: false },
      ],
    }],
  },
  recipients: [
    { id: 'rc1', name: 'Anna', organisation: 'A GmbH', group: 'Handel', email: '', note: '', sentAt: '2026-10-01T09:00:00.000Z', sentVersion: 1 },
    { id: 'rc2', name: '', organisation: '', group: '', email: '', note: '', sentAt: null, sentVersion: null },
  ],
  responses: [
    { id: 'r1', surveyVersion: 1, recipientId: 'rc1', viaRecipient: true, submittedAt: '2026-10-02T08:00:00.000Z', answers: { q1: { text: 'Mehr Tempo' } } },
  ],
  answeredRecipientIds: ['rc1'],
  tab: 'recipients',
  ...over,
});

/** An answer file of the survey `sv-1` as the questionnaire saves it. */
function answerFile(name, responseId, extra = {}) {
  const body = JSON.stringify({
    format: 'dmike-survey-response', formatVersion: 1, surveyId: 'sv-1', surveyVersion: 1,
    recipientId: null, responseId, submittedAt: '2026-10-10T09:30:00.000Z', answers: { q1: 'Schneller' }, ...extra,
  });
  return new File([body], name, { type: 'application/json' });
}

/** @param {Element|null} el @returns {boolean} neither it nor an ancestor is hidden by `x-show` */
function shown(el) {
  for (let n = el; n; n = n.parentElement) if (/** @type {HTMLElement} */ (n).style?.display === 'none') return false;
  return Boolean(el);
}

/** @param {any} h @param {string} id @returns {HTMLElement} */
const row = (h, id) => h.$(`[data-recipient-id="${id}"]`);

suite('survey-builder recipients: list', () => {
  test('adding a recipient shows a row; its fields bind to the model', async () => {
    const h = await mount(stored({ tab: 'recipients' }));
    assertTrue(shown(h.$('[data-ref="recipientsEmpty"]')), 'empty hint shown');
    h.$('[data-ref="addRecipient"]').click();
    await settle();
    assertEqual(h.calls('addRecipient').length, 1);
    const r = h.vm().model.recipients[0];
    assertTrue(Boolean(r), 'recipient added');
    for (const field of ['name', 'organisation', 'group', 'email', 'note']) {
      typeIn(row(h, r.id).querySelector(`[data-field="${field}"]`), `${field}-x`);
    }
    await settle();
    assertDeepEqual(
      ['name', 'organisation', 'group', 'email', 'note'].map((f) => h.vm().model.recipients[0][f]),
      ['name-x', 'organisation-x', 'group-x', 'email-x', 'note-x'],
    );
    assertEqual(row(h, r.id).querySelector('[data-ref="status"]').textContent, de('statusNotSent'));
    assertEqual(row(h, r.id).querySelector('[data-ref="sent"]').textContent, '–');
  });

  test('status, sent line and counts as before; the outdated hint after a new version', async () => {
    const h = await mount(withRecipients({ survey: { ...withRecipients().survey, version: 2 } }));
    assertEqual(row(h, 'rc1').querySelector('[data-ref="status"]').textContent, de('statusAnswered'));
    assertEqual(row(h, 'rc2').querySelector('[data-ref="status"]').textContent, de('statusNotSent'));
    const date = new Date('2026-10-01T09:00:00.000Z').toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
    assertEqual(row(h, 'rc1').querySelector('[data-ref="sent"]').textContent, de('sentLabel', { date, version: 1 }));
    const outdated = row(h, 'rc1').querySelector('[data-ref="outdated"]');
    assertEqual(outdated.textContent, de('outdatedHint', { version: 1 }));
    assertTrue(shown(outdated), 'outdated hint shown');
    assertEqual(h.$('[data-ref="recipientCounts"]').textContent, de('report.rateLine', { sent: 1, answered: 1, rate: '100 %' }));
  });

  test('the anonymous hint shows only for an anonymous survey', async () => {
    const h = await mount(withRecipients());
    assertEqual(shown(h.$('[data-ref="anonymousInfo"]')), false);
    const a = await mount(withRecipients({ survey: { ...withRecipients().survey, anonymous: true } }));
    assertTrue(shown(a.$('[data-ref="anonymousInfo"]')), 'anonymous hint shown');
  });

  test('deleting an answered recipient asks with its name, another one the generic question; declined it stays, confirmed its answer stays without recipient', async () => {
    const no = await mount(withRecipients(), { confirm: false });
    row(no, 'rc1').querySelector('[data-action="deleteRecipient"]').click();
    await settle();
    assertDeepEqual(no.confirms.map((c) => c.message), [de('confirmRecipientDelete', { name: 'Anna' })]);
    assertEqual(no.vm().model.recipients.length, 2);
    const yes = await mount(withRecipients());
    row(yes, 'rc1').querySelector('[data-action="deleteRecipient"]').click();
    await settle();
    assertDeepEqual(yes.vm().model.recipients.map((r) => r.id), ['rc2']);
    assertEqual(yes.vm().model.responses[0].recipientId, null);
    row(yes, 'rc2').querySelector('[data-action="deleteRecipient"]').click();
    await settle();
    // Every delete asks (generic delete confirmation): without an answer the generic question.
    assertDeepEqual(yes.confirms.map((c) => c.message), [de('confirmRecipientDelete', { name: 'Anna' }), 'common.confirmDelete']);
    assertEqual(yes.vm().model.recipients.length, 0);
  });
});

suite('survey-builder recipients: unnamed', () => {
  test('deleting an answered recipient without a name asks with the unnamed text', async () => {
    const base = withRecipients();
    const h = await mount(withRecipients({
      responses: [...base.responses, { id: 'r9', surveyVersion: 1, recipientId: 'rc2', viaRecipient: true, submittedAt: '2026-10-03T08:00:00.000Z', answers: {} }],
      answeredRecipientIds: ['rc1', 'rc2'],
    }), { confirm: false });
    row(h, 'rc2').querySelector('[data-action="deleteRecipient"]').click();
    await settle();
    assertDeepEqual(h.confirms.map((c) => c.message), [de('confirmRecipientDeleteUnnamed')]);
    assertEqual(h.vm().model.recipients.length, 2);
  });
});

suite('survey-builder recipients: file', () => {
  for (const lang of ['de', 'en']) {
    test(`buildRecipientFile of the example in ${lang} is the earlier file; the recipient is sent with the current version`, async () => {
      const json = example();
      json.survey.lang = lang;
      json.dirtyStructure = lang === 'de';
      const h = await mount(json);
      const out = await h.vm()._asyncTaskHost.start('buildRecipientFile', { recipientId: 'rec-2' });
      assertEqual(out.status, 'done');
      const want = ORACLES[`recipientFile.example.${lang}`];
      assertEqual(out.value.fileName, want.fileName);
      assertEqual(out.value.mimeType, 'text/html;charset=utf-8');
      assert(out.value.content === want.content, 'content differs from the earlier file');
      const m = h.vm().model;
      assertEqual(m.survey.version, want.version);
      const r = m.recipients.find((x) => x.id === 'rec-2');
      assertEqual(r.sentVersion, want.sentVersion);
      assertEqual(m.isOutdated('rec-2'), false);
      assertTrue(Date.now() - Date.parse(r.sentAt) < 60000, 'sent just now');
      assertEqual(m.exportedOnce, true);
      assertEqual(m.dirtyStructure, false);
    });
  }

  test('the file of a recipient who was never sent marks them sent', async () => {
    const h = await mount(withRecipients());
    const out = await h.vm()._asyncTaskHost.start('buildRecipientFile', { recipientId: 'rc2' });
    assertEqual(out.status, 'done');
    assertTrue(out.value.content.includes('"recipientId":"rc2"'), 'recipient id in the file');
    await settle();
    assertEqual(row(h, 'rc2').querySelector('[data-ref="status"]').textContent, de('statusSent'));
  });
});

suite('survey-builder recipients: file of a deleted recipient', () => {
  test('a recipient deleted while the file is built: the run fails with its own text, version and export mark stay', async () => {
    const json = example();
    json.dirtyStructure = true;
    const h = await mount(json);
    const m = h.vm().model;
    const before = { version: m.survey.version, exportedOnce: m.exportedOnce, dirty: m.dirtyStructure };
    const run = h.vm()._asyncTaskHost.start('buildRecipientFile', { recipientId: 'rec-2' });
    m.removeRecipient({ recipientId: 'rec-2' });
    const out = await run;
    assertEqual(out.status, 'failed');
    assertEqual(out.error.message, de('recipientFileFailed'));
    assertDeepEqual({ version: m.survey.version, exportedOnce: m.exportedOnce, dirty: m.dirtyStructure }, before);
  });
});

suite('survey-builder recipients: file cancelled', () => {
  test('cancelled while the texts load: version, export mark and the recipient stay as they were', async () => {
    const json = example();
    json.dirtyStructure = true;
    const h = await mount(json);
    const m = h.vm().model;
    const sent = () => { const r = m.recipients.find((x) => x.id === 'rec-2'); return { sentAt: r.sentAt, sentVersion: r.sentVersion }; };
    const before = { version: m.survey.version, exportedOnce: m.exportedOnce, dirty: m.dirtyStructure, ...sent() };
    const run = h.vm()._asyncTaskHost.start('buildRecipientFile', { recipientId: 'rec-2' });
    h.vm()._asyncTaskHost.cancel('buildRecipientFile');
    assertEqual((await run).status, 'cancelled');
    await loadTexts(json.survey.lang);
    await settle();
    assertDeepEqual({ version: m.survey.version, exportedOnce: m.exportedOnce, dirty: m.dirtyStructure, ...sent() }, before);
  });
});

suite('survey-builder recipients: reading answers', () => {
  const note = (file, reason) => de('importFileNote', { file, reason });

  test('three files (ok, foreign, the same again) and a broken one: one response, a toast per rejected file, one summary toast', async () => {
    const h = await mount(withRecipients({ tab: 'results' }));
    await h.vm().importFiles([
      answerFile('a.json', 'r2', { recipientId: 'gone' }),
      answerFile('f.json', 'r3', { surveyId: 'other' }),
      answerFile('kopie.json', 'r2'),
      new File(['{"format":'], 'x.json'),
    ]);
    await settle();
    const m = h.vm().model;
    assertDeepEqual(m.responses.map((r) => r.id), ['r1', 'r2']);
    assertDeepEqual(h.calls('importResponse').map((a) => a.fileName), ['a.json', 'f.json', 'kopie.json', 'x.json']);
    assertDeepEqual(h.notes, [
      [note('a.json', de('importUnknownRecipient')), 'info'],
      [note('f.json', de('importForeign')), 'error'],
      [note('kopie.json', de('importDuplicate')), 'warning'],
      [note('x.json', de('importInvalid')), 'error'],
      [de('importDone', { count: 1 }), 'success'],
    ]);
    assertEqual(h.$$('[data-ref="importLog"]').length, 0, 'no import log any more');
  });

  test('a file for a known recipient makes them answered; a caveat goes out as an info toast', async () => {
    const h = await mount(withRecipients({ tab: 'results' }));
    await h.vm().importFiles([answerFile('b.json', 'r4', { recipientId: 'rc2', answers: { q1: 'Gut', q9: 'weg' } })]);
    await settle();
    assertEqual(h.vm().model.recipientStatus('rc2'), 'answered');
    assertDeepEqual(h.notes, [
      [note('b.json', de('importOrphans', { count: 1 })), 'info'],
      [de('importDone', { count: 1 }), 'success'],
    ]);
  });

  test('a file of an older version is read in, with an info toast', async () => {
    const h = await mount(withRecipients({ tab: 'results', survey: { ...withRecipients().survey, version: 2 } }));
    await h.vm().importFiles([answerFile('alt.json', 'r5')]);
    await settle();
    assertDeepEqual(h.vm().model.responses.map((r) => r.id), ['r1', 'r5']);
    assertDeepEqual(h.notes, [[note('alt.json', de('importOlder')), 'info'], [de('importDone', { count: 1 }), 'success']]);
  });

  test('an empty pick does nothing', async () => {
    const h = await mount(withRecipients({ tab: 'results' }));
    await h.vm().importFiles([]);
    await settle();
    assertDeepEqual(h.notes, []);
  });

  test('the action bar shows the results tab and opens the file picker of the hidden x-file-drop', async () => {
    const h = await mount(withRecipients({ tab: 'draft' }));
    const drop = h.$('[data-ref="importDrop"]');
    assertEqual(drop.getAttribute('x-file-drop'), 'importFiles');
    assertTrue(drop.hidden, 'no visible drop zone');
    const input = drop.querySelector('input[type="file"]');
    let opened = 0;
    input.addEventListener('click', (e) => { e.preventDefault(); opened += 1; });
    h.vm().importAnswers();
    await settle();
    assertEqual(h.vm().model.tab, 'results');
    assertEqual(opened, 1);
  });

  test('a failing import command: an invalid toast, commandFailed, the cause logged but not shown', async () => {
    const h = await mount(withRecipients({ tab: 'results' }));
    const model = h.vm()._ui.model;
    const real = model.importResponse;
    const warned = [];
    const warn = console.warn;
    console.warn = (...a) => warned.push(a);
    try {
      model.importResponse = () => { throw new Error('parser exploded'); };
      await h.vm().importFiles([answerFile('a.json', 'r2')]);
      await settle();
    } finally {
      console.warn = warn;
      model.importResponse = real;
    }
    assertDeepEqual(h.notes, [[de('commandFailed'), 'error'], [note('a.json', de('importInvalid')), 'error']]);
    assertEqual(warned.length, 1);
    assertEqual(warned[0][0], '[survey-builder] importResponse failed');
    assertEqual(warned[0][1].message, 'parser exploded');
    assertTrue(!h.container.textContent.includes('parser exploded'), 'no error message shown');
    assertEqual(h.vm().model.responses.length, 1);
  });

  test('an import through the agent surface gets its toast too, but no summary', async () => {
    const h = await mount(withRecipients({ tab: 'results' }));
    const agentFile = answerFile('agent.json', 'r2', { recipientId: 'gone' });
    // The command of the mounted model, as the agent surface runs it.
    const res = h.vm()._ui.model.importResponse({ json: await agentFile.text(), fileName: 'agent.json' });
    assertEqual(res.status, 'ok');
    await settle();
    assertDeepEqual(h.notes, [[note('agent.json', de('importUnknownRecipient')), 'info']]);
  });

  test('an import of another instance raises no toast here', async () => {
    const h = await mount(withRecipients({ tab: 'results' }));
    h.bus.emit('command:executed', {
      instanceId: 'other', command: 'importResponse', args: { fileName: 'fremd.json' },
      result: { status: 'foreign', orphanIds: [], unknownRecipient: false },
    });
    await settle();
    assertDeepEqual(h.notes, []);
  });

  test('an unreadable file counts as no answer file', async () => {
    const h = await mount(withRecipients({ tab: 'results' }));
    const broken = { name: 'kaputt.json', text: async () => { throw new Error('disk on fire'); } };
    await h.vm().importFiles([broken]);
    await settle();
    assertDeepEqual(h.notes, [[note('kaputt.json', de('importInvalid')), 'error']]);
    assertTrue(!h.container.textContent.includes('disk on fire'), 'no error message shown');
  });
});

suite('survey-builder recipients: responses', () => {
  test('a response folds open in state.expandedResponses and shows its answers; one at a time', async () => {
    const h = await mount(withRecipients({ tab: 'results' }));
    await h.vm().importFiles([answerFile('a.json', 'r2')]);
    await settle();
    const body = (id) => h.$(`[data-response-id="${id}"]`);
    assertEqual(body('r1').querySelector('[data-ref="who"]').textContent, 'Anna');
    assertEqual(body('r2').querySelector('[data-ref="who"]').textContent, de('respWithoutRecipient'));
    const date = new Date('2026-10-02T08:00:00.000Z').toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
    assertEqual(body('r1').querySelector('[data-ref="date"]').textContent, date);
    assertEqual(shown(body('r1').querySelector('[data-ref="details"]')), false);
    body('r1').querySelector('[data-action="toggleResponse"]').click();
    await settle();
    assertDeepEqual(h.vm().state.expandedResponses, ['r1']);
    assertTrue(shown(body('r1').querySelector('[data-ref="details"]')), 'details shown');
    assertDeepEqual([...body('r1').querySelectorAll('dd')].map((d) => d.textContent), ['Mehr Tempo']);
    body('r2').querySelector('[data-action="toggleResponse"]').click();
    await settle();
    assertDeepEqual(h.vm().state.expandedResponses, ['r2']);
    body('r2').querySelector('[data-action="toggleResponse"]').click();
    await settle();
    assertDeepEqual(h.vm().state.expandedResponses, []);
    assertEqual('expandedResponses' in h.vm().model.toJSON(), false);
  });

  test('anonymous: every response is „anonym“', async () => {
    const h = await mount(withRecipients({ tab: 'results', survey: { ...withRecipients().survey, anonymous: true } }));
    assertEqual(h.$('[data-response-id="r1"] [data-ref="who"]').textContent, de('respAnonymous'));
  });

  test('deleting a response asks; confirmed, the recipient falls back from answered and the row closes', async () => {
    const no = await mount(withRecipients({ tab: 'results' }), { confirm: false });
    no.$('[data-response-id="r1"] [data-action="deleteResponse"]').click();
    await settle();
    assertDeepEqual(no.confirms.map((c) => c.message), [de('confirmResponseDelete')]);
    assertEqual(no.vm().model.responses.length, 1);
    const h = await mount(withRecipients({ tab: 'results' }));
    h.$('[data-response-id="r1"] [data-action="toggleResponse"]').click();
    await settle();
    h.$('[data-response-id="r1"] [data-action="deleteResponse"]').click();
    await settle();
    assertEqual(h.vm().model.responses.length, 0);
    assertEqual(h.vm().model.recipientStatus('rc1'), 'sent');
    assertDeepEqual(h.vm().state.expandedResponses, []);
    assertTrue(shown(h.$('[data-ref="responsesEmpty"]')), 'empty hint shown');
  });
});

suite('survey-builder recipients: help badges', () => {
  test('every caption of both tabs has a help key that exists; row buttons carry none', async () => {
    const h = await mount(withRecipients());
    await h.vm().importFiles([answerFile('a.json', 'r2')]);
    await settle();
    for (const ref of ['recipientsTab', 'resultsTab']) {
      const tab = h.$(`[data-ref="${ref}"]`);
      const captions = [...tab.querySelectorAll('label, th, .dmike-kpi-label')].filter((el) => el.textContent.trim());
      assertTrue(captions.length >= 2, `${ref} captions: ${captions.length}`);
      for (const el of captions) {
        const key = el.getAttribute('data-help-key') || el.querySelector('[data-help-key]:not([data-help-key=""])')?.getAttribute('data-help-key');
        assertTrue(Boolean(key), `no help key: ${el.outerHTML.slice(0, 120)}`);
      }
      for (const el of [...tab.querySelectorAll('[data-help-key]')].filter((e) => e.getAttribute('data-help-key'))) {
        const key = el.getAttribute('data-help-key');
        assertTrue(key.startsWith('modules.survey-builder.'), key);
        const entry = helpEntry(key.slice('modules.survey-builder.'.length).replace(/\.help$/, ''));
        assertTrue(Boolean(entry && (typeof entry === 'string' || entry.help)), `help text missing: ${key}`);
        assertEqual(el.parentElement.closest('[data-help-key]:not([data-help-key=""])'), null, `badge inside a badge: ${key}`);
      }
      for (const el of tab.querySelectorAll('[x-command]')) {
        const key = el.getAttribute('data-help-key');
        const cmd = el.getAttribute('x-command');
        assertTrue(key === '' || key === `modules.survey-builder.actions.${cmd}.help`, `${cmd}: ${key}`);
      }
    }
    for (const sel of ['[data-action="exportRecipient"]', '[data-action="deleteRecipient"]', '[data-action="toggleResponse"]', '[data-action="deleteResponse"]']) {
      assertTrue(h.$$(sel).length > 0 && h.$$(sel).every((el) => el.getAttribute('data-help-key') === ''), sel);
    }
    assertEqual(h.$('[data-ref="addRecipient"]').getAttribute('data-help-key'), 'modules.survey-builder.actions.addRecipient.help');
  });
});
