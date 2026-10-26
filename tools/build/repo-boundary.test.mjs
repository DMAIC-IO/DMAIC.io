// Grenztest: dieses Repo darf nie auf das Verzeichnis darüber zugreifen.
//
// Das App-Repo wird lokal oft unter einem größeren Baum ausgecheckt. Ein Pfad
// wie `../../docs/…` funktioniert dort zufällig, bricht aber in jedem
// eigenständigen Klon (CI, Release, Fremdnutzer). Der Test löst die statisch
// erkennbaren Pfade jeder getrackten Code-Datei gegen die Datei auf und meldet
// jeden, der außerhalb der Repo-Wurzel landet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBoundaryViolations, listCodeFiles } from './repo-boundary.mjs';

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Wirft einen Wegwerf-Baum `<tmp>/outer/app/…` auf und prüft `app` als Wurzel.
 * @param {Record<string, string>} files  Pfad relativ zu `app` → Inhalt
 */
function scan(files) {
  const base = mkdtempSync(join(tmpdir(), 'repo-boundary-'));
  const root = join(base, 'outer', 'app');
  try {
    for (const [path, body] of Object.entries(files)) {
      const full = join(root, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, body);
    }
    return findBoundaryViolations(root, { files: Object.keys(files) });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

/** Kurzform der Befunde für Vergleiche: `datei:zeile`. */
const where = (found) => found.map((f) => `${f.file}:${f.line}`);

test('der heutige Stand greift nicht über die Repo-Wurzel hinaus', () => {
  const files = listCodeFiles(APP_ROOT);
  assert.ok(files.length > 500, `zu wenige Code-Dateien gefunden (${files.length})`);
  const found = findBoundaryViolations(APP_ROOT, { files });
  assert.deepEqual(found.map((f) => `${f.file}:${f.line} ${f.reason} → ${f.target}`), []);
});

test('statische und dynamische Imports nach draußen', () => {
  const found = scan({
    'js/a.mjs': [
      "import x from '../../docs/x.js';",
      "export { y } from '../../../y.js';",
      "const z = await import('../../tools/z.mjs');",
      "import ok from '../core/ok.js';",
      "import fs from 'node:fs';",
    ].join('\n'),
  });
  assert.deepEqual(where(found), ['js/a.mjs:1', 'js/a.mjs:2', 'js/a.mjs:3']);
});

test('new URL(…, import.meta.url) nach draußen', () => {
  const found = scan({
    'js/lab/a.js': [
      "const inside = new URL('../../', import.meta.url);",
      "const outside = new URL('../../../docs/', import.meta.url);",
    ].join('\n'),
  });
  assert.deepEqual(where(found), ['js/lab/a.js:2']);
});

test('join/resolve mit Literal-Segmenten, auch über eine Wurzelvariable', () => {
  const found = scan({
    'tools/build/a.mjs': [
      "import { join, resolve, dirname } from 'node:path';",
      "import { fileURLToPath } from 'node:url';",
      "import { existsSync } from 'node:fs';",
      "const HERE = dirname(fileURLToPath(import.meta.url));",
      "const ROOT = join(HERE, '..', '..');",
      "const ok = join(ROOT, 'docs', 'x.md');",
      "const bad = existsSync(join(ROOT, '..', 'docs', 'x.md'));",
      "const bad2 = resolve(__dirname, '../../..', 'pipeline');",
      "const bad3 = join(import.meta.dirname, '..', '..', '..');",
      "const bad4 = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'test');",
      "const dyn = join(ROOT, name, '..');",
    ].join('\n'),
  });
  assert.deepEqual(where(found),
    ['tools/build/a.mjs:7', 'tools/build/a.mjs:8', 'tools/build/a.mjs:9', 'tools/build/a.mjs:10']);
});

test('Shell: $root/.. und $(dirname …)/../..', () => {
  const found = scan({
    'tools/hooks/pre-push': [
      '#!/usr/bin/env bash',
      'root="$(git rev-parse --show-toplevel)"',
      '# Kommentar: "$root/../docs" ist hier egal',
      'cat "$root/README.md"',
      'bash "$root/../tools/check.sh"',
      'here="$(dirname "$0")/../.."',
      'up="$(cd "$(dirname "$0")/../../.." && pwd)"',
    ].join('\n'),
    'x.sh': 'cd "${ROOT}/.." && ls\n',
  });
  assert.deepEqual(where(found), ['tools/hooks/pre-push:5', 'tools/hooks/pre-push:7', 'x.sh:1']);
});

test('Sperrmuster ../../(docs|tools|…)/ im Code, nicht in Kommentaren', () => {
  const found = scan({
    'tools/build/deep/a.mjs': [
      '// Hintergrund: ../../../../docs/superpowers/specs/x.md',
      '/* auch ../../../../tools/y.mjs */',
      "const p = '../../../../site-src/x.html';",
      "const q = '../../docs/inside.md';",
      "const url = 'https://example.com//x';",
    ].join('\n'),
  });
  assert.deepEqual(where(found), ['tools/build/deep/a.mjs:3']);
});

test('package.json-Scripts, Workflows und HTML', () => {
  const found = scan({
    'package.json': JSON.stringify({ scripts: {
      ok: 'node tools/x.mjs',
      bad: 'node ../tools/link-check/crawl.mjs',
    } }, null, 2),
    '.github/workflows/ci.yml': [
      'jobs:',
      '  # cd ../pipeline wäre falsch',
      '  run: bash ../pipeline/run.sh',
      '  log: git log "${A}..${B}"',
    ].join('\n'),
    'tests/runner.html': [
      '<link rel="stylesheet" href="../css/a.css">',
      '<!-- <script src="../../x.js"></script> -->',
      '<script type="module" src="../../docs/x.js"></script>',
    ].join('\n'),
  });
  assert.deepEqual(where(found),
    ['package.json:4', '.github/workflows/ci.yml:3', 'tests/runner.html:3']);
});
