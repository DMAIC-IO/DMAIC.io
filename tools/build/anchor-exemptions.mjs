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
  'attribute-control-chart': [
    { match: 'attr-cc__nelson-rule', reason: 'je Regel ein Kästchen; der Satz zur Regelauswahl steht am Abschnittstitel', count: 1 },
  ],
  'control-chart': [
    { match: 'control-chart__nelson-rule', reason: 'je Regel ein Kästchen; der Satz zur Regelauswahl steht am Abschnittstitel', count: 1 },
  ],
  'transformed-imr-chart': [
    { match: "t('thLimit')", reason: 'Spalte der Zeilennamen OEG, Mittellinie, UEG; die Sätze stehen an den beiden Wertspalten', count: 1 },
  ],
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
  'msa-typ5': [
    { match: 'name="msa5-type"', reason: 'Wahlmöglichkeit einer Gruppe; der Satz steht am Gruppentitel', count: 1 },
    { match: 'name="msa5-weights"', reason: 'Wahlmöglichkeit einer Gruppe; der Satz steht am Gruppentitel', count: 1 },
    { match: "t('labels.ratingColumns')", reason: 'Matrix-Slot des breiten Layouts, über die Agentenfläche noch nicht setzbar (Roadmap: setRatingColumns); ohne Agentenaktion kein gemeinsamer Satz', count: 1 },
    { match: "t('table.verdict')", reason: 'Ampel aus κ nach den Richtwerten derselben Zeile, kein eigener Wert; der Satz steht an der κ-Spalte', count: 2 },
    { match: ':key="a" x-text="a"', reason: 'eine Spalte je Prüfer, Kopf ist der Prüfername (Daten, keine Beschriftung)', count: 1 },
  ],
  regression: [
    { match: "t('showCI')", reason: 'Anzeigeschalter ohne Agentenbezug', count: 1 },
    { match: "t('showPI')", reason: 'Anzeigeschalter ohne Agentenbezug', count: 1 },
    { match: 'x-text="field.label"', reason: 'je Prädiktor ein Eingabefeld; der Satz steht am Abschnittstitel Vorhersage', count: 1 },
    { match: 'reg__ss-pie-item', reason: 'je Term ein Kästchen im Kreisdiagramm; Anzeigeschalter ohne Agentenbezug', count: 1 },
  ],
  'glm-regression': [
    { match: 'glm__method-option', reason: 'Wahlmöglichkeit einer Gruppe; der Satz steht am Gruppentitel', count: 1 },
    { match: 'x-text="term.label"', reason: 'je Prädiktor ein Eingabefeld; der Satz steht am Vorhersage-Knopf', count: 1 },
  ],
};
