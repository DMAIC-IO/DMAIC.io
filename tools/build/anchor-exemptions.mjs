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
export const ANCHOR_EXEMPTIONS = {
  'msa-typ4': [
    { match: 'name="msa4-norm"', reason: 'Wahlmöglichkeit einer Gruppe; der Satz steht am Gruppentitel', count: 1 },
    { match: 'name="msa4-pv"', reason: 'Wahlmöglichkeit einer Gruppe; der Satz steht am Gruppentitel', count: 1 },
  ],
  'msa-typ6': [
    { match: 'name="msa-typ6-chartType"', reason: 'Wahlmöglichkeit einer Gruppe; der Satz steht am Gruppentitel', count: 1 },
    { match: 'name="msa-typ6-limitsMode"', reason: 'Wahlmöglichkeit einer Gruppe; der Satz steht am Gruppentitel', count: 1 },
    { match: 'module-msa-typ6__nelson-rule', reason: 'je Regel ein Kästchen; der Satz zur Regelauswahl steht am Abschnittstitel', count: 1 },
    { match: "t('input.sourceTyp1')", reason: 'Übernahme aus einer Typ-1-Instanz füllt μ₀ und σ₀; keine eigene Eingabe der Studie und über die Agentenfläche nicht setzbar', count: 1 },
    { match: "t('violations.description')", reason: 'Klartext der Regeln derselben Zeile; der Satz steht an der Spalte Regeln', count: 1 },
  ],
};
