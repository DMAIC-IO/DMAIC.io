/**
 * D.Mike — ishikawa sub-viewmodels know neither each other nor the shell
 * (spec 2026-10-25 E2). Reads the sources and checks their imports.
 */
import { suite, test, assertDeepEqual } from '../test-utils.js';

const DIR = 'js/modules/ishikawa/viewmodel/';
/** Every sub-viewmodel file; grows with each one that lands. */
const FILES = ['problem.js', 'experiments.js', 'snapshots.js'];

const IMPORT = /^\s*import\s[^'"]*['"]([^'"]+)['"]/gm;
const PRIVATE = /\bthis\.#|^\s*(?:static\s+)?#[A-Za-z_$][\w$]*\s*(?:=|\(|;)/;

/** @param {string} file @returns {Promise<string>} source of a sub-viewmodel */
async function source(file) {
  const res = await fetch(new URL(`../../${DIR}${file}`, import.meta.url));
  return res.text();
}

suite('ishikawa — sub-viewmodel dependencies', () => {
  for (const file of FILES) {
    test(`${file} imports no sibling and not the shell`, async () => {
      const bad = [...(await source(file)).matchAll(IMPORT)].map((m) => m[1])
        .filter((spec) => spec.startsWith('./') || spec === '../ishikawa.js');
      assertDeepEqual(bad, [], `${file}: a sub-viewmodel may import the model, ishikawa-labels.js, ishikawa-charts.js, ishikawa-constants.js and core modules only`);
    });

    test(`${file} has no #private members`, async () => {
      const hits = (await source(file)).split('\n').filter((line) => PRIVATE.test(line));
      assertDeepEqual(hits, [], `${file}: Alpine's proxy cannot reach #private fields — use the _ prefix`);
    });
  }
});
