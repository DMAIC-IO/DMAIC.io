/**
 * D.Mike — Exporte aus Mappern nach Datenform (exporter.js)
 *
 * Ein Modul nennt keine Formate, sondern Mapper: `table()` (Zeilen),
 * `tables()` (Blätter), `tree()` (JSON-Wert), `image()` (SVG-Text), `document()` (HTML-Text). Hier
 * entstehen daraus die Dateien — Trenner, BOM und Meldungen sind damit
 * überall gleich.
 *
 * Die Serialisierer sind rein (in Node testbar). `runExport` baut die Datei
 * und meldet; es wirft nie.
 */

import { formatNumber } from './number-format.js';
import { downloadFile, downloadBlob, ensureXLSX, svgStringToPngBlob } from './export-utils.js';

/** Alle Formate in Menüreihenfolge. */
export const EXPORT_FORMATS = Object.freeze(['xlsx', 'csv', 'json', 'png', 'svg', 'html']);

/** Welche Mapper ein Format speisen (der erste vorhandene gewinnt). */
const SOURCES = Object.freeze({
  xlsx: ['tables', 'table'],
  csv: ['table'],
  json: ['tree'],
  png: ['image'],
  svg: ['image'],
  html: ['document'],
});

/**
 * Die Formate, für die `exportsDef` einen Mapper hat, in Menüreihenfolge.
 * @param {Record<string, unknown>} exportsDef
 * @returns {string[]}
 */
export function formatsOf(exportsDef) {
  return EXPORT_FORMATS.filter((fmt) => SOURCES[fmt].some((k) => typeof exportsDef[k] === 'function'));
}

/** @param {unknown} v @returns {string} */
const csvText = (v) => `"${(v === null || v === undefined ? '' : String(v)).replace(/"/g, '""')}"`;

/**
 * CSV-Text: `sep=;`-Zeile, Texte in Anführungszeichen, Zahlen ohne und im
 * Eingabeprofil mit dem Dezimalzeichen der App-Sprache, Trenner `;`,
 * `\n` auch nach der letzten Zeile.
 * @param {(string|number|null|undefined)[][]} rows erste Zeile = Kopf
 * @param {string} [lang] App-Sprache (`de` | `en`)
 * @returns {string}
 */
export function toCsvText(rows, lang = 'en') {
  const cell = (v) => (typeof v === 'number' ? formatNumber(v, lang, { profile: 'input' }) : csvText(v));
  return `sep=;\n${rows.map((row) => row.map(cell).join(';')).join('\n')}\n`;
}

/**
 * JSON-Text mit zwei Leerzeichen Einzug.
 * @param {unknown} value
 * @returns {string}
 */
export function toJsonText(value) {
  return JSON.stringify(value, null, 2);
}

/**
 * Ein gültiger Blattname: ohne `[]:*?/\`, höchstens 31 Zeichen, nie leer.
 * @param {string} text
 * @returns {string}
 */
export function sheetName(text) {
  return String(text).replace(/[[\]:*?/\\]/g, '').slice(0, 31) || 'Sheet1';
}

/** Öffnendes `<svg …>`-Tag. */
const SVG_OPEN = /<svg\b[^>]*>/;

/**
 * `width`/`height` am Wurzelelement eines SVG-Texts.
 * @param {string} svg
 * @returns {{ width: number, height: number }}
 * @throws {Error} wenn eines fehlt
 */
export function svgSize(svg) {
  const open = SVG_OPEN.exec(svg)?.[0] ?? '';
  const read = (name) => Number(new RegExp(`\\s${name}="([\\d.]+)(?:px)?"`).exec(open)?.[1]);
  const width = read('width');
  const height = read('height');
  if (!(width > 0) || !(height > 0)) throw new Error('svg: width and height required on the root element');
  return { width, height };
}

/**
 * CSS als `<defs><style>` direkt hinter das öffnende `<svg>` legen.
 * @param {string} svg
 * @param {string} css
 * @returns {string}
 */
export function withStyle(svg, css) {
  const m = SVG_OPEN.exec(svg);
  if (!m) throw new Error('svg: no root element');
  const at = m.index + m[0].length;
  return `${svg.slice(0, at)}<defs><style>${css}</style></defs>${svg.slice(at)}`;
}

/** Name des Formats in den Meldungen. */
const LABELS = Object.freeze({ csv: 'CSV', json: 'JSON', xlsx: 'Excel', png: 'PNG', svg: 'SVG', html: 'HTML' });

/** App-Schriften, die ein SVG in `<img>` sonst nicht sieht. */
const FONTS = Object.freeze([
  ['DM Sans', 'assets/fonts/dmsans-latin.woff2'],
  ['JetBrains Mono', 'assets/fonts/jetbrainsmono-latin.woff2'],
]);

