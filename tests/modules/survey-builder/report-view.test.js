/**
 * Survey builder: the report as an export in the browser — the html format
 * of the export menu and the task `buildReport` — with the real module and
 * the real template. The HTML of the example is compared with what the
 * earlier results viewmodel built, frozen in fixtures/legacy-oracles.json
 * (entries `report.example.<variant>`, the day of creation replaced by
 * `{generated}`).
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import { mount } from './view-harness.js';
import { runExport } from '../../../js/core/exporter.js';
import { formatsOf } from '../../../js/core/exporter.js';

/** @param {string} path relative to this file @returns {Promise<any>} */
async function loadJson(path) {
  return (await fetch(new URL(path, import.meta.url), { cache: 'no-cache' })).json();
}

const EXAMPLE = await loadJson('../../../examples/projects/survey-builder-software.json');
const ORACLES = await loadJson('./fixtures/legacy-oracles.json');

/** @param {object} [ui] filter, grouping and the names switch @returns {any} a copy of the example project */
function example(ui = {}) {
  const json = JSON.parse(JSON.stringify(EXAMPLE));
  json.ui = { ...json.ui, ...ui };
  return json;
}

/** @param {string} html @returns {string} with the day of creation replaced */
const normalized = (html) => html.replace(/(<p class="meta">Erstellt am )[^<]*(<\/p>)/, '$1{generated}$2');

/** @param {any} h mounted module @param {string} fmt @returns {Promise<{ name: string, text: string, type: string }[]>} the files an export writes */
async function exportFiles(h, fmt) {
  const blobs = [];
  const io = {
    downloadBlob: (blob, name) => { blobs.push([blob, name]); },
    downloadFile: () => {},
  };
  const ui = h.vm()._ui;
  const errors = [];
  const orig = console.error;
  console.error = (...a) => errors.push(a.map(String).join(' '));
  try { await runExport(ui, fmt, io); } finally { console.error = orig; }
  if (errors.length) throw new Error(errors.join(' | '));
  return Promise.all(blobs.map(async ([blob, name]) => ({ name, text: await blob.text(), type: blob.type })));
}

/** Compares two texts; a difference is reported with the text around its first place. */
function assertSameText(actual, expected) {
  if (actual === expected) return;
  let i = 0;
  while (i < actual.length && actual[i] === expected[i]) i++;
  throw new Error(`differs at ${i}: got ${JSON.stringify(actual.slice(Math.max(0, i - 60), i + 120))}, want ${JSON.stringify(expected.slice(Math.max(0, i - 60), i + 120))}`);
}

const VARIANTS = {
  all: {},
  grouped: { groupBy: 'q-group' },
  filtered: { filter: { questionId: 'q-erp', optionId: 'o-dynamics' }, groupBy: 'q-group' },
  withNames: { reportWithNames: true },
};

suite('survey-builder report: export menu', () => {
  test('the export menu offers html', async () => {
    const h = await mount(example());
    assertTrue(formatsOf(h.vm()._ui.exports).includes('html'), 'html offered');
  });

  test('the html export downloads <title>.html as text/html', async () => {
    const h = await mount(example());
    const files = await exportFiles(h, 'html');
    assertEqual(files.length, 1);
    assertEqual(files[0].name, `${EXAMPLE.survey.title}.html`);
    assertEqual(files[0].type, 'text/html;charset=utf-8');
    assertTrue(files[0].text.startsWith('<!doctype html>') || files[0].text.startsWith('<!DOCTYPE html>'), 'a document');
  });

  test('without a title the file is named after the placeholder', async () => {
    const h = await mount(example());
    h.vm().model.survey = { ...JSON.parse(JSON.stringify(h.vm().model.survey)), title: '  ' };
    const files = await exportFiles(h, 'html');
    assertEqual(files[0].name, 'Fragebogen.html');
  });
});

suite('survey-builder report: content', () => {
  for (const [name, ui] of Object.entries(VARIANTS)) {
    test(`example "${name}" equals the report of the earlier form, the timestamp aside`, async () => {
      const h = await mount(example(ui));
      const [file] = await exportFiles(h, 'html');
      assertSameText(normalized(file.text), ORACLES[`report.example.${name}`].content);
    });
  }

  test('"with names" shows the names of the recipients, the others do not', async () => {
    const names = EXAMPLE.recipients.map((r) => r.name);
    const withNames = ORACLES['report.example.withNames'].content;
    assertTrue(names.some((n) => withNames.includes(n)), 'a name is shown');
    assertTrue(!names.some((n) => ORACLES['report.example.all'].content.includes(n)), 'no name without the switch');
  });

  test('an anonymous survey shows no names, even "with names"', async () => {
    const json = example({ reportWithNames: true });
    json.survey.anonymous = true;
    const h = await mount(json);
    const [file] = await exportFiles(h, 'html');
    for (const r of EXAMPLE.recipients) assertTrue(!file.text.includes(r.name), `no ${r.name}`);
    const plain = example({ reportWithNames: true });
    const h2 = await mount(plain);
    const [named] = await exportFiles(h2, 'html');
    assertTrue(EXAMPLE.recipients.some((r) => named.text.includes(r.name)), 'the same survey names them when not anonymous');
  });

  test('Kano categories take their names from the module\'s own kano.cat* texts', async () => {
    const h = await mount(example());
    const [file] = await exportFiles(h, 'html');
    assertTrue(file.text.includes('Basismerkmal') || file.text.includes('Leistungsmerkmal') || file.text.includes('Begeisterungsmerkmal'), 'a category name from kano.cat*');
    assertTrue(!/>[MOAIRQ]<\/td>/.test(file.text), 'no bare category code');
  });
});

suite('survey-builder report: task buildReport', () => {
  test('gives the same text and the file name, and downloads nothing', async () => {
    const h = await mount(example(VARIANTS.filtered));
    const [file] = await exportFiles(h, 'html');
    const out = await h.vm()._asyncTaskHost.start('buildReport', {});
    assertEqual(out.status, 'done');
    assertDeepEqual(Object.keys(out.value).sort(), ['content', 'fileName']);
    assertEqual(out.value.fileName, file.name);
    assertSameText(normalized(out.value.content), normalized(file.text));
    assertSameText(normalized(out.value.content), ORACLES['report.example.filtered'].content);
  });
});
