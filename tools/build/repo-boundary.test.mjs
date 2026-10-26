// Grenztest: dieses Repo darf nie auf das Verzeichnis darüber zugreifen.
//
// Das App-Repo wird lokal oft unter einem größeren Baum ausgecheckt. Ein Pfad
// wie `../../docs/…` funktioniert dort zufällig, bricht aber in jedem
// eigenständigen Klon (CI, Release, Fremdnutzer). Der Test löst die statisch
// erkennbaren Pfade jeder getrackten Code-Datei gegen die Datei auf und meldet
// jeden, der außerhalb der Repo-Wurzel landet.
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findBoundaryViolations, findPrivateReferences, listCodeFiles, listTextFiles,
} from './repo-boundary.mjs';

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
  // Diese Datei selbst ausnehmen: ihre Fixtures enthalten die verbotenen Pfade als Strings.
  const files = listCodeFiles(APP_ROOT).filter((f) => f !== 'tools/build/repo-boundary.test.mjs');
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

// ── Verweise auf private Dokumente ─────────────────────────────────────────
//
// Das App-Repo ist öffentlich. Verweise auf Specs, Pläne, Roadmap, Bugliste,
// die privaten E2E-Tests oder die Site-Quellen des Begleit-Repos sind dort
// wertlos und verraten nur Interna. Geprüft wird jede getrackte Textdatei,
// Kommentare und Markdown eingeschlossen.

/** Ausgenommen: diese Testdatei (Fixtures) und die Prüfung selbst (Muster). */
const SELF = new Set(['tools/build/repo-boundary.test.mjs', 'tools/build/repo-boundary.mjs']);

/**
 * Wirft einen Wegwerf-Baum auf und sucht dort Verweise auf private Dokumente.
 * @param {Record<string, string>} files  Pfad relativ zur Wurzel → Inhalt
 */
function scanRefs(files) {
  const root = mkdtempSync(join(tmpdir(), 'private-refs-'));
  try {
    for (const [path, body] of Object.entries(files)) {
      const full = join(root, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, body);
    }
    return findPrivateReferences(root, { files: Object.keys(files) });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Kurzform: `datei:zeile muster`. */
const refs = (found) => found.map((f) => `${f.file}:${f.line} ${f.pattern}`);

test('der heutige Stand verweist nicht auf private Dokumente', () => {
  const files = listTextFiles(APP_ROOT).filter((f) => !SELF.has(f));
  assert.ok(files.length > 500, `zu wenige Textdateien gefunden (${files.length})`);
  assert.deepEqual(refs(findPrivateReferences(APP_ROOT, { files })), []);
});

test('private Pfade in Code, Kommentaren, CSS und Markdown', () => {
  const found = scanRefs({
    'js/a.js': [
      '/**',
      ' * Spec: docs/superpowers/specs/x-design.md (E2)',
      ' */',
      "const ok = 'docs/de/modules/sipoc.html';",
      '// siehe .claude/CLAUDE.md',
    ].join('\n'),
    'css/a.css': '/* Plan: docs/superpowers/plans/y.md */\n.a { color: red; }\n',
    'notes.md': [
      'Offenes steht in ROADMAP.md, Erledigtes in ROADMAP_DONE.md.',
      'Bugs: BUGS.md und BUGS_DONE.md',
      'E2E unter test/playwright/tests/, Seiten unter site-src/.',
      'Tests liegen in tests/unit/, nicht test/playwright.',
    ].join('\n'),
  });
  assert.deepEqual(refs(found), [
    'js/a.js:2 docs/superpowers',
    'js/a.js:5 .claude/',
    'css/a.css:1 docs/superpowers',
    'notes.md:1 ROADMAP.md',
    'notes.md:1 ROADMAP_DONE.md',
    'notes.md:2 BUGS.md',
    'notes.md:2 BUGS_DONE.md',
    'notes.md:3 test/playwright',
    'notes.md:3 site-src',
    'notes.md:4 test/playwright',
  ]);
});

test('docs/<NAME>.md nur, wenn die Datei im Repo fehlt', () => {
  const found = scanRefs({
    'docs/LOCAL.md': '# lokal\n',
    'js/b.js': [
      '// siehe docs/CHARTING.md',
      '// siehe docs/LOCAL.md',
      "const page = 'docs/en/index.html';",
    ].join('\n'),
  });
  assert.deepEqual(refs(found), ['js/b.js:1 docs/CHARTING.md']);
});

test('.gitignore darf /.claude/ ausschließen', () => {
  const found = scanRefs({
    '.gitignore': '/.claude/\nnode_modules/\n',
    'sub/.gitignore': 'x\n# lokale Notizen in .claude/notes\n',
  });
  assert.deepEqual(refs(found), ['sub/.gitignore:2 .claude/']);
});

test('Binärdateien und erzeugte Dateien bleiben außen vor', () => {
  const root = mkdtempSync(join(tmpdir(), 'private-refs-list-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    writeFileSync(join(root, 'a.js'), '// x\n');
    writeFileSync(join(root, 'b.generated.js'), '// docs/superpowers/specs/x.md\n');
    writeFileSync(join(root, 'c.png'), Buffer.from([0x89, 0x50, 0x00, 0x01]));
    execFileSync('git', ['add', '.'], { cwd: root });
    assert.deepEqual(listTextFiles(root), ['a.js']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
