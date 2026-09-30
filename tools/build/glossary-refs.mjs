/**
 * glossary-refs.mjs — collects every `{{term:<id>}}` reference in the help
 * sources and checks it against the glossary index.
 *
 * An unknown id renders as a dead link in the help panel and in the static
 * handbook. The Multi-Vari help shipped two of them (`varianzkomponente`,
 * `em-algorithmus`) that were only caught by hand, so an unknown id is a
 * test failure.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Same id grammar as the renderers (help-renderer, static-handbook inline.mjs). */
const TERM = /\{\{term:([a-z0-9-]+)(?:\|[^}]*)?\}\}/gi;

/** Strip JS comments so JSDoc examples like `{{term:slug|…}}` do not count. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

/**
 * @param {Array<{path: string, text: string}>} files
 * @returns {Array<{id: string, path: string, line: number}>}
 */
export function collectTermRefs(files) {
  const out = [];
  for (const { path, text } of files) {
    const clean = path.endsWith('.js') ? stripComments(text) : text;
    TERM.lastIndex = 0;
    let m;
    while ((m = TERM.exec(clean)) !== null) {
      out.push({ id: m[1], path, line: clean.slice(0, m.index).split('\n').length });
    }
  }
  return out;
}

/**
 * @param {Set<string>} ids  known glossary ids
 * @param {Array<{id: string, path: string, line: number}>} refs
 * @returns {Array<{id: string, path: string, line: number}>}
 */
export function findUnknownTerms(ids, refs) {
  return refs.filter((r) => !ids.has(r.id));
}

/**
 * Reads the help sources of the app: all JS below `js/` (module help, algorithm
 * lab, core help) and the glossary term files themselves.
 * @param {string} root  app root (the directory holding `js/` and `glossary/`)
 * @returns {Array<{path: string, text: string}>}
 */
export function readHelpSources(root) {
  const files = [];
  const walk = (dir, accept) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, accept); }
      else if (accept(e.name)) files.push({ path: relative(root, p), text: readFileSync(p, 'utf8') });
    }
  };
  walk(join(root, 'js'), (n) => n.endsWith('.js') && !n.includes('.generated.') && !n.includes('.min.'));
  walk(join(root, 'glossary', 'terms'), (n) => n.endsWith('.json'));
  return files;
}

/**
 * @param {string} root
 * @returns {Set<string>}
 */
export function readGlossaryIds(root) {
  const index = JSON.parse(readFileSync(join(root, 'glossary', 'index.json'), 'utf8'));
  return new Set(index.terms.map((t) => t.id));
}
