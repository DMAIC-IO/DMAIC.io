/**
 * Build-Gate Zahlformat: zählt je Datei die Anti-Muster der Zahlformatierung
 * (`toFixed(`, `parseFloat(`, `toLocaleString(`, `new Intl.NumberFormat`,
 * `type="number"`) und vergleicht sie mit der Baseline. Eine Datei darf ihre
 * Anzahl nur senken; neue Dateien müssen bei 0 stehen. Zeilen, die mit `//`
 * oder `*` beginnen, zählen nicht. `toLocaleString(` wird rein textuell
 * gezählt (Datumsverwendungen sind nicht unterscheidbar und stehen mit Grund
 * in der Baseline).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['js/modules', 'js/widgets', 'js/core'];
const EXCLUDED_FILE = 'js/core/number-format.js';
const PATTERNS = [/toFixed\(/g, /parseFloat\(/g, /toLocaleString\(/g, /new Intl\.NumberFormat/g, /type="number"/g];

function skip(rel, name) {
  if (rel === EXCLUDED_FILE) return true;
  if (/\.min\./.test(name) || /\.generated\.js$/.test(name)) return true;
  return false;
}

function walk(dir, appDir, out) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name === 'chunks' || e.name === 'vendor') continue;
      walk(join(dir, e.name), appDir, out);
    } else if (/\.(js|html)$/.test(e.name)) {
      const rel = relative(appDir, join(dir, e.name)).split('\\').join('/');
      if (!skip(rel, e.name)) out.push(rel);
    }
  }
}

/**
 * Treffer je Datei zählen.
 * @param {string} appDir Wurzel von app/dev
 * @returns {Map<string, number>} nur Dateien mit mindestens einem Treffer
 */
export function countNumberFormatHits(appDir) {
  const files = [];
  for (const r of ROOTS) if (existsSync(join(appDir, r))) walk(join(appDir, r), appDir, files);
  files.sort();
  const hits = new Map();
  for (const rel of files) {
    let n = 0;
    for (const line of readFileSync(join(appDir, rel), 'utf8').split('\n')) {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*')) continue;
      for (const p of PATTERNS) n += (line.match(p) || []).length;
    }
    if (n > 0) hits.set(rel, n);
  }
  return hits;
}

/**
 * Treffer gegen die Baseline prüfen.
 * @param {Map<string, number>} hits
 * @param {Record<string, {count: number, reason?: string}>} baseline
 * @param {readonly string[]} convertedModules
 * @returns {{errors: string[]}}
 */
export function checkNumberFormat(hits, baseline, convertedModules) {
  const errors = [];
  for (const [file, n] of hits) {
    const entry = baseline[file];
    if (!entry) errors.push(`${file}: ${n} Treffer, aber kein Baseline-Eintrag (neue Dateien müssen bei 0 stehen)`);
    else if (n > entry.count) errors.push(`${file}: ${n} Treffer über Baseline ${entry.count}`);
  }
  for (const [file, entry] of Object.entries(baseline)) {
    const m = /^js\/modules\/([^/]+)\//.exec(file);
    if (m && convertedModules.includes(m[1]) && !entry.reason) {
      errors.push(`${file}: Eintrag eines umgestellten Moduls braucht eine reason`);
    }
  }
  return { errors };
}
