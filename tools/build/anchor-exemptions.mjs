/**
 * Bewusst unverankerte Beschriftungen freigegebener Module (Spec
 * 2026-10-17 §4 0c). Je Modul eine Liste `{ match, reason }`: `match` ist ein
 * Teilstring des öffnenden Tags (z. B. `t('ofTolerance')`), `reason` sagt,
 * warum dort kein Fragezeichen hingehört (Fließtext, Wiederholung je Zeile,
 * reine Einheit). Ohne Grund kein Eintrag — `countAnchorCoverage` wirft.
 *
 * @type {Record<string, Array<{ match: string, reason: string }>>}
 */
export const ANCHOR_EXEMPTIONS = {};
