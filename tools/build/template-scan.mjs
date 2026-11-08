/**
 * D.Mike — gemeinsame Bausteine der statischen Gates (template-scan.mjs)
 *
 * Tag-Regex, kebab→camel, Schlüssel einer Objekteigenschaft, TypeScript-Parse
 * und das Ende eines Element-Rumpfs. Genutzt von module-gates.mjs und
 * async-task-gates.mjs; hängt von keinem der beiden ab.
 */
import ts from 'typescript';

/** Start-Tag mit Attributen (Anführungszeichen dürfen `>` enthalten). */
export const TAG = /<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

/** `data-arg-n-max` → `nMax`. @param {string} kebabName */
export const camel = (kebabName) => kebabName.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/** Schlüssel einer Objekteigenschaft (Bezeichner oder Zeichenkette), sonst `null`. */
export const keyOf = (p) => (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null);

/** @param {string} name @param {string} text @returns {ts.SourceFile} */
export function parseJs(name, text) {
  return ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
}

/** Elemente ohne Rumpf. */
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/**
 * Ende (exklusiv) des Rumpfs eines Elements, das bei `from` nach seinem Start-Tag beginnt
 * (gleichnamige Tags gezählt, Groß-/Kleinschreibung egal). Void- und selbstschließende
 * Elemente haben keinen Rumpf: Ergebnis ist `from`.
 * @param {string} html @param {number} from @param {string} tag @returns {number}
 */
export function bodyEnd(html, from, tag) {
  if (VOID_TAGS.has(tag.toLowerCase()) || (html[from - 1] === '>' && html[from - 2] === '/')) return from;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = from;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[0].endsWith('/>')) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return m.index;
  }
  return html.length;
}

/**
 * `x-for="<kopf> in <quelle>"`: Gruppe 1 der Kopf (`row` oder `(row, i)`), Gruppe 2 die Quelle.
 * Einzige Definition für module-gates und widget-gates.
 */
export const X_FOR = /\bx-for\s*=\s*"\s*(\([^)"]*\)|[A-Za-z_$][\w$]*)\s+in\s+([^"]*?)\s*"/g;

/** Alle Bezeichner im Kopf einer Schleife (`(row, i)` → `row`, `i`). @param {string} head @returns {string[]} */
export const xForAliases = (head) => head.match(/[A-Za-z_$][\w$]*/g) ?? [];
