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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ANCHOR_EXEMPTIONS } from './anchor-exemptions.mjs';

const HELP_ATTR = /(?:^|[\s:])data-help-key=/;
const PAIRED = [
  ['label', /<label\b([^>]*)>([\s\S]*?)<\/label>/g],
  ['th', /<th\b([^>]*)>([\s\S]*?)<\/th>/g],
];
/** KPI-Beschriftung bis zu ihrem schließenden Tag (gleicher Tagname, nicht verschachtelt). */
const KPI = /<([a-z][\w-]*)\b([^>]*\bclass="[^"]*\bdmike-kpi-label\b[^"]*"[^>]*)>([\s\S]*?)<\/\1>/g;
const SNIPPET_MAX = 120;

/** Hat das Element sichtbaren Text — wörtlich oder per `x-text`? */
function hasCaption(attrs, inner) {
  if (/\bx-text=/.test(attrs) || /\bx-text=/.test(inner)) return true;
  return inner.replace(/<[^>]*>/g, '').trim() !== '';
}

/**
 * Das ganze Element samt Inhalt, Leerraum zusammengezogen, höchstens
 * `SNIPPET_MAX` Zeichen — so unterscheiden sich `<th>n</th>` und `<th>MW</th>`.
 */
function snippetOf(tag, attrs, inner) {
  const flat = `<${tag}${attrs}>${inner.trim()}</${tag}>`.replace(/\s+/g, ' ');
  return flat.length > SNIPPET_MAX ? `${flat.slice(0, SNIPPET_MAX - 1)}…` : flat;
}

/** 1-basierte Zeile eines Zeichenversatzes. */
function lineAt(html, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (html.charCodeAt(i) === 10) line++;
  return line;
}

/**
 * Alle zählbaren Beschriftungen einer Vorlage, in der Reihenfolge Label, Kopfzelle, KPI.
 * @param {string} html
 * @returns {Array<{ kind: 'label'|'kpi'|'th', snippet: string, line: number, anchored: boolean }>}
 *   `snippet` ist das Element mit Inhalt (zusammengezogen, gekappt), `line` die Zeile seines öffnenden Tags.
 */
export function scanCaptions(html) {
  const out = [];
  for (const [kind, re] of PAIRED) {
    for (const m of html.matchAll(re)) {
      const [, attrs, inner] = m;
      if (!hasCaption(attrs, inner)) continue;
      out.push({
        kind, snippet: snippetOf(kind, attrs, inner), line: lineAt(html, m.index),
        anchored: HELP_ATTR.test(attrs) || HELP_ATTR.test(inner),
      });
    }
  }
  for (const m of html.matchAll(KPI)) {
    const [, tag, attrs, inner] = m;
    out.push({
      kind: 'kpi', snippet: snippetOf(tag, attrs, inner), line: lineAt(html, m.index),
      anchored: HELP_ATTR.test(attrs) || HELP_ATTR.test(inner),
    });
  }
  return out;
}

/**
 * Beschriftungen mit Anker über alle freigegebenen Module.
 * @param {string} appDir  Wurzel von app/dev
 * @param {Record<string, { available?: boolean }>} modules  Registry-Einträge
 * @param {Record<string, Array<{ match: string, reason: string, count?: number }>>} [exemptions]
 * @returns {{ total: number, covered: number, exempt: number, missing: string[],
 *   staleExemptions: string[], exemptionCountMismatches: string[] }}
 *   `covered` enthält die begründet ausgenommenen (`exempt`); `missing` je Lücke
 *   `<id>: <datei>:<zeile>: <element>`; `staleExemptions` je Ausnahme ohne Treffer
 *   `<id>: <match>`; `exemptionCountMismatches` je Ausnahme, deren `count` nicht
 *   zur Trefferzahl passt, `<id>: <match>: erwartet N, gefunden M`.
 *   Ein freigegebenes Modul ohne Ordner `js/modules/<id>` wird übersprungen.
 * @throws {Error} wenn eine Ausnahme keinen Grund nennt
 */
export function countAnchorCoverage(appDir, modules, exemptions = ANCHOR_EXEMPTIONS) {
  const out = { total: 0, covered: 0, exempt: 0, missing: [], staleExemptions: [], exemptionCountMismatches: [] };
  for (const [id, entry] of Object.entries(modules)) {
    if (entry.available !== true) continue;
    const own = exemptions[id] ?? [];
    for (const e of own) {
      if (!e.reason?.trim()) throw new Error(`anchor-exemptions: ${id} „${e.match}“ ohne Grund`);
    }
    const hits = new Map(own.map(e => [e, 0]));
    const dir = join(appDir, 'js', 'modules', id);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter(f => f.endsWith('.html')).sort()) {
      for (const c of scanCaptions(readFileSync(join(dir, file), 'utf8'))) {
        out.total++;
        if (c.anchored) { out.covered++; continue; }
        const hit = own.find(e => c.snippet.includes(e.match));
        if (hit) { out.covered++; out.exempt++; hits.set(hit, hits.get(hit) + 1); continue; }
        out.missing.push(`${id}: ${file}:${c.line}: ${c.snippet}`);
      }
    }
    for (const [e, n] of hits) {
      if (n === 0) out.staleExemptions.push(`${id}: ${e.match}`);
      else if (e.count !== undefined && e.count !== n) {
        out.exemptionCountMismatches.push(`${id}: ${e.match}: erwartet ${e.count}, gefunden ${n}`);
      }
    }
  }
  return out;
}
