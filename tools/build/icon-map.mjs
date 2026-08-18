/**
 * icon-map.mjs — die Proxy-Tabelle zwischen semantischem Icon-Namen und Quelldatei.
 *
 * Der Anwendungscode kennt nur semantische Namen ("action.delete"). Welche Datei
 * dahinter liegt, steht ausschließlich in assets/icons/icon-map.json. Ein Icon
 * tauschen heißt: dort eine Zeile ändern.
 */
import { readFileSync } from 'node:fs';

const SOURCES = new Set(['lucide', 'own']);

/**
 * @param {string} spec  z. B. "lucide:trash-2"
 * @returns {{kind: 'lucide'|'own', file: string}}
 */
export function parseSpec(spec) {
  if (typeof spec !== 'string' || !spec.includes(':')) {
    throw new Error(`invalid icon spec ${JSON.stringify(spec)} — expected "<source>:<file>"`);
  }
  const idx = spec.indexOf(':');
  const kind = spec.slice(0, idx);
  const file = spec.slice(idx + 1);
  if (!SOURCES.has(kind)) {
    throw new Error(`unknown icon source "${kind}" in ${JSON.stringify(spec)} — expected lucide or own`);
  }
  if (!file) throw new Error(`empty icon file name in ${JSON.stringify(spec)}`);
  return { kind, file };
}

/**
 * @param {string} path  Pfad zu icon-map.json
 * @returns {Record<string,string>}
 */
export function loadIconMap(path) {
  const map = JSON.parse(readFileSync(path, 'utf8'));
  for (const [name, spec] of Object.entries(map)) {
    try {
      parseSpec(spec);
    } catch (err) {
      throw new Error(`icon-map.json: ${name}: ${err.message}`);
    }
  }
  return map;
}

/**
 * @param {Record<string,string>} map
 * @returns {string[]}  sortierte, deduplizierte Lucide-Dateinamen
 */
export function lucideNames(map) {
  const out = new Set();
  for (const spec of Object.values(map)) {
    const { kind, file } = parseSpec(spec);
    if (kind === 'lucide') out.add(file);
  }
  return [...out].sort();
}
