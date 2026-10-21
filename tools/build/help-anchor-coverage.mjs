/**
 * Kennzahl „Hilfetexte mit Anker“ (Spec 2026-10-22-help-anchor-coverage).
 *
 * Gegenrichtung zu `anchor-coverage.mjs`: dort braucht jede Beschriftung ein
 * Fragezeichen, hier braucht jeder Aktions- und Feldtext eines freigegebenen
 * Moduls eine Stelle in der Oberfläche, an der ein Mensch ihn mit Alt
 * erreicht. Berichtend — `agent:report` gibt die Zeile aus, kein Test im
 * echten Baum prüft sie hart.
 *
 * Verankert ist ein Eintrag direkt (`modules.<id>.<s>.help` oder
 * `modules.shared.<s>.help` unter den Ankern), über ein Kind (einer seiner
 * Typedef-Schlüssel `types.<T>.<k>` ist verankert) oder als Spiegel-Feld
 * (eine Aktion mit `keysOf: T` hat den Schlüssel `<feld>`, und
 * `types.<T>.<feld>` ist verankert). Dynamische Schlüssel zählen nur, soweit
 * `help-anchors.mjs` sie statisch auflöst.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { anchorKeysOf, BOUND_HELP_KEY_FAMILIES } from './help-anchors.mjs';
import { HELP_ANCHOR_EXEMPTIONS } from './help-anchor-exemptions.mjs';
import { typedefHelpSuffixes } from './agent-report.mjs';

/** Typedef-Suffixe der Aktionen, deren Schlüssel `field` heißt — das Feld spiegelt sie. */
function mirrorSuffixes(entry, field) {
  return Object.values(entry.actions ?? {})
    .filter(a => a.keysOf && a.keys && Object.hasOwn(a.keys, field))
    .map(a => `types.${a.keysOf}.${field}`);
}

/**
 * Hilfetexte mit Anker über alle freigegebenen Module.
 *
 * @param {string} appDir  Wurzel von app/dev
 * @param {Record<string, object>} modules  Registry-Einträge
 * @param {Record<string, Array<{ name: string, reason: string }>>} [exemptions]
 * @param {typeof BOUND_HELP_KEY_FAMILIES} [families]
 * @returns {Promise<{ total: number, covered: number, exempt: number,
 *   perModule: Record<string, { total: number, covered: number, exempt: number }>,
 *   missing: string[], staleExemptions: string[] }>}
 *   `covered` enthält die ausgenommenen; `missing` sortiert, je Lücke
 *   `<id>: actions.<a>` oder `<id>: fields.<f>`; `staleExemptions` je
 *   Ausnahme ohne gedeckte Lücke `<id>: <name>` bzw. `*: <name>`. Ein
 *   freigegebenes Modul ohne Ordner `js/modules/<id>` wird übersprungen.
 * @throws {Error} wenn eine Ausnahme keinen Grund nennt
 */
export async function countHelpAnchorCoverage(appDir, modules,
  exemptions = HELP_ANCHOR_EXEMPTIONS, families = BOUND_HELP_KEY_FAMILIES) {
  for (const [scope, list] of Object.entries(exemptions)) {
    for (const e of list) {
      if (!e.reason?.trim()) throw new Error(`help-anchor-exemptions: ${scope} „${e.name}“ ohne Grund`);
    }
  }
  const out = { total: 0, covered: 0, exempt: 0, perModule: {}, missing: [], staleExemptions: [] };
  const wildcard = exemptions['*'] ?? [];
  const wildcardHits = new Map(wildcard.map(e => [e, 0]));

  for (const [id, entry] of Object.entries(modules)) {
    if (entry.available !== true) continue;
    if (!existsSync(join(appDir, 'js', 'modules', id))) continue;
    const anchors = await anchorKeysOf(appDir, id, families);
    const has = (suffix) => anchors.has(`modules.${id}.${suffix}`) || anchors.has(`modules.shared.${suffix}`);
    const own = exemptions[id] ?? [];
    const ownHits = new Map(own.map(e => [e, 0]));
    const row = { total: 0, covered: 0, exempt: 0 };

    const items = [
      ...Object.entries(entry.actions ?? {}).map(([name, def]) =>
        [`actions.${name}`, typedefHelpSuffixes({ actions: { [name]: def } })]),
      ...Object.entries(entry.fields ?? {}).map(([name, def]) =>
        [`fields.${name}`, [...typedefHelpSuffixes({ fields: { [name]: def } }), ...mirrorSuffixes(entry, name)]]),
    ];
    for (const [name, children] of items) {
      row.total++;
      if (has(`${name}.help`) || children.some(has)) { row.covered++; continue; }
      const ownHit = own.find(e => e.name === name);
      const hit = ownHit ?? wildcard.find(e => e.name === name);
      if (hit) {
        const hits = ownHit ? ownHits : wildcardHits;
        hits.set(hit, hits.get(hit) + 1);
        row.covered++; row.exempt++;
        continue;
      }
      out.missing.push(`${id}: ${name}`);
    }
    for (const [e, n] of ownHits) if (n === 0) out.staleExemptions.push(`${id}: ${e.name}`);
    out.perModule[id] = row;
    out.total += row.total; out.covered += row.covered; out.exempt += row.exempt;
  }
  for (const [e, n] of wildcardHits) if (n === 0) out.staleExemptions.push(`*: ${e.name}`);
  out.missing.sort();
  return out;
}
