import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanSource, scanTree } from './xfor-keys.mjs';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('child key is reported', () => {
  const hits = scanSource('<template x-for="r in rows">\n  <div :key="r.id">x</div>\n</template>', 'a.html');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 1);
  assert.equal(hits[0].templateKey, null);
  assert.equal(hits[0].childKey, 'r.id');
});

test('template key is accepted', () => {
  const hits = scanSource('<template x-for="(r, i) in rows" :key="r.id"><div></div></template>', 'a.html');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].templateKey, 'r.id');
  assert.equal(hits[0].childKey, null);
});

test('x-bind:key spelling counts too', () => {
  const onChild = scanSource('<template x-for="r in rows"><li x-bind:key="r.id"></li></template>', 'a.html');
  assert.equal(onChild[0].childKey, 'r.id');
  const onTemplate = scanSource('<template x-for="r in rows" x-bind:key="r.id"><li></li></template>', 'a.html');
  assert.equal(onTemplate[0].templateKey, 'r.id');
  assert.equal(onTemplate[0].childKey, null);
});

test('nested loops are scanned independently', () => {
  const src = [
    '<template x-for="(row, i) in rows" :key="i">',
    '  <tr>',
    '    <template x-for="(cell, i) in row" :key="i">',
    '      <td x-text="cell"></td>',
    '    </template>',
    '  </tr>',
    '</template>',
  ].join('\n');
  const hits = scanSource(src, 'a.html');
  assert.equal(hits.length, 2);
  assert.deepEqual(hits.map((h) => h.line), [1, 3]);
  assert.deepEqual(hits.map((h) => h.childKey), [null, null]);
  assert.deepEqual(hits.map((h) => h.templateKey), ['i', 'i']);
});

test('a key on a grandchild is not a child key', () => {
  const hits = scanSource('<template x-for="r in rows"><div><span :key="r.id"></span></div></template>', 'a.html');
  assert.equal(hits[0].childKey, null);
});

test('editable key is flagged', () => {
  const byField = scanSource('<template x-for="r in rows" :key="r.name"><input x-model="r.name"></template>', 'a.html');
  assert.equal(byField[0].editableKey, true);
  const byIndex = scanSource('<template x-for="(r, i) in rows" :key="i"><input x-model="r.name"></template>', 'a.html');
  assert.equal(byIndex[0].editableKey, false);
});

test('editable key is flagged when the key still sits on the child', () => {
  const hits = scanSource('<template x-for="r in rows"><div :key="r.name"><input x-model.trim="r.name"></div></template>', 'a.html');
  assert.equal(hits[0].editableKey, true);
});

test('finds loops inside JS template strings', () => {
  const src = 'const a = 1;\nconst tpl = `\n  <ul>\n    <template x-for="it in items">\n      <li :key="it.id"></li>\n    </template>\n  </ul>`;\n';
  const hits = scanSource(src, 'a.js');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 4);
  assert.equal(hits[0].childKey, 'it.id');
});

test('skips chunks, vendor and generated files', () => {
  const root = mkdtempSync(join(tmpdir(), 'xfor-'));
  const loop = '<template x-for="r in rows"><div :key="r.id"></div></template>';
  for (const p of ['js/chunks/x.min.js', 'vendor/a.html', 'js/foo.generated.js', 'js/bar.min.js']) {
    const full = join(root, p);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, `const t = \`${loop}\`;`);
  }
  assert.deepEqual(scanTree(root), []);
});

test('scanTree reports paths relative to the app dir', () => {
  const root = mkdtempSync(join(tmpdir(), 'xfor-'));
  mkdirSync(join(root, 'js', 'm'), { recursive: true });
  writeFileSync(join(root, 'js', 'm', 'm.html'), '<template x-for="r in rows"><div :key="r.id"></div></template>');
  const hits = scanTree(root);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].file, 'js/m/m.html');
});

const list = (hits) => hits.map((h) => `${h.file}:${h.line}`).join('\n');

test('the app has no x-for keys on child elements', { todo: 'Task 3' }, () => {
  const hits = scanTree(appDir).filter((e) => e.childKey);
  assert.deepEqual(hits, [], `x-for keys on child elements — move them onto the <template>:\n${list(hits)}`);
});

test('no x-for key is built from a field edited in the loop', { todo: 'Task 3' }, () => {
  const hits = scanTree(appDir).filter((e) => e.editableKey);
  assert.deepEqual(hits, [], `x-for keys edited via x-model inside the loop (key rule 3):\n${list(hits)}`);
});
