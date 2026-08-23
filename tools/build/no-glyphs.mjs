/**
 * no-glyphs.mjs — findet Icons, die nicht aus dem Icon-System kommen.
 *
 * Reine Textfunktionen ohne Dateizugriff: welche Dateien geprüft werden und
 * welche ausgenommen sind, entscheidet der Aufrufer (tools/build-icons.mjs).
 * Genau wie icon-refs.mjs.
 */

/**
 * Zeichen, die in dieser App als Icon aufgetreten sind. Bewusst eine
 * Aufzählung und kein Unicode-Bereich: Gedankenstrich (—), Auslassungspunkte
 * (…), Anführungszeichen und jeder Umlaut sind Typografie und dürfen nie
 * anschlagen.
 *
 * Die zweite Zeile kam beim Härten des Gates dazu (Abschluss-Review
 * 2026-08-22, §2.1/§2.2): Zeichen, die der Review nur durch manuelles Lesen
 * fand, weil der damalige Zeichensatz sie nicht abdeckte — Chevrons,
 * Warnzeichen, Rotationspfeile, das Punktraster-Grabbel-Handle, Sonne/Mond
 * im Theme-Switch, Stern im TRIZ-Diagramm. Ohne sie wäre die neue Baseline
 * unvollständig, obwohl die Scan-Fläche jetzt stimmt.
 */
export const ICON_GLYPHS = [
  '←', '→', '↑', '↓', '✕', '✎', '✓', '◆', '●', '▲', '▸', '↗', '○', '◔', '◑', '⊞', '⊟', '☰', '⇆', '▶', '⚙', '⏱', '⚖',
  '▼', '▾', '⇅', '⬇', '↕', '↻', '↺', '★', '✨', '☀', '⠿', '⚠', '✗', '✔',
];

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
 * Ein Zeichenketten-Inhalt ist ein Fund, wenn er irgendwo eine
 * positionsunabhängige Glyphe trägt, oder — erst nach dem Trimmen — am
 * Rand ein Richtungszeichen. Das Trimmen ist der I-4-Fix: ohne es hebelt
 * ein einzelnes Leerzeichen vor/nach dem Pfeil die Randregel aus.
 *
 * Gibt die gefundene Glyphe selbst zurück (für die Baseline-Zeile
 * `datei:zeile:glyphe`), oder `null`.
 *
 * @param {string} content  roher (noch nicht getrimmter) Zeichenketten-Inhalt
 * @returns {string|null}
 */
function matchGlyph(content) {
  const any = content.match(NON_POSITIONAL_RE);
  if (any) return any[0];
  const edge = content.trim().match(POSITIONAL_EDGE_RE);
  return edge ? edge[0] : null;
}

/** \uXXXX (JS) und \u{X…} dekodieren, bevor auf Glyphen geprüft wird — sonst
 * entzieht sich eine in Escape-Notation geschriebene Glyphe dem Scan (I-3,
 * hier die JS-Spiegelung: `lessons-learned.js:121` schreibt `'▾'`). */
