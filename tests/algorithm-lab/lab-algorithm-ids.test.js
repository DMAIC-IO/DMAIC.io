import { suite, test, assertTrue, assertEqual } from '../test-utils.js';
import { INDEX, ALGOS } from '../../js/algorithm-lab/lab-data.generated.js';

// Regression guard: the glossary inline-linking pass (commit 7538e5d,
// "feat(glossary): 104 neue Fachbegriffe + Inline-Verlinkung") ran a bulk
// replacement across the algorithm JSONs and rewrote the `id` field too:
//
//   "id": "one-sample-t-test"  →  "id": "one-sample-{{term:t-test|t-test}}"
//
// Five algorithms were hit (one-/two-sample-t-test, welch-t-test,
// correlation-analysis, overdispersion-check). Their sidebar entries then
// carried a `data-algo-id` full of template markup, so they could not be
// selected, deep-linked or validated any more.
//
// `id` is a slug — it keys ALGOS, matches the file name and ends up in the DOM.
// Glossary markup belongs in the prose fields (`name`, descriptions), never here.

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

suite('Algorithm Lab: Algorithmus-IDs sind reine Slugs', () => {
  test('kein Algorithmus trägt Template-Markup in der ID', () => {
    const broken = Object.keys(ALGOS).filter(id => id.includes('{{') || id.includes('}}'));
    assertEqual(broken.length, 0,
      `IDs mit Glossar-Markup: ${JSON.stringify(broken)}`);
  });

  test('jede ID entspricht dem Slug-Format', () => {
    const bad = Object.keys(ALGOS).filter(id => !SLUG.test(id));
    assertEqual(bad.length, 0, `IDs verletzen das Slug-Format: ${JSON.stringify(bad)}`);
  });

  test('das id-Feld im Datensatz stimmt mit seinem ALGOS-Schlüssel überein', () => {
    const mismatched = Object.entries(ALGOS)
      .filter(([key, algo]) => algo.id !== key)
      .map(([key, algo]) => `${key} → ${algo.id}`);
    assertEqual(mismatched.length, 0,
      `id-Feld weicht vom Schlüssel ab: ${JSON.stringify(mismatched)}`);
  });

  test('jeder Index-Eintrag ist unter seiner ID auffindbar', () => {
    const entries = INDEX.algorithms || [];
    assertTrue(entries.length > 0, 'Index enthält Algorithmen');
    const missing = entries.map(a => a.id).filter(id => !ALGOS[id]);
    assertEqual(missing.length, 0,
      `Im Index gelistet, aber nicht in ALGOS auflösbar: ${JSON.stringify(missing)}`);
  });
});
