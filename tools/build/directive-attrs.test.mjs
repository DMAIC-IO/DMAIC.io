/**
 * Directive guard: every `data-*` attribute a core directive reads or writes
 * carries the directive's name as prefix (`x-file-drop` → `data-file-drop-*`),
 * so the markup shows who owns an attribute. Shared on purpose across
 * directives: `data-arg-*`, `data-default-arg-*`, `data-help-key`,
 * `data-ref`, `data-id`. Also checked as `dataset.<name>`.
 * The gesture core has its own guard (interaction-attrs.test.mjs).
 * Limit: names built at runtime (`data-${name}`, `dataset[key]`) are
 * reported as findings, not resolved — write attribute names out literally.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CORE = join(dirname(fileURLToPath(import.meta.url)), '../../js/core');

/** Directive file → prefixes of the directives it implements. */
export const PREFIXES = {
  'async-task-directives.js': ['async-task'],
  'command-directives.js': ['command', 'command-form', 'param', 'dialog'],
  'file-drop-directive.js': ['file-drop'],
  'field-directive.js': ['field', 'set'],
  'tablist.js': ['tablist'],
  'widget-directive.js': ['widget'],
  'choice-group.js': ['param'],
  'param-input.js': ['param'],
  'router/route-store.js': ['route'],
};

const SHARED = ['arg', 'default-arg', 'help-key', 'ref', 'id'];

/** @param {string} kebab @returns {string} */
const camel = (kebab) => kebab.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/**
 * Lists every attribute in `src` that neither carries one of the prefixes
 * nor is a shared exception.
 * @param {string} src
 * @param {string[]} prefixes
 * @returns {string[]}
 */
export function foreignAttrs(src, prefixes) {
  const kebab = [...prefixes, ...SHARED];
  const owned = (name) => kebab.some((p) => name === p || name.startsWith(`${p}-`));
  const ownedCamel = (name) => kebab.map(camel).some((p) => name === p || (name.startsWith(p) && /^[A-Z]/.test(name.slice(p.length))));
  const hits = [];
  for (const m of src.matchAll(/data-([a-z][a-z0-9-]*)/g)) if (!owned(m[1])) hits.push(`data-${m[1]}`);
  for (const m of src.matchAll(/dataset\.([A-Za-z][A-Za-z0-9]*)/g)) if (!ownedCamel(m[1])) hits.push(`dataset.${m[1]}`);
  for (const m of src.matchAll(/data-\$\{|dataset\[/g)) hits.push(m[0]);
  return hits;
}

test('a foreign data attribute is a finding, prefixed and shared ones are not', () => {
  assert.deepEqual(foreignAttrs("el.setAttribute('data-running', '')", ['async-task']), ['data-running']);
  assert.deepEqual(foreignAttrs('el.dataset.accept', ['file-drop']), ['dataset.accept']);
  assert.deepEqual(foreignAttrs("'data-file-drop-over'; el.dataset.fileDropAccept", ['file-drop']), []);
  assert.deepEqual(foreignAttrs("'data-arg-col'; 'data-default-arg-x'; 'data-help-key'; 'data-ref'; el.dataset.id", ['x']), []);
  assert.deepEqual(foreignAttrs('el.dataset.paramTitle; el.dataset.params', ['param']), ['dataset.params']);
  assert.deepEqual(foreignAttrs('el.getAttribute(`data-${name}`); el.dataset[key]', ['x']), ['data-${', 'dataset[']);
});

test('every file that registers an Alpine directive is listed in PREFIXES', () => {
  const files = readdirSync(CORE, { recursive: true })
    .map(String).filter((f) => f.endsWith('.js'))
    .filter((f) => readFileSync(join(CORE, f), 'utf8').includes('Alpine.directive('));
  assert.deepEqual(files.filter((f) => !Object.hasOwn(PREFIXES, f)).sort(), []);
});

test('core directives touch only prefixed and shared data attributes', () => {
  const hits = [];
  for (const [file, prefixes] of Object.entries(PREFIXES)) {
    for (const h of foreignAttrs(readFileSync(join(CORE, file), 'utf8'), prefixes)) hits.push(`${file}: ${h}`);
  }
  assert.deepEqual(hits, []);
});
