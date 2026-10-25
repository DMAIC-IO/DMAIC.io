#!/usr/bin/env node
/**
 * x-for key scanner.
 *
 * Alpine reads a loop key only from `:key` / `x-bind:key` on the element that
 * carries `x-for` (`storeKeyForXFor` in vendor/alpinejs/csp.js). A key on the
 * first child is ignored, and Alpine then reuses DOM nodes by position. This
 * scanner finds every `<template x-for>` in the app's HTML templates and JS
 * template strings and reports where its key sits.
 *
 * CLI: `node tools/build/xfor-keys.mjs [--json]` prints the work list.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const TAG_RE = /<(\/?)([a-zA-Z][\w-]*)((?:[^>"'`]|"[^"]*"|'[^']*')*)>/g;
const KEY_ATTR_RE = /(?:^|\s)(?::|x-bind:)key\s*=\s*(?:"([^"]*)"|'([^']*)')/;
const FOR_ATTR_RE = /(?:^|\s)x-for\s*=\s*(?:"([^"]*)"|'([^']*)')/;
const MODEL_ATTR_RE = /(?:^|\s)x-model(?:\.[\w-]+)*\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const SKIP_DIRS = new Set(['chunks', 'vendor', 'node_modules']);

/** Blank out HTML comments, keeping newlines so line numbers stay right. */
function stripComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '));
}

function attr(re, attrs) {
  const m = re.exec(attrs);
  return m ? (m[1] ?? m[2]).trim() : null;
}

/** Index variable of an x-for expression: `(item, i) in list` → `i`. */
function indexVar(forExpr) {
  const m = /^\s*\(\s*[^,()]+,\s*([\w$]+)/.exec(forExpr ?? '');
  return m ? m[1] : null;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when an x-model target in the loop body is part of the key expression. */
function isEditableKey(keyExpr, forExpr, body) {
  if (!keyExpr || keyExpr === indexVar(forExpr)) return false;
  for (const m of body.matchAll(MODEL_ATTR_RE)) {
    const target = (m[1] ?? m[2]).trim();
    if (!target) continue;
    if (new RegExp(`(^|[^\\w.$])${escapeRe(target)}(?![\\w$])`).test(keyExpr)) return true;
  }
  return false;
}

/**
 * Scan one source text for `<template x-for>` loops.
 * @param {string} text  HTML template or JS source
 * @param {string} file  path reported in the entries
 * @returns {Array<{file: string, line: number, templateKey: string|null,
 *   childKey: string|null, editableKey: boolean}>} one entry per loop, in source order
 */
export function scanSource(text, file) {
  const src = stripComments(text);
  const entries = [];
  const open = []; // stack of open <template> elements: { entry|null, bodyStart }
  let pending = null; // x-for entry still waiting for its first child
  for (const m of src.matchAll(TAG_RE)) {
    const [whole, closing, name, attrs] = m;
    const isTemplate = name.toLowerCase() === 'template';
    if (closing) {
      if (!isTemplate) continue;
      pending = null;
      const top = open.pop();
      if (top?.entry) {
        const { entry, forExpr } = top;
        const body = src.slice(top.bodyStart, m.index);
        entry.editableKey = isEditableKey(entry.templateKey ?? entry.childKey, forExpr, body);
      }
      continue;
    }
    if (pending) {
      pending.childKey = attr(KEY_ATTR_RE, attrs);
      pending = null;
    }
    if (!isTemplate) continue;
    const forExpr = attr(FOR_ATTR_RE, attrs);
    let entry = null;
    if (forExpr !== null) {
      entry = {
        file,
        line: src.slice(0, m.index).split('\n').length,
        templateKey: attr(KEY_ATTR_RE, attrs),
        childKey: null,
        editableKey: false,
      };
      entries.push(entry);
      pending = entry;
    }
    open.push({ entry, forExpr, bodyStart: m.index + whole.length });
  }
  return entries;
}

function walk(dir, out) {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, d.name);
    if (d.isDirectory()) {
      if (!SKIP_DIRS.has(d.name)) walk(full, out);
    } else if (/\.(html|js)$/.test(d.name) && !/\.(generated|min)\.js$/.test(d.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Scan `js/**` (HTML and JS) of an app dir, skipping chunks, vendor,
 * `*.generated.js` and `*.min.js`.
 * @param {string} appDir
 * @returns {ReturnType<typeof scanSource>} entries with paths relative to appDir
 */
export function scanTree(appDir) {
  const jsDir = join(appDir, 'js');
  let files;
  try {
    files = walk(jsDir, []);
  } catch {
    return [];
  }
  return files.sort().flatMap((f) =>
    scanSource(readFileSync(f, 'utf8'), relative(appDir, f).split(sep).join('/')));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const entries = scanTree(appDir);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(entries, null, 2));
  } else {
    for (const e of entries) {
      if (e.childKey) console.log(`${e.file}:${e.line}  child-key  ${e.childKey}`);
      if (e.editableKey) console.log(`${e.file}:${e.line}  editable-key  ${e.templateKey ?? e.childKey}`);
    }
    const child = entries.filter((e) => e.childKey).length;
    const editable = entries.filter((e) => e.editableKey).length;
    console.log(`${entries.length} loops, ${child} child keys, ${editable} editable keys`);
  }
}
