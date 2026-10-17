/**
 * Abdeckungszahl „Beschriftungen mit Anker“ (Spec 2026-10-17 §4 0c).
 *
 * Zählt in den Vorlagen der freigegebenen Module jede sichtbare Beschriftung
 * — `<label>`, `.dmike-kpi-label`, `<th>` — und prüft, ob sie ein
 * Fragezeichen bekommt (`data-help-key` bzw. `:data-help-key` am Element
 * oder darin). Berichtend, kein Gate: `agent:report` gibt die Zeile aus.
 *
 * Statisch, also blind für Beschriftungen, die erst ein Baustein zur
 * Laufzeit erzeugt (`DatasetPicker`-Slots); die prüft der generische
 * Geometrietest in `context-help.spec.js`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ANCHOR_EXEMPTIONS } from './anchor-exemptions.mjs';

const HELP_ATTR = /(?:^|[\s:])data-help-key=/;
const PAIRED = [
  ['label', /<label\b([^>]*)>([\s\S]*?)<\/label>/g],
  ['th', /<th\b([^>]*)>([\s\S]*?)<\/th>/g],
];
const KPI = /<([a-z][\w-]*)\b([^>]*\bclass="[^"]*\bdmike-kpi-label\b[^"]*"[^>]*)>/g;

/** Hat das Element sichtbaren Text — wörtlich oder per `x-text`? */
function hasCaption(attrs, inner) {
  if (/\bx-text=/.test(attrs) || /\bx-text=/.test(inner)) return true;
  return inner.replace(/<[^>]*>/g, '').trim() !== '';
}

/** Der öffnende Tag, Leerraum zusammengezogen, höchstens 80 Zeichen. */
function snippetOf(tag) {
  const flat = tag.replace(/\s+/g, ' ');
  return flat.length > 80 ? `${flat.slice(0, 77)}…` : flat;
}

/**
 * Alle zählbaren Beschriftungen einer Vorlage, in der Reihenfolge Label, Kopfzelle, KPI.
 * @param {string} html
 * @returns {Array<{ kind: 'label'|'kpi'|'th', snippet: string, anchored: boolean }>}
 */
export function scanCaptions(html) {
  const out = [];
  for (const [kind, re] of PAIRED) {
    for (const m of html.matchAll(re)) {
      const [, attrs, inner] = m;
      if (!hasCaption(attrs, inner)) continue;
      out.push({ kind, snippet: snippetOf(`<${kind}${attrs}>`), anchored: HELP_ATTR.test(attrs) || HELP_ATTR.test(inner) });
    }
  }
  for (const m of html.matchAll(KPI)) {
    out.push({ kind: 'kpi', snippet: snippetOf(m[0]), anchored: HELP_ATTR.test(m[2]) });
  }
  return out;
}

/**
 * Beschriftungen mit Anker über alle freigegebenen Module.
 * @param {string} appDir  Wurzel von app/dev
 * @param {Record<string, { available?: boolean }>} modules  Registry-Einträge
 * @param {Record<string, Array<{ match: string, reason: string }>>} [exemptions]
 * @returns {{ total: number, covered: number, exempt: number, missing: string[], staleExemptions: string[] }}
 *   `covered` enthält die begründet ausgenommenen (`exempt`); `missing` je Lücke
 *   `<id>: <datei>: <tag>`; `staleExemptions` je Ausnahme ohne Treffer `<id>: <match>`.
 * @throws {Error} wenn eine Ausnahme keinen Grund nennt
 */
export function countAnchorCoverage(appDir, modules, exemptions = ANCHOR_EXEMPTIONS) {
  const out = { total: 0, covered: 0, exempt: 0, missing: [], staleExemptions: [] };
  for (const [id, entry] of Object.entries(modules)) {
    if (entry.available !== true) continue;
    const own = exemptions[id] ?? [];
    for (const e of own) {
      if (!e.reason?.trim()) throw new Error(`anchor-exemptions: ${id} „${e.match}“ ohne Grund`);
    }
    const used = new Set();
    const dir = join(appDir, 'js', 'modules', id);
    for (const file of readdirSync(dir).filter(f => f.endsWith('.html')).sort()) {
      for (const c of scanCaptions(readFileSync(join(dir, file), 'utf8'))) {
        out.total++;
        if (c.anchored) { out.covered++; continue; }
        const hit = own.find(e => c.snippet.includes(e.match));
        if (hit) { out.covered++; out.exempt++; used.add(hit); continue; }
        out.missing.push(`${id}: ${file}: ${c.snippet}`);
      }
    }
    for (const e of own) if (!used.has(e)) out.staleExemptions.push(`${id}: ${e.match}`);
  }
  return out;
}
