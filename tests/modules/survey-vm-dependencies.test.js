/**
 * D.Mike — survey-builder sub-viewmodels know neither each other nor the shell.
 * Reads the sources and checks their imports.
 */
import { suite, test, assertDeepEqual } from '../test-utils.js';

const DIR = 'js/modules/survey-builder/viewmodel/';
/** Every sub-viewmodel file; grows with each one that lands. */
const FILES = ['recipients.js', 'responses.js', 'handover.js', 'draft.js', 'results.js'];

const IMPORT = /^\s*import\s[^'"]*['"]([^'"]+)['"]/gm;
const PRIVATE = /\bthis\.#|^\s*(?:static\s+)?#[A-Za-z_$][\w$]*\s*(?:=|\(|;)/;

/** @param {string} file @returns {Promise<string>} source of a sub-viewmodel */
async function source(file) {
  const res = await fetch(new URL(`../../${DIR}${file}`, import.meta.url));
  return res.text();
}

suite('survey-builder — sub-viewmodel dependencies', () => {
  for (const file of FILES) {
    test(`${file} imports no sibling and not the shell`, async () => {
      const bad = [...(await source(file)).matchAll(IMPORT)].map((m) => m[1])
        .filter((spec) => spec.startsWith('./') || spec === '../survey-builder.js');
      assertDeepEqual(bad, [], `${file}: a sub-viewmodel may import the model, survey-labels.js and the pure survey-*.js only`);
    });

    test(`${file} has no #private members`, async () => {
      const hits = (await source(file)).split('\n').filter((line) => PRIVATE.test(line));
      assertDeepEqual(hits, [], `${file}: Alpine's proxy cannot reach #private fields — use the _ prefix`);
    });
  }
});