/** @type {Promise<string>|null} */
let fontCss = null;

/** @param {ArrayBuffer} buf @returns {string} */
function base64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * `@font-face`-Regeln für DM Sans und JetBrains Mono mit Daten-URL, einmal
 * geladen. Schlägt das Laden fehl, `''` (dann ohne Schriften rastern) und
 * beim nächsten Mal neu versuchen.
 * @returns {Promise<string>}
 */
export function fontFaces() {
  fontCss ??= Promise.all(FONTS.map(async ([family, url]) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return `@font-face{font-family:"${family}";src:url(data:font/woff2;base64,${base64(await res.arrayBuffer())}) format("woff2")}`;
  })).then((rules) => rules.join(''), (err) => {
    console.warn('[export] fonts not embedded', err);
    fontCss = null;
    return '';
  });
  return fontCss;
}

/** @typedef {{ downloadFile: Function, downloadBlob: Function, ensureXLSX: Function, svgStringToPngBlob: Function, fontFaces: () => Promise<string> }} ExportIo */

/** @type {ExportIo} */
const DEFAULT_IO = { downloadFile, downloadBlob, ensureXLSX, svgStringToPngBlob, fontFaces };

/**
 * Eine Datei aus den Mappern eines Moduls bauen und herunterladen. Wirft
 * nie: Erfolg und Fehler gehen per `ui.notify`. Liefert `table()`, `tree()`
 * oder `image()` `null`, gibt es nichts zu exportieren: keine Datei, keine
 * Meldung.
 * @param {{ exports: Record<string, any>, component: object, moduleId: string,
 *   i18n: { t: (key: string, params?: object) => string, getLanguage: () => string },
 *   notify: (message: string, type?: string, titleKey?: string) => void }} ui
 * @param {string} fmt `xlsx`, `csv`, `json`, `png`, `svg` oder `html`
 * @param {ExportIo} [io] Ein-/Ausgabe (Tests)
 * @returns {Promise<void>}
 */
export async function runExport(ui, fmt, io = DEFAULT_IO) {
  const label = LABELS[fmt] ?? fmt;
  try {
    const { exports: def, component, moduleId, i18n } = ui;
    const call = (key) => def[key].call(component);
    const base = typeof def.fileName === 'function' ? def.fileName.call(component) : (def.fileName ?? moduleId);
    const name = `${base}.${fmt}`;
    if (fmt === 'csv') {
      const rows = await call('table');
      if (rows === null) return; // nichts zu exportieren: keine Datei, keine Meldung
      io.downloadFile(toCsvText(rows, i18n.getLanguage()), name, 'text/csv;charset=utf-8');
    } else if (fmt === 'json') {
      const tree = await call('tree');
      if (tree === null) return;
      if (tree === undefined) throw new Error('tree() returned undefined');
      io.downloadBlob(new Blob([toJsonText(tree)], { type: 'application/json' }), name);
    } else if (fmt === 'xlsx') {
      let sheets;
      if (typeof def.tables === 'function') {
        sheets = await call('tables');
      } else {
        const rows = await call('table');
        if (rows === null) return;
        sheets = { [i18n.t(`modules.${moduleId}.name`)]: rows };
      }
      let XLSX;
      try { XLSX = await io.ensureXLSX(); } catch { return; } // Ladefehler hat core/chunks.js schon gemeldet
      const wb = XLSX.utils.book_new();
      for (const [sheet, rows] of Object.entries(sheets)) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName(sheet));
      }
      XLSX.writeFile(wb, name);
    } else if (fmt === 'svg') {
      const svg = await call('image');
      if (svg == null) return; // nichts zu zeichnen: keine Datei, keine Meldung
      io.downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), name);
    } else if (fmt === 'html') {
      const text = await call('document');
      if (typeof text !== 'string') throw new Error('document() did not return text');
      io.downloadBlob(new Blob([text], { type: 'text/html;charset=utf-8' }), name);
    } else if (fmt === 'png') {
      const svg = await call('image');
      if (svg == null) return;
      const size = svgSize(svg);
      const css = await io.fontFaces();
      io.downloadBlob(await io.svgStringToPngBlob(css ? withStyle(svg, css) : svg, { ...size, scale: 2 }), name);
    } else {
      throw new Error(`unknown export format ${fmt}`);
    }
    ui.notify(label, 'success', 'status.ok');
  } catch (err) {
    console.error(`[export] ${fmt} failed`, err);
    ui.notify(ui.i18n.t('export.failed', { format: label }), 'error');
  }
}
