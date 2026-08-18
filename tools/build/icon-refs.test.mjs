import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectIconRefs, findUnmappedRefs } from './icon-refs.mjs';

test('collectIconRefs finds icon() calls', () => {
  const refs = collectIconRefs([{ path: 'a.js', text: "const el = icon('action.delete');" }]);
  assert.deepEqual(refs, [{ name: 'action.delete', path: 'a.js', line: 1 }]);
});

test('collectIconRefs finds icon: descriptor fields', () => {
  const refs = collectIconRefs([{ path: 'b.js', text: "export default {\n  icon: 'module.sipoc',\n};" }]);
  assert.deepEqual(refs, [{ name: 'module.sipoc', path: 'b.js', line: 2 }]);
});

test('collectIconRefs finds data-icon attributes in templates', () => {
  const refs = collectIconRefs([{ path: 'c.html', text: '<span class="icon" data-icon="action.add"></span>' }]);
  assert.deepEqual(refs, [{ name: 'action.add', path: 'c.html', line: 1 }]);
});

test('collectIconRefs ignores block comments', () => {
  const text = '/**\n * Beispiel: <span data-icon="name">, icon(\'placeholder\')\n */\nicon(\'action.add\');';
  const refs = collectIconRefs([{ path: 'd.js', text }]);
  assert.deepEqual(refs.map((r) => r.name), ['action.add']);
});

test('collectIconRefs ignores line comments', () => {
  const refs = collectIconRefs([{ path: 'e.js', text: "// icon('nope')\nicon('action.add');" }]);
  assert.deepEqual(refs.map((r) => r.name), ['action.add']);
});

test('collectIconRefs deduplicates the same name in the same file and line', () => {
  const refs = collectIconRefs([{ path: 'f.js', text: "icon('action.add'); icon('action.add');" }]);
  assert.equal(refs.length, 1);
});

test('findUnmappedRefs returns only names missing from the map', () => {
  const map = { 'action.add': 'lucide:plus' };
  const refs = [
    { name: 'action.add', path: 'a.js', line: 1 },
    { name: 'action.gone', path: 'a.js', line: 9 },
  ];
  assert.deepEqual(findUnmappedRefs(map, refs), [{ name: 'action.gone', path: 'a.js', line: 9 }]);
});
