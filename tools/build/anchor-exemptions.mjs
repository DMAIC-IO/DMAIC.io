/**
 * Bewusst unverankerte Beschriftungen freigegebener Module. Je Modul eine Liste `{ match, reason, count? }`:
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
  'project-charter': [
    { match: ':aria-label="t(\'reorder\')">#</th>', reason: 'Spaltenkopf der laufenden Nummer, nur das Zeichen #; kein eigenes Feld', count: 1 },
  ],
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
  'triz-function-analysis': [
    { match: ':class="headClass(c)" x-text="c.name"', reason: 'Spaltenkopf je Komponente der Interaktionsmatrix (Name aus den Daten); die Paare beschreibt der Agent unter interactions', count: 1 },
    { match: ':class="headClass(r)" x-text="r.name"', reason: 'Zeilenkopf je Komponente der Interaktionsmatrix (Name aus den Daten)', count: 1 },
  ],
  'data-import': [
    { match: 'data-import__col-name', reason: 'Kopf je Spalte (Name und Typ aus den Daten); die Spalten beschreibt der Agent unter asyncTasks.parse.value.sheets', count: 1 },
  ],
  'contour-plot': [
    { match: 'betaLabel(', reason: 'je Koeffizient ein Feld; der Satz steht am Abschnittstitel', count: 1 },
  ],
  heatmap: [
    { match: '<th x-text="h">', reason: 'Kopf je Kategorie (Name aus den Daten); der Satz steht an der Ecke der Tabelle', count: 1 },
  ],
  mosaic: [
    { match: 'mosaic-module__stats-color', reason: 'Kopf je Gruppe (Name aus den Daten); die Tabelle ist an der Ecke (Kategorien) und am Summenkopf (Summen) verankert', count: 1 },
  ],
  'attribute-control-chart': [
    { match: ':data-rule="rule.id"', reason: 'je Regel ein Kästchen; der Satz zur Regelauswahl steht am Abschnittstitel', count: 1 },
  ],
  fmea: [
    { match: 'fmea__rating-label', reason: 'Gruppenüberschrift über S, O und D; jede Stufe trägt ihren eigenen Anker, die Abzeichen den Satz zu riskRatings', count: 1 },
  ],
  'control-chart': [
    { match: ':data-rule="rule.id"', reason: 'je Regel ein Kästchen; der Satz zur Regelauswahl steht am Abschnittstitel', count: 1 },
  ],
  'transformed-imr-chart': [
    { match: "t('thLimit')", reason: 'Spalte der Zeilennamen UCL, CL, LCL; die Sätze stehen an den beiden Wertspalten', count: 1 },
  ],
  'msa-typ4': [
    { match: 'class="msa-typ4__choice"', reason: 'Wahlmöglichkeit einer Gruppe; der Satz steht am Gruppentitel', count: 4 },
  ],
  'msa-typ6': [
    { match: 'class="msa-typ6__choice"', reason: 'Wahlmöglichkeit einer Gruppe; der Satz steht am Gruppentitel', count: 4 },
    { match: ':checked="isRuleEnabled(id)"', reason: 'je Regel ein Kästchen; der Satz zur Regelauswahl steht am Abschnittstitel', count: 1 },
    { match: "t('violations.description')", reason: 'Klartext der Regeln derselben Zeile; der Satz steht an der Spalte Regeln', count: 1 },
  ],
  'msa-typ5': [
    { match: 'class="msa-typ5__choice"', reason: 'Wahlmöglichkeit einer Gruppe; der Satz steht am Gruppentitel', count: 5 },
    { match: "t('table.verdict')", reason: 'Ampel aus κ nach den Richtwerten derselben Zeile, kein eigener Wert; der Satz steht an der κ-Spalte', count: 2 },
    { match: '<th x-text="a">', reason: 'eine Spalte je Prüfer, Kopf ist der Prüfername (Daten, keine Beschriftung)', count: 1 },
  ],
  'pairwise-comparison': [
    { match: 'class="pairwise__matrix-col-header"', reason: 'Kopf je Kriterium bzw. Gruppe (Name aus den Daten); der Satz steht an der Tabelle', count: 1 },
    { match: 'pairwise__matrix-row-label', reason: 'Kopf je Kriterium bzw. Gruppe (Name aus den Daten); der Satz steht an der Tabelle', count: 1 },
  ],
  'hypothesis-test': [
    { match: '<th x-text="h">', reason: 'Kopf je Kriterium bzw. Gruppe (Name aus den Daten); der Satz steht an der Tabelle', count: 1 },
    { match: 'x-text="row.head"', reason: 'Kopf je Kriterium bzw. Gruppe (Name aus den Daten); der Satz steht an der Tabelle', count: 1 },
  ],
  'attribute-test': [
    { match: '<th x-text="c">', reason: 'Kopf je Kriterium bzw. Gruppe (Name aus den Daten); der Satz steht an der Tabelle', count: 1 },
    { match: '<th x-text="row.name">', reason: 'Kopf je Kriterium bzw. Gruppe (Name aus den Daten); der Satz steht an der Tabelle', count: 1 },
  ],
  correlation: [
    { match: 'corr__matrix-header', reason: 'Kopf je Kriterium bzw. Gruppe (Name aus den Daten); der Satz steht an der Tabelle', count: 1 },
    { match: 'corr__matrix-row-header', reason: 'Kopf je Kriterium bzw. Gruppe (Name aus den Daten); der Satz steht an der Tabelle', count: 1 },
  ],
  'outlier-test': [
    { match: 'outliertest__method', reason: 'je Verfahren ein Kästchen; der Satz steht am Abschnittstitel', count: 1 },
    { match: 'card.stepsHeader', reason: 'Markierungsspalte der ESD-Schritte (Haken oder Kreuz), keine eigene Kennzahl', count: 1 },
    { match: `<th x-text="t('value')">`, reason: 'Wert der Zeile der Markierungstabelle; der Satz steht an der Markierung', count: 1 },
    { match: 'x-text="h.short"', reason: 'Kopf je Verfahren; der Satz steht am Abschnittstitel', count: 1 },
  ],
  'data-transformation': [
    { match: "t('statistic')", reason: 'Spalte der Zeilennamen; die Sätze stehen an den Wertspalten', count: 1 },
  ],
  'process-capability': [
    { match: ':data-ref="mode.ref"', reason: 'Wahlmöglichkeit einer Gruppe; der Satz steht am Gruppentitel', count: 1 },
    { match: "t('ppmColKind')", reason: 'Spalte der Zeilennamen; die Sätze stehen an den Wertspalten', count: 1 },
  ],
  'process-map': [
    { match: 'class="pmap__sipoc-option" :class="importOptionClass(opt)"', reason: 'Auswahlzeile je SIPOC-Instanz im Importdialog; keine Agentenaktion', count: 1 },
  ],
  'activity-flowchart': [
    { match: 'class="af__import-option"', reason: 'Auswahlzeile je Quelle im Importdialog; keine Agentenaktion', count: 1 },
  ],
  'deployment-flowchart': [
    { match: 'class="df__import-option"', reason: 'Auswahlzeile je Quelle im Importdialog; keine Agentenaktion', count: 1 },
  ],
  ishikawa: [
    { match: 'class="ishikawa__col-nr">#</th>', reason: 'Spaltenkopf der laufenden Nummer (Ursachen, Fakten, Experimente), nur das Zeichen #; kein eigenes Feld', count: 3 },
    { match: 'ishikawa__exp-col-head', reason: 'Spaltenkopf je Mitglied des Expertenteams, Name aus den Daten; das Team ist an seiner Überschrift verankert', count: 1 },
    { match: '<label class="ishikawa__hyp-pick-row">', reason: 'Eintrag je Experiment bzw. Ursache in den Verknüpfungsdialogen, Text aus den Daten; die Liste ist über ihren Parameter verankert', count: 2 },
  ],
  'opportunity-flowchart': [
    { match: 'class="of__import-option"', reason: 'Auswahlzeile je Quelle im Importdialog; keine Agentenaktion', count: 1 },
  ],
  'survey-builder': [
    { match: ':value="opt.id"', reason: 'Option einer Bedingungszeile; ihr Text ist die Option selbst, die Bedingungen sind am Titel der Bedingungen verankert', count: 1 },
    { match: '<th x-text="g.label">', reason: 'Spaltenkopf je Vergleichsgruppe, Text aus den Daten; die Gruppierung ist an ihrer Auswahl verankert', count: 1 },
  ],
  'triz-contradiction-matrix': [
    { match: 'triz-cm__mx-corner', reason: 'Ecke der Nachschlagematrix (Pfeile); das Kontrollkästchen darüber erklärt die Matrix', count: 1 },
    { match: 'triz-cm__mx-col-head', reason: 'Kopf je Merkmal (39), feste Tabellendaten', count: 1 },
    { match: 'triz-cm__mx-row-head', reason: 'Kopf je Merkmal (39), feste Tabellendaten', count: 1 },
  ],
  'triz-sufield': [
    { match: 'triz-sf__filter-label', reason: 'Optionsfeld-Paar: nur das letzte trägt den Anker (ein Kreis je Gruppe)', count: 1 },
  ],
  'doe-planner': [
    { match: 'doe__term-chip', reason: 'Schalter je Modellterm; die Termliste ist an setTerm verankert', count: 1 },
    { match: 'doe__forbidden-factor', reason: 'Auswahl je Faktor in der Eingabezeile; die verbotenen Ecken sind an addForbiddenVertex verankert', count: 1 },
    { match: "doe__res-corner\" x-text=\"t('runs')\"", reason: 'Kopf der festen Auflösungstabelle; die Tabelle ist an selectResolution verankert', count: 1 },
    { match: "t('factorsHeader')", reason: 'Kopf der festen Auflösungstabelle; die Tabelle ist an selectResolution verankert', count: 1 },
    { match: 'resColClass(k)', reason: 'Kopf je Faktorzahl der festen Auflösungstabelle (nur die Zahl)', count: 1 },
    { match: "<th x-text=\"t('factors')\"", reason: 'Kopf der festen Plackett-Burman-Tabelle; die Tabelle ist an selectPB verankert', count: 1 },
    { match: "<th x-text=\"t('runs')\"", reason: 'Kopf der festen Plackett-Burman- und Taguchi-Tabellen; beide sind an ihren Aktionen verankert', count: 2 },
    { match: "t('taguchiArray')", reason: 'Kopf der festen Taguchi-Tabelle; die Tabelle ist an selectTaguchi verankert', count: 1 },
    { match: "t('taguchiMaxFactors')", reason: 'Kopf der festen Taguchi-Tabelle; die Tabelle ist an selectTaguchi verankert', count: 1 },
    { match: "t('mainEffects')", reason: 'Kopf der VIF-Tabelle, deren Überschrift an der VIF-Bewertung verankert ist', count: 1 },
    { match: "t('interactions')", reason: 'Kopf der VIF-Tabelle, deren Überschrift an der VIF-Bewertung verankert ist', count: 1 },
    { match: '<th>VIF</th>', reason: 'Wertspalte der VIF-Tabelle, deren Überschrift an der VIF-Bewertung verankert ist', count: 2 },
  ],
};
