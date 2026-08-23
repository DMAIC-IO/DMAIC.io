/**
 * icon-refs.mjs — sammelt alle Icon-Referenzen im Quellcode und prüft sie gegen
 * die Proxy-Tabelle.
 *
 * Ein Name ohne Map-Eintrag erzeugt zur Laufzeit eine leere Maske: ein Element
 * mit Platzbedarf und ohne Glyphe, das niemandem auffällt. Genau so blieben 38
 * Icons monatelang unsichtbar. Deshalb ist ein unbekannter Name ein Build-Fehler.
 */

/** icon('name') | icon("name") */
const CALL = /\bicon\(\s*['"]([a-z0-9.-]+)['"]/g;
/** icon: 'name' in Modul- und Aktions-Deskriptoren */
const FIELD = /\bicon:\s*['"]([a-z0-9.-]+)['"]/g;
/** data-icon="name" in Alpine-Templates */
const ATTR = /\bdata-icon="([a-z0-9.-]+)"/g;

/** Kommentare entfernen, damit Beispiele in JSDoc nicht als Referenz zählen. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length))
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * @param {Array<{path: string, text: string}>} files
 * @returns {Array<{name: string, path: string, line: number}>}
 */
export function collectIconRefs(files) {
  const out = [];
  const seen = new Set();
  for (const { path, text } of files) {
    const clean = stripComments(text);
    for (const re of [CALL, FIELD, ATTR]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(clean)) !== null) {
        const line = clean.slice(0, m.index).split('\n').length;
        const key = `${path}:${line}:${m[1]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ name: m[1], path, line });
      }
    }
  }
  return out;
}

/**
 * @param {Record<string,string>} map
 * @param {Array<{name: string, path: string, line: number}>} refs
 * @returns {Array<{name: string, path: string, line: number}>}
 */
export function findUnmappedRefs(map, refs) {
  return refs.filter((r) => !Object.prototype.hasOwnProperty.call(map, r.name));
}