function decodeJsEscapes(str) {
  return str
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/** \XXXX (CSS) dekodieren — siehe decodeJsEscapes, dieselbe Lücke auf der
 * CSS-Seite (I-3): `content:'\25B8'` zeichnet dieselbe Glyphe wie
 * `content:'▸'`, nur anders geschrieben. */
function decodeCssEscapes(str) {
  return str.replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
}

/**
 * Kommentare aus JS entfernen, bevor Zeichenketten gesucht werden — ein
 * deutscher Kommentar, der erklärt, warum eine Glyphe entfernt wurde, darf
 * selbst kein Fund werden. Dieselbe Technik wie `icon-refs.mjs`
 * (`stripComments`): Block- und Zeilenkommentare werden auf Leerzeichen
 * abgebildet, damit Zeilennummern erhalten bleiben. `//` in einer URL
 * (`https://…`) bleibt verschont, weil ihm kein Zeilenanfang/Nicht-`:`
 * vorausgeht.
 *
 * Grenze, bewusst in Kauf genommen: ein `//` oder `/*` INNERHALB eines
 * Stringliterals (z. B. ein Pfad in Anführungszeichen) wird fälschlich als
 * Kommentarbeginn gelesen. Ein vollständiger Tokenizer würde das vermeiden,
 * aber im Baum kommen keine Icon-Glyphen in Strings vor, die `//` oder `/*`
 * enthalten — die Pragmatik kostet hier nichts.
 */
function stripJsComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

/** JS-Stringliterale ('…', "…", `…`) einer (kommentarbereinigten) Zeile. */
const JS_STRING_RE = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;

/**
 * @param {string} text  Inhalt einer JS-Datei
 * @returns {{line: number, text: string}[]}
 *
 * Prüft Stringliterale außerhalb von Kommentaren. Zusammengesetzte Glyphen
 * (`String.fromCharCode(0x2715)`, Konkatenation, Laufzeitdaten) sieht kein
 * Quelltext-Scanner — das ist die Grenze statischer Analyse, nicht eine
 * Lücke dieses Scanners (siehe Abschluss-Review §2.2, Stufe 2/3).
 */
export function findGlyphsInJs(text) {
  const clean = stripJsComments(text);
  const out = [];
  clean.split('\n').forEach((line, i) => {
    JS_STRING_RE.lastIndex = 0;
    let m;
    let glyph = null;
    while ((m = JS_STRING_RE.exec(line)) !== null) {
      const raw = m[1] ?? m[2] ?? m[3];
      glyph = matchGlyph(decodeJsEscapes(raw));
      if (glyph) break;
    }
    if (glyph) out.push({ line: i + 1, text: line.trim().slice(0, 90), glyph });
  });
  return out;
}

/**
 * HTML-Kommentare entfernen (Zeilenumbrüche erhalten), damit ein
 * auskommentiertes Beispiel-Icon kein Fund wird.
 */
function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
}

/** Attribute, deren Wert den Nutzer erreicht (Tooltip, Screenreader-Name,
 * Platzhaltertext) — nicht `class`, `data-*`, `id`, `x-*` & Co. */
const USER_ATTR_RE = /\b(?:title|aria-label|alt|placeholder)\s*=\s*"([^"]*)"/gu;

/**
 * @param {string} text  Inhalt einer HTML-Datei
 * @returns {{line: number, text: string}[]}
 *
 * Prüft Textknoten (Inhalt zwischen `>` und `<`) und die oben genannten
 * nutzerseitig sichtbaren Attributwerte. Pragmatisch zeilenbasiert wie
 * `findGlyphs`/`findPseudoGlyphs` statt mit einem HTML-Parser: Elemente in
 * dieser Codebase stehen mit ihrem Inhalt auf einer Zeile (siehe die
 * Fundstellen im Abschluss-Review, alle mit einer einzelnen Zeilennummer
 * zitiert). `x-text="glyphX()"` enthält selbst keine Glyphe — der
 * Funktionsaufruf wird über den JS-Scan gefunden, nicht hier.
 */
export function findGlyphsInHtml(text) {
  const clean = stripHtmlComments(text);
  const out = [];
  clean.split('\n').forEach((line, i) => {
    const textOnly = line.replace(/<[^>]*>/g, ' ');
    const segments = [textOnly];
    USER_ATTR_RE.lastIndex = 0;
    let m;
    while ((m = USER_ATTR_RE.exec(line)) !== null) segments.push(m[1]);
    let glyph = null;
    for (const seg of segments) { glyph = matchGlyph(seg); if (glyph) break; }
    if (glyph) out.push({ line: i + 1, text: line.trim().slice(0, 90), glyph });
  });
  return out;
}

