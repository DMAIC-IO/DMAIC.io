/**
 * no-glyphs.mjs — findet Icons, die nicht aus dem Icon-System kommen.
 *
 * Reine Textfunktionen ohne Dateizugriff: welche Dateien geprüft werden und
 * welche ausgenommen sind, entscheidet der Aufrufer (tools/build-icons.mjs).
 * Genau wie icon-refs.mjs.
 */

/**
 * Zeichen, die in dieser App als Icon aufgetreten sind. Bewusst eine
 * Aufzählung und kein Unicode-Bereich: „—", „…", „„"" und jeder Umlaut sind
 * Typografie und dürfen nie anschlagen.
 */
export const ICON_GLYPHS = ['←', '→', '↑', '↓', '✕', '✎', '✓', '◆', '●', '▲', '▸', '↗', '○', '◔', '◑', '⊞', '⊟', '☰', '⇆', '▶', '⚙', '⏱', '⚖'];

/** Richtungszeichen, die in Fließtext bewusst erhalten bleiben (Menüpfade,
 * Satzpfeile wie "Temperatur → Ausbeute") und nur am Zeilenrand ein Fund sind. */
const POSITIONAL = new Set(['←', '→', '↑', '↓', '☰']);

const GLYPH_RE = new RegExp(`[${ICON_GLYPHS.join('')}]|[\\u{1F300}-\\u{1FAFF}]`, 'u');

/** Nur die positionsunabhängigen Glyphen — überall in einer Zeichenkette ein Fund. */
const NON_POSITIONAL_GLYPHS = ICON_GLYPHS.filter((g) => !POSITIONAL.has(g));
const NON_POSITIONAL_RE = new RegExp(`[${NON_POSITIONAL_GLYPHS.join('')}]|[\\u{1F300}-\\u{1FAFF}]`, 'u');
const POSITIONAL_CLASS = `[${[...POSITIONAL].join('')}]`;
/** JSON-/JS-Stringliterale einer Zeile, um Zeichenketten-Ränder von Satzzeichen zu unterscheiden. */
const STRING_LITERAL_RE = /"((?:[^"\\]|\\.)*)"/g;
const POSITIONAL_EDGE_RE = new RegExp(`^${POSITIONAL_CLASS}|${POSITIONAL_CLASS}$`, 'u');

/**
 * @param {string} text  Inhalt einer HTML-Datei
 * @returns {string[]}  die beanstandeten <svg>-Anfänge
 */
export function findInlineSvg(text) {
  const out = [];
  for (const m of text.matchAll(/<svg\b[^>]*>(.*?)<\/svg>/gsu)) {
    if (/\bdata-ref=/.test(m[0])) continue;
    if (/<defs\b/.test(m[1])) continue;
    out.push(m[0].slice(0, 60));
  }
  return out;
}

/**
 * @param {string} text  Inhalt einer JSON- oder JS-Datei
 * @returns {{line: number, text: string}[]}
 */
export function findGlyphs(text) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    let hit = NON_POSITIONAL_RE.test(line);
    if (!hit) {
      STRING_LITERAL_RE.lastIndex = 0;
      let m;
      while ((m = STRING_LITERAL_RE.exec(line)) !== null) {
        if (POSITIONAL_EDGE_RE.test(m[1])) { hit = true; break; }
      }
    }
    if (hit) out.push({ line: i + 1, text: line.trim().slice(0, 90) });
  });
  return out;
}

/**
 * @param {string} text  Inhalt einer CSS-Datei
 * @returns {{line: number, text: string}[]}
 */
export function findPseudoGlyphs(text) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    const m = line.match(/content\s*:\s*(['"])(.*?)\1/u);
    if (m && GLYPH_RE.test(m[2])) out.push({ line: i + 1, text: line.trim().slice(0, 90) });
  });
  return out;
}
