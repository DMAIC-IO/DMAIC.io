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

/** Ende (exklusiv) des Rumpfs eines Elements, das bei `from` nach seinem Start-Tag beginnt (gleichnamige Tags gezählt). */
export function bodyEnd(html, from, tag) {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
  re.lastIndex = from;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return m.index;
  }
  return html.length;
}