/**
 * @param {string} text  Inhalt einer HTML-Datei
 * @returns {{line: number, text: string}[]}  die beanstandeten <svg>-Anfänge
 *
 * Zwei strukturelle Ausnahmen, beide eng gefasst — ein Attribut allein darf
 * ein gezeichnetes Icon nicht durchwinken:
 *  - `data-ref="…"` ist nur ausgenommen, wenn das Element LEER ist (ein vom
 *    Chart-Framework verwalteter Mount-Punkt, noch ohne Inhalt gerendert).
 *    Zeichnet das Element trotz `data-ref` selbst Pfade, ist es ein Fund.
 *  - `<defs>` ist nur ausgenommen, wenn außer dem `<defs>`-Block NICHTS im
 *    Element steht (reine Marker-/Gradienten-Definition ohne eigenen
 *    Zeicheninhalt). Steht daneben ein `<path>`, `<circle>` o. Ä., ist es ein
 *    Fund — genau wie das legitime triz-sufield-Diagramm, das neben seiner
 *    Pfeilspitzen-`<defs>` selbst Linien und Knoten zeichnet und deshalb
 *    namentlich in `GLYPH_EXEMPT` steht statt strukturell durchzurutschen.
 */
export function findInlineSvg(text) {
  const out = [];
  for (const m of text.matchAll(/(<svg\b[^>]*>)(.*?)<\/svg>/gsu)) {
    const [full, openTag, body] = m;
    if (/\bdata-ref=/.test(openTag) && body.trim() === '') continue;
    const withoutDefs = body.replace(/<defs\b[\s\S]*?<\/defs>/gu, '');
    if (/<defs\b/.test(body) && withoutDefs.trim() === '') continue;
    const line = text.slice(0, m.index).split('\n').length;
    out.push({ line, text: full.slice(0, 60) });
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
    let glyph = null;
    const any = line.match(NON_POSITIONAL_RE);
    if (any) {
      glyph = any[0];
    } else {
      STRING_LITERAL_RE.lastIndex = 0;
      let m;
      while ((m = STRING_LITERAL_RE.exec(line)) !== null) {
        const edge = m[1].trim().match(POSITIONAL_EDGE_RE);
        if (edge) { glyph = edge[0]; break; }
      }
    }
    if (glyph) out.push({ line: i + 1, text: line.trim().slice(0, 90), glyph });
  });
  return out;
}

/** Eine `content:`-Deklaration bis zum Anweisungsende (`;`/`}`) — der Wert
 * kann mehrere Anführungsblöcke tragen (`content: "a" "▸";`), deshalb wird
 * hier nur der Wertebereich abgegrenzt und im zweiten Schritt jeder
 * Anführungsblock einzeln gelesen (I-3/I-4 des Abschluss-Reviews). */
const CONTENT_DECL_RE = /content\s*:\s*([^;}]+)/gu;
const QUOTED_BLOCK_RE = /(['"])((?:[^\\]|\\.)*?)\1/gu;

/**
 * @param {string} text  Inhalt einer CSS-Datei
 * @returns {{line: number, text: string}[]}
 *
 * Global gematcht: eine minifizierte Zeile trägt beliebig viele
 * `content:`-Deklarationen, nicht nur die erste. Jede Deklaration wird auf
 * ALLE ihre Anführungsblöcke geprüft (nicht nur den ersten), und CSS-Escapes
 * (`\XXXX`) werden vor dem Glyphentest dekodiert.
 */
export function findPseudoGlyphs(text) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    CONTENT_DECL_RE.lastIndex = 0;
    let m;
    while ((m = CONTENT_DECL_RE.exec(line)) !== null) {
      QUOTED_BLOCK_RE.lastIndex = 0;
      let q;
      let glyph = null;
      while ((q = QUOTED_BLOCK_RE.exec(m[1])) !== null) {
        const found = decodeCssEscapes(q[2]).match(GLYPH_RE);
        if (found) { glyph = found[0]; break; }
      }
      if (glyph) out.push({ line: i + 1, text: m[0].slice(0, 90), glyph });
    }
  });
  return out;
}
