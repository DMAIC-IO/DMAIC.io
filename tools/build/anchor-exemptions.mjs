/**
 * Bewusst unverankerte Beschriftungen freigegebener Module (Spec
 * 2026-10-17 §4 0c). Je Modul eine Liste `{ match, reason, count? }`:
 * `match` ist ein Teilstring des ganzen Elements samt Inhalt, so wie
 * `agent:report -- --verbose` es hinter `<datei>:<zeile>:` ausgibt (z. B.
 * `<th>n</th>` oder `t('ofTolerance')`). Ein bloßes `<th>` träfe jede
 * attributlose Kopfzelle, auch künftige — also so eng wie möglich fassen.
 * `reason` sagt, warum dort kein Fragezeichen hingehört (Fließtext,
 * Wiederholung je Zeile, reine Einheit, Eingabetabelle). Ohne Grund kein
 * Eintrag — `countAnchorCoverage` wirft. `count` (optional) ist die erwartete
 * Trefferzahl; weicht sie ab, meldet `agent:report` die Ausnahme als
 * „Ausnahme mit falscher Trefferzahl“.
 *
 * @type {Record<string, Array<{ match: string, reason: string, count?: number }>>}
 */
export const ANCHOR_EXEMPTIONS = {};
