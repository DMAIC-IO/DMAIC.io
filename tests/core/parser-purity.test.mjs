import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const DIR = new URL('../../js/core/parser/', import.meta.url);

test('Parserdateien: keine Modulimporte, kein document/window', () => {
  const files = readdirSync(DIR).filter(f => f.endsWith('.js'));
  assert.ok(files.length >= 8);
  for (const f of files) {
    const src = readFileSync(new URL(f, DIR), 'utf8');
    assert.ok(!/from\s+['"][^'"]*\/modules\//.test(src), `${f} importiert aus modules/`);
    assert.ok(!/\b(document|window)\b/.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), `${f} nutzt document/window`);
  }
});
