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
const TESTS = ['answers', 'commands', 'invariants', 'migrations', 'model'];

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

globalThis.__surveyOracle = { record: {}, deps: { Legacy, ResultsViewModel, parseResponse, t, fakeContext, attach } };

for (const name of TESTS) await import(pathToFileURL(join(HERE, '..', `${name}.test.js`)).href);
const { runAll } = await import('../../../test-utils.js');
const results = await runAll();
const failed = results.suites.flatMap((s) => s.tests.filter((x) => x.status === 'failed').map((x) => `${s.name} › ${x.name}: ${x.error}`));
if (failed.length) {
  console.error(`not written — ${failed.length} failing tests while recording:\n${failed.join('\n')}`);
  process.exit(1);
}
const record = globalThis.__surveyOracle.record;
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
