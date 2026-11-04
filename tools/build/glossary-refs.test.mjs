import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectTermRefs, findUnknownTerms, readHelpSources, readGlossaryIds } from './glossary-refs.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

test('collectTermRefs finds references with and without label', () => {
  const refs = collectTermRefs([{ path: 'a.js', text: "text: 'Streuung {{term:cp|Cp}} und {{term:varianz}}'" }]);
  assert.deepEqual(refs.map((r) => r.id), ['cp', 'varianz']);
});

test('collectTermRefs reports the line', () => {
  const refs = collectTermRefs([{ path: 'b.json', text: '{\n  "de": "{{term:voc|VoC}}"\n}' }]);
  assert.deepEqual(refs, [{ id: 'voc', path: 'b.json', line: 2 }]);
});

test('collectTermRefs ignores JS comments', () => {
  const text = '/**\n * Marker {{term:slug|Anzeige}}\n */\n// {{term:nope}}\nconst s = "{{term:cp}}";';
  assert.deepEqual(collectTermRefs([{ path: 'c.js', text }]).map((r) => r.id), ['cp']);
});

test('findUnknownTerms returns only ids missing from the glossary', () => {
  const refs = [
    { id: 'varianz', path: 'a.js', line: 1 },
    { id: 'varianzkomponente', path: 'a.js', line: 4 },
  ];
  assert.deepEqual(findUnknownTerms(new Set(['varianz']), refs),
    [{ id: 'varianzkomponente', path: 'a.js', line: 4 }]);
});

test('every {{term:…}} in the help sources resolves to a glossary entry', () => {
  const refs = collectTermRefs(readHelpSources(ROOT));
  assert.ok(refs.length > 1000, `expected the real help corpus, found only ${refs.length} references`);
  const unknown = findUnknownTerms(readGlossaryIds(ROOT), refs);
  assert.deepEqual(unknown.map((r) => `${r.path}:${r.line} ${r.id}`), []);
});

test('readHelpSources liest help.<lang>.json der Module in neuer Form', () => {
  const root = mkdtempSync(join(tmpdir(), 'glossary-refs-'));
  mkdirSync(join(root, 'glossary', 'terms'), { recursive: true });
  mkdirSync(join(root, 'js', 'modules', 'neu', 'resources', 'i18n'), { recursive: true });
  writeFileSync(join(root, 'js', 'modules', 'neu', 'resources', 'i18n', 'help.de.json'), '{"sections":{"a":{"title":"A","blocks":[{"type":"paragraph","content":"{{term:cp}}"}]}}}');
  writeFileSync(join(root, 'js', 'modules', 'neu', 'resources', 'i18n', 'ui.de.json'), '{"name":"{{term:nicht-hilfe}}"}');
  const refs = collectTermRefs(readHelpSources(root));
  assert.deepEqual(refs.map((r) => `${r.path} ${r.id}`), [`${join('js', 'modules', 'neu', 'resources', 'i18n', 'help.de.json')} cp`]);
});
