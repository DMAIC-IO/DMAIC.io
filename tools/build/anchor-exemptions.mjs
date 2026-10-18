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
  'contour-plot': [
    { match: 'betaLabel(', reason: 'je Koeffizient ein Feld; der Satz steht am Abschnittstitel', count: 6 },
  ],
  heatmap: [
    { match: '<th x-text="h">', reason: 'Kopf je Kategorie (Name aus den Daten); der Satz steht an der Ecke der Tabelle', count: 1 },
  ],
  mosaic: [
    { match: 'mosaic-module__stats-color', reason: 'Kopf je Gruppe (Name aus den Daten); die Tabelle ist an der Ecke (Kategorien) und am Summenkopf (Zählwerte je Gruppe) verankert', count: 1 },
  ],
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
  'pairwise-comparison': [
    { match: 'class="pairwise__matrix-col-header" :key="j"', reason: 'Kopf je Kriterium bzw. Gruppe (Name aus den Daten); der Satz steht an der Tabelle', count: 1 },
    { match: 'pairwise__matrix-row-label', reason: 'Kopf je Kriterium bzw. Gruppe (Name aus den Daten); der Satz steht an der Tabelle', count: 1 },
  ],
  'hypothesis-test': [
    { match: '<th :key="h" x-text="h">', reason: 'Kopf je Kriterium bzw. Gruppe (Name aus den Daten); der Satz steht an der Tabelle', count: 1 },
    { match: 'x-text="row.head"', reason: 'Kopf je Kriterium bzw. Gruppe (Name aus den Daten); der Satz steht an der Tabelle', count: 1 },
  ],
  'attribute-test': [
    { match: '<th x-text="c">', reason: 'Kopf je Kriterium bzw. Gruppe (Name aus den Daten); der Satz steht an der Tabelle', count: 1 },
    { match: '<th x-text="row.name">', reason: 'Kopf je Kriterium bzw. Gruppe (Name aus den Daten); der Satz steht an der Tabelle', count: 1 },
  ],
  correlation: [
    { match: 'corr__col-item', reason: 'je Spalte ein Kästchen; der Satz steht an der Spaltenwahl', count: 1 },
    { match: 'corr__matrix-header', reason: 'Kopf je Kriterium bzw. Gruppe (Name aus den Daten); der Satz steht an der Tabelle', count: 1 },
    { match: 'corr__matrix-row-header', reason: 'Kopf je Kriterium bzw. Gruppe (Name aus den Daten); der Satz steht an der Tabelle', count: 1 },
  ],
  'outlier-test': [
    { match: 'outliertest__method', reason: 'je Verfahren ein Kästchen; der Satz steht am Abschnittstitel', count: 1 },
    { match: 'x-text="m.label"', reason: 'Kennzahlen je Verfahren mit eigener Bedeutung, nicht im Agentenergebnis (Follow-up)', count: 1 },
    { match: '<th>i</th>', reason: 'Schritte des verallgemeinerten ESD, nicht im Agentenergebnis (Follow-up)', count: 1 },
    { match: '<th>Rᵢ</th>', reason: 'Schritte des verallgemeinerten ESD, nicht im Agentenergebnis (Follow-up)', count: 1 },
    { match: '<th>λᵢ</th>', reason: 'Schritte des verallgemeinerten ESD, nicht im Agentenergebnis (Follow-up)', count: 1 },
    { match: 'card.stepsHeader', reason: 'Schritte des verallgemeinerten ESD, nicht im Agentenergebnis (Follow-up)', count: 1 },
    { match: `<th x-text="t('value')">`, reason: 'Wert der Zeile (ESD-Schritt bzw. Markierungstabelle); der Satz steht an der Markierung', count: 2 },
    { match: 'x-text="h.short"', reason: 'Kopf je Verfahren; der Satz steht am Abschnittstitel', count: 1 },
  ],
  'data-transformation': [
    { match: "t('statistic')", reason: 'Spalte der Zeilennamen; die Sätze stehen an den Wertspalten', count: 1 },
  ],
  'process-capability': [
    { match: 'pc__mode-option', reason: 'Wahlmöglichkeit einer Gruppe; der Satz steht am Gruppentitel', count: 1 },
    { match: "t('ppmColKind')", reason: 'Spalte der Zeilennamen; die Sätze stehen an den Wertspalten', count: 1 },
  ],
  'response-optimization': [
    { match: 'data-axis="x"', reason: 'Anzeigeschalter ohne Agentenbezug', count: 1 },
    { match: 'data-axis="y"', reason: 'Anzeigeschalter ohne Agentenbezug', count: 1 },
    { match: ':key="fix.id" class="ro__contour-fix"', reason: 'Anzeigeschalter ohne Agentenbezug', count: 1 },
  ],
};
