/**
 * D.Mike — Generator of the frozen reference of the earlier survey-builder
 * (writes legacy-oracles.json next to this file).
 *
 * The domain tests under tests/modules/survey-builder/ compare the
 * declarative model with what the earlier model (legacy/survey-builder-model.js)
 * and the earlier results viewmodel (legacy/viewmodel/results.js) did. They
 * read that from legacy-oracles.json via `frozen(key, compute)` (cases.js)
 * and never import the earlier code. This script runs the same test files in
 * recording mode: every `frozen` call runs its `compute` with the earlier code
 * and records the result under its key. The tests themselves run along and
 * must pass; then the file is written.
 *
 * The browser tests draft-view.test.js and recipients-view.test.js cannot
 * run here. Their entries (`surveyFile.example.<lang>`: the general
 * questionnaire file of the example project in a questionnaire language, as
 * the earlier draft viewmodel built it; `recipientFile.example.<lang>`: the
 * file of one recipient, as the earlier recipients viewmodel built it) are
 * recorded by this script directly, after the test files.
 *
 * Regenerate (cwd app/dev, while legacy/ still exists):
 *
 *   node tests/modules/survey-builder/fixtures/generate-legacy-oracles.mjs
 *
 * Only needed when a test adds or changes a frozen entry. Once legacy/ is
 * gone, this script goes with it; the JSON stays as the reference.
 * Not a test file: the node runner only collects *.test.js.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const TESTS = ['answers', 'commands', 'invariants', 'migrations', 'model', 'handover-stacks'];

// cases.js loads JSON via fetch(file://…); node's fetch does not serve file URLs.
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  if (!url.startsWith('file://')) return realFetch(input, init);
  const body = await readFile(fileURLToPath(url), 'utf8');
  return { ok: true, status: 200, url, async json() { return JSON.parse(body); }, async text() { return body; } };
};

const { State: Legacy } = await import('../../../../js/modules/survey-builder/legacy/survey-builder-model.js');
const { ResultsViewModel } = await import('../../../../js/modules/survey-builder/legacy/viewmodel/results.js');
const { parseResponse } = await import('../../../../js/modules/survey-builder/domain/import.js');
const { t, fakeContext, attach } = await import('../../survey-vm-fakes.js');
const { kanoStateFromSurvey, vocsFromAnswers } = await import('../../../../js/modules/survey-builder/legacy/survey-link.js');

globalThis.__surveyOracle = { record: {}, deps: { Legacy, ResultsViewModel, parseResponse, t, fakeContext, attach, kanoStateFromSurvey, vocsFromAnswers } };

for (const name of TESTS) await import(pathToFileURL(join(HERE, '..', `${name}.test.js`)).href);
const { runAll } = await import('../../../test-utils.js');
const results = await runAll();
const failed = results.suites.flatMap((s) => s.tests.filter((x) => x.status === 'failed').map((x) => `${s.name} › ${x.name}: ${x.error}`));
if (failed.length) {
  console.error(`not written — ${failed.length} failing tests while recording:\n${failed.join('\n')}`);
  process.exit(1);
}
const record = globalThis.__surveyOracle.record;

// The general questionnaire file of the example in each questionnaire
// language, built by the earlier draft viewmodel with the app texts.
const { DraftViewModel } = await import('../../../../js/modules/survey-builder/legacy/viewmodel/draft.js');
const appTexts = {};
for (const lang of ['de', 'en']) appTexts[lang] = JSON.parse(await readFile(join(HERE, '..', '..', '..', '..', 'i18n', `${lang}.json`), 'utf8'));
/** @param {any} tree @param {string} path @returns {any} */
const at = (tree, path) => path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), tree);
/** @param {any} base @param {any} over @returns {any} */
const merge = (base, over) => {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return over === undefined ? base : over;
  const out = { ...(base && typeof base === 'object' ? base : {}) };
  for (const [k, v] of Object.entries(over)) out[k] = merge(out[k], v);
  return out;
};
const i18n = {
  getLanguage: () => 'de',
  t: (key) => key,
  async section(key, lang) {
    return JSON.parse(JSON.stringify(merge(merge({}, at(appTexts.en, key)), lang === 'en' ? undefined : at(appTexts[lang], key))));
  },
};
const example = JSON.parse(await readFile(join(HERE, '..', '..', '..', '..', 'examples', 'projects', 'survey-builder-software.json'), 'utf8'));
for (const lang of ['de', 'en']) {
  const json = JSON.parse(JSON.stringify(example));
  json.survey.lang = lang;
  const vm = new DraftViewModel({ t, context: fakeContext({ i18n }), container: () => null });
  vm.model = Legacy.fromJSON(json);
  const file = await vm.buildSurveyFile();
  record[`surveyFile.example.${lang}`] = { fileName: file.fileName, content: file.content, version: vm.model.survey.version };
}
// The file of one recipient (rec-2) of the example, built by the earlier
// recipients viewmodel: in German after a structural change (the version
// rises), in English without one.
const { RecipientsViewModel } = await import('../../../../js/modules/survey-builder/legacy/viewmodel/recipients.js');
for (const [lang, dirty] of [['de', true], ['en', false]]) {
  const json = JSON.parse(JSON.stringify(example));
  json.survey.lang = lang;
  json.dirtyStructure = dirty;
  const vm = new RecipientsViewModel({ t, context: fakeContext({ i18n }), container: () => null });
  vm.model = Legacy.fromJSON(json);
  const file = await vm.buildRecipientFile('rec-2');
  const r = vm.model.recipients.find((x) => x.id === 'rec-2');
  record[`recipientFile.example.${lang}`] = {
    fileName: file.fileName, content: file.content, version: vm.model.survey.version, sentVersion: r.sentVersion,
  };
}
// The evaluation of the example as the earlier results viewmodel showed it
// with the German app texts: the charts (`chartJobs`) and the lines and rows
// of the tab, without a filter or grouping, grouped, and filtered and grouped.
/** @param {string} key @param {object} [params] @returns {string} German app text with `{name}` filled in */
const deText = (key, params) => {
  const v = at(appTexts.de, key);
  if (typeof v !== 'string') return key;
  return v.replace(/\{(\w+)\}/g, (_, k) => (params && k in params ? String(params[k]) : `{${k}}`));
};
const deI18n = { getLanguage: () => 'de', t: deText };
const RESULT_VARIANTS = {
  all: {},
  grouped: { groupBy: 'q-group' },
  filtered: { filter: { questionId: 'q-erp', optionId: 'o-dynamics' }, groupBy: 'q-group' },
};
for (const [variant, ui] of Object.entries(RESULT_VARIANTS)) {
  const json = JSON.parse(JSON.stringify(example));
  json.ui = { ...json.ui, ...ui };
  const vm = new ResultsViewModel({
    t: (key, params) => deText(`modules.survey-builder.${key}`, params),
    context: fakeContext({ i18n: deI18n }),
    container: () => null,
  });
  vm.model = Legacy.fromJSON(json);
  record[`resultsView.example.${variant}`] = {
    chartJobs: vm.chartJobs(),
    filterOptions: vm.filterOptions(),
    filterValue: vm.filterValue(),
    nLine: vm.nLine(),
    rateLine: vm.rateLine(),
    hasWithoutRecipient: vm.hasWithoutRecipient(),
    withoutRecipientLine: vm.withoutRecipientLine(),
    hasRateGroups: vm.hasRateGroups(),
    rateGroups: vm.rateGroups(),
    rankingRows: vm.rankingRows(),
    kanoOverviewRows: vm.kanoOverviewRows(),
    freeTextLine: vm.freeTextLine(),
    groupByOptions: vm.groupByOptions(),
    groupsTitle: vm.groupsTitle(),
    groupHeads: vm.groupHeads(),
    comparisonParts: vm.comparisonParts(),
    blocks: vm.blocks().map((b) => ({ key: b.key, title: b.title, n: vm.blockN(b), type: b.stats.type })),
  };
}
// Ids the earlier model made with uid() become new-1, new-2, … per entry, so a
// regenerated file only differs where the behaviour did.
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const stable = (v) => {
  const seen = new Map();
  return JSON.parse(JSON.stringify(v).replace(UUID, (id) => {
    if (!seen.has(id)) seen.set(id, `new-${seen.size + 1}`);
    return seen.get(id);
  }));
};
const sorted = Object.fromEntries(Object.keys(record).sort().map((k) => [k, stable(record[k])]));
const out = join(HERE, 'legacy-oracles.json');
// One entry per line: a regenerated file diffs per key.
await writeFile(out, `{\n${Object.entries(sorted).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n}\n`);
console.log(`wrote ${Object.keys(sorted).length} entries to ${out}`);
