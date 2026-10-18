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
  'unit-converter': [
    { match: "<th x-text=\"t('refValue')\"", reason: 'Nachschlagetabelle mit festen Beispielwerten; nicht Teil der Lesefläche', count: 1 },
    { match: "<th x-text=\"t('refFrom')\"", reason: 'Nachschlagetabelle mit festen Beispielwerten; nicht Teil der Lesefläche', count: 1 },
    { match: "<th x-text=\"t('refResult')\"", reason: 'Nachschlagetabelle mit festen Beispielwerten; nicht Teil der Lesefläche', count: 1 },
    { match: "<th x-text=\"t('refTo')\"", reason: 'Nachschlagetabelle mit festen Beispielwerten; nicht Teil der Lesefläche', count: 1 },
    { match: "<th x-text=\"t('tzTimezone')\"", reason: 'Weltuhr, aus Zeitzone und Uhrzeit abgeleitet; nicht Teil der Lesefläche', count: 1 },
    { match: "<th x-text=\"t('tzAbbr')\"", reason: 'Weltuhr, aus Zeitzone und Uhrzeit abgeleitet; nicht Teil der Lesefläche', count: 1 },
    { match: "<th x-text=\"t('tzDate')\"", reason: 'Weltuhr, aus Zeitzone und Uhrzeit abgeleitet; nicht Teil der Lesefläche', count: 1 },
    { match: "<th x-text=\"t('tzTime')\"", reason: 'Weltuhr, aus Zeitzone und Uhrzeit abgeleitet; nicht Teil der Lesefläche', count: 1 },
  ],
  'doe-advisor': [
    { match: "t('col.", reason: 'Nachschlagetabelle mit festem Inhalt (Übersicht der Versuchspläne, Phasenleitfaden); nicht Teil der Lesefläche', count: 8 },
    { match: 'doe-advisor__row-name', reason: 'Zeilenkopf je Versuchsplan (Name aus dem Katalog)', count: 1 },
    { match: 'phasePhase(id)', reason: 'Zeilenkopf je Phase des Leitfadens', count: 1 },
    { match: "t('ccd.col.", reason: 'Nachschlagetabelle mit festem Inhalt (CCD-Vergleich); nicht Teil der Lesefläche', count: 3 },
    { match: 'ccdLabel(id)', reason: 'Zeilenkopf je Eigenschaft des CCD-Vergleichs', count: 1 },
  ],
  'data-import': [
    { match: 'data-import__col-name', reason: 'Kopf je Spalte (Name und Typ aus den Daten); die Spalten beschreibt der Agent unter sheets', count: 1 },
  ],
  'contour-plot': [
    { match: 'betaLabel(', reason: 'je Koeffizient ein Feld; der Satz steht am Abschnittstitel', count: 6 },
  ],
  heatmap: [
    { match: '<th x-text="h">', reason: 'Kopf je Kategorie (Name aus den Daten); der Satz steht an der Ecke der Tabelle', count: 1 },
  ],
  mosaic: [
    { match: 'mosaic-module__stats-color', reason: 'Kopf je Gruppe (Name aus den Daten); die Tabelle ist an der Ecke (Kategorien) und am Summenkopf (Summen) verankert', count: 1 },
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
    { match: `<th x-text="t('symStep')"></th>`, reason: 'Schritte des verallgemeinerten ESD, nicht im Agentenergebnis (Follow-up)', count: 1 },
    { match: `<th x-text="t('symR')"></th>`, reason: 'Schritte des verallgemeinerten ESD, nicht im Agentenergebnis (Follow-up)', count: 1 },
    { match: `<th x-text="t('symLambda')"></th>`, reason: 'Schritte des verallgemeinerten ESD, nicht im Agentenergebnis (Follow-up)', count: 1 },
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
  'process-map': [
    { match: 'class="pmap__sipoc-option"', reason: 'Auswahlzeile je SIPOC-Instanz im Importdialog; keine Agentenaktion', count: 1 },
  ],
  'activity-flowchart': [
    { match: 'class="af__import-option"', reason: 'Auswahlzeile je Quelle im Importdialog; keine Agentenaktion', count: 1 },
  ],
  'deployment-flowchart': [
    { match: 'class="df__import-option"', reason: 'Auswahlzeile je Quelle im Importdialog; keine Agentenaktion', count: 1 },
  ],
  'opportunity-flowchart': [
    { match: 'class="of__import-option"', reason: 'Auswahlzeile je Quelle im Importdialog; keine Agentenaktion', count: 1 },
  ],
  'triz-9-windows': [
    { match: 'triz-9w__upload-btn', reason: 'Bild-Upload je Fenster (9×); Dateiwahl ohne Agentenweg', count: 1 },
  ],
  'triz-contradiction-matrix': [
    { match: 'triz-cm__mx-corner', reason: 'Ecke der Nachschlagematrix (Pfeile); der Knopf darüber erklärt die Matrix', count: 1 },
    { match: 'triz-cm__mx-col-head', reason: 'Kopf je Merkmal (39), feste Tabellendaten', count: 1 },
    { match: 'triz-cm__mx-row-head', reason: 'Kopf je Merkmal (39), feste Tabellendaten', count: 1 },
  ],
  'triz-evolution-trends': [
    { match: 'class="triz-evo__stage"', reason: 'Stufe je Trend (Optionsfeld je Stufe); der Trend selbst ist beschrieben', count: 1 },
  ],
  'triz-sufield': [
    { match: 'triz-sf__standard-select', reason: 'Kästchen je Standardlösung (78), in aufklappbaren Klassen', count: 1 },
    { match: 'triz-sf__filter-label', reason: 'Optionsfeld-Paar: nur das letzte trägt den Anker (ein Kreis je Gruppe)', count: 1 },
  ],
  fmea: [
    { match: '<th style="width:28px"><span class="icon icon--sm" data-icon="action.confirm"', reason: 'Schmale Symbolspalte „Umgesetzt“; ein Kreis läge über dem Kopf „Maßnahme“', count: 1 },
    { match: "t('rating')", reason: 'Gruppentitel über S, O, D; jede der drei Beschriftungen ist einzeln erklärt', count: 1 },
    { match: "t('scaleValue')", reason: 'Bewertungsskala, Eingabetabelle der Skalentexte (Wert 1–10)', count: 4 },
    { match: "t('scaleMeaning')", reason: 'Bewertungsskala, Eingabetabelle der Skalentexte', count: 2 },
    { match: "t('scaleDescription')", reason: 'Bewertungsskala, Eingabetabelle der Skalentexte', count: 2 },
    { match: "t('scaleProbability')", reason: 'Bewertungsskala, Eingabetabelle der Skalentexte', count: 1 },
    { match: "t('scaleRate')", reason: 'Bewertungsskala, Eingabetabelle der Skalentexte', count: 1 },
    { match: "t('scaleDetect')", reason: 'Bewertungsskala, Eingabetabelle der Skalentexte', count: 1 },
    { match: "t('apScaleCriterion')", reason: 'AP-Bewertungsskala, Eingabetabelle der Skalentexte', count: 1 },
    { match: "t('abbrS')", reason: 'Kopf der festen AP-Nachschlagematrix (AIAG-VDA)', count: 1 },
    { match: "t('abbrO')", reason: 'Kopf der festen AP-Nachschlagematrix (AIAG-VDA)', count: 1 },
    { match: "t('abbrD') + ' ' + d", reason: 'Kopf je D-Stufe der festen AP-Nachschlagematrix', count: 1 },
  ],
  'raci-matrix': [
    { match: 'raci__th-stakeholder', reason: 'Kopf je Beteiligter (Name aus den Daten, umbenennbar)', count: 1 },
  ],
  'ce-matrix': [
    { match: 'ce-matrix__weight-cell', reason: 'Gewichtsauswahl je Ergebnisgröße; die Zeile ist am Kopf „Wichtigkeit für Kunden“ erklärt', count: 1 },
  ],
  'dmaic-calendar': [
    { match: "t('endTime')", reason: 'nur im Dialog; das Ende wird mit dem Beginn zur Dauer verrechnet, die Dauer ist erklärt', count: 1 },
  ],
  makigami: [
    { match: "t('colCode')", reason: 'Einstellungen, Eingabetabelle der Verschwendungsarten', count: 1 },
    { match: "t('colLabel')", reason: 'Einstellungen, Eingabetabellen (Verschwendungsarten, Zeiteinheiten)', count: 2 },
    { match: "t('colColor')", reason: 'Einstellungen, Eingabetabelle der Verschwendungsarten', count: 1 },
    { match: "t('colFactor')", reason: 'Einstellungen, Eingabetabelle der Zeiteinheiten', count: 1 },
    { match: 'makigami__matrix-step-head', reason: 'Kopf je Prozessschritt (Titel aus den Daten, editierbar)', count: 1 },
  ],
  'voc-ctx-tree': [
    { match: 'textLabel()', reason: 'Beschriftung wechselt mit der Knotenart (Stimme, Bedürfnis, Treiber, Anforderung); der Text ist je Aktion beschrieben', count: 1 },
  ],
};
