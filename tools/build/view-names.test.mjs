/**
 * Statische Lesung des view-Blocks (tools/build/view-names.mjs): Teile als
 * Liste, Bezeichner über den Import aufgelöst.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { viewNamesDetailOf, viewMemberNamesOf, computedNamesOf, viewPartNodes, unresolvedViewParts } from './view-names.mjs';

function appWith(files) {
  const root = mkdtempSync(join(tmpdir(), 'view-names-'));
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

const PROBLEM = `/** @type {any} */
export const problemView = (ctx) => ({
  get problemText() { return ''; },
  upload() {},
  computed: { gallery() { return []; } },
});
`;
const CAUSES = `export function causesView(ctx) {
  const helper = () => ({ notAMember: 1 });
  return {
    rows: [],
    toggle() {},
    computed: { pareto() { return null; } },
  };
}
`;
const VM = `import { problemView } from './problem.js';
import { causesView as causes } from './causes.js';
export default createModule({ view: [problemView, causes] });
`;

test('view: [problemView, causesView] — Glieder beider importierten Teile', () => {
  const root = appWith({ 'm/viewmodel/viewmodel.js': VM, 'm/viewmodel/problem.js': PROBLEM, 'm/viewmodel/causes.js': CAUSES });
  const file = join(root, 'm/viewmodel/viewmodel.js');
  const text = VM;
  assert.deepEqual(viewNamesDetailOf(text, file), {
    getters: ['problemText'], computed: ['gallery', 'pareto'], data: ['rows'],
  });
  assert.deepEqual([...viewMemberNamesOf(text, file)].sort(), ['computed', 'gallery', 'pareto', 'problemText', 'rows', 'toggle', 'upload']);
  assert.deepEqual(computedNamesOf(text, file), ['gallery', 'pareto']);
  assert.equal(viewPartNodes(text, file).length, 2);
});

test('Liste mit Inline-Funktion und lokal deklariertem Teil', () => {
  const text = `function local(ctx) { return { get a() { return 1; }, b() {} }; }
export default createModule({ view: [local, (ctx) => ({ c: 1, computed: { d() { return 2; } } }), function (ctx) { return { e() {} }; }] });
`;
  assert.deepEqual(viewNamesDetailOf(text), { getters: ['a'], computed: ['d'], data: ['c'] });
  assert.deepEqual([...viewMemberNamesOf(text)].sort(), ['a', 'b', 'c', 'computed', 'd', 'e']);
});

test('Liste mit Typumwandlung um die Inline-Funktion', () => {
  const text = `export default createModule({ view: [/** @type {any} */ ((ctx) => ({ f: 1 }))] });`;
  assert.deepEqual(viewNamesDetailOf(text), { getters: [], computed: [], data: ['f'] });
});

test('importierter Teil ohne Dateipfad bleibt ungelesen, die übrigen zählen', () => {
  assert.deepEqual(viewNamesDetailOf(VM), { getters: [], computed: [], data: [] });
});

test('Einzelfunktion wie bisher', () => {
  const text = 'export default createModule({ view(ctx) { return { get g() { return 1; }, d: 2 }; } });';
  assert.deepEqual(viewNamesDetailOf(text), { getters: ['g'], computed: [], data: ['d'] });
  assert.equal(viewPartNodes(text).length, 1);
});

test('unresolvedViewParts: nicht auflösbare Teile werden benannt', () => {
  const root = appWith({ 'm/viewmodel/problem.js': PROBLEM });
  const file = join(root, 'm/viewmodel/viewmodel.js');
  const list = `import { problemView } from './problem.js';
import { missingView } from './missing.js';
export default createModule({ view: [problemView, (ctx) => ({ a: 1 }), missingView, ghost] });
`;
  assert.deepEqual(unresolvedViewParts(list, file), ['view[2]', 'view[3]']);
  assert.deepEqual(unresolvedViewParts('export default createModule({ view: ghost });', file), ['view']);
  assert.deepEqual(unresolvedViewParts(VM.replace(', causes', ''), file), []);
  assert.deepEqual(unresolvedViewParts('export default createModule({ view(ctx) { return {}; } });'), []);
});
