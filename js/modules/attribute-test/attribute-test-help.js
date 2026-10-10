/**
 * D.Mike — Attribute Test Module Handbook (attribute-test-help.js)
 * Bilingual help content (DE/EN) for the attribute test module.
 */

export default {
  moduleId: 'attribute-test',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          { type: 'paragraph', content: 'Attributtests prüfen Häufigkeiten statt Messwerte: Ausschussanteile, Fehlerquoten, Zuordnungen zu Kategorien. Das Modul rechnet drei Tests – einen Anteil gegen einen Sollwert, zwei Anteile gegeneinander und den {{term:chi-quadrat-test|Chi-Quadrat-Test}} auf Zusammenhang in einer {{term:kontingenztafel|Kreuztabelle}}.' },
          { type: 'definition', term: 'Eingabe', content: 'Zusammengefasst („37 von 1200“) oder aus Spalten eines Arbeitsblatts. Bei Spalten wird die Tabelle gezählt; der Wert, der als Ereignis gilt, ist wählbar (Standard: der alphabetisch letzte). Leere Zellen werden übersprungen und gezählt.' },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          { type: 'paragraph', content: 'Attribute tests work on counts instead of measurements: scrap rates, defect rates, assignments to categories. The module runs three tests – one proportion against a target, two proportions against each other, and the {{term:chi-quadrat-test|chi-square test}} of association in a {{term:kontingenztafel|cross table}}.' },
          { type: 'definition', term: 'Input', content: 'Summarized ("37 of 1200") or from worksheet columns. With columns the table is counted; the value that counts as event can be chosen (default: the alphabetically last). Empty cells are skipped and counted.' },
        ],
      },
    },
    oneProportion: {
      de: {
        title: '1 Anteil',
        blocks: [
          { type: 'paragraph', content: 'Prüft, ob der Anteil x/n zu einem Sollwert p₀ passt. Maßgeblich ist der exakte Binomialtest; das Konfidenzintervall ist das exakte Clopper-Pearson-Intervall. Der zweiseitige exakte p-Wert verdoppelt den kleineren einseitigen Wert (Verdopplungsregel, höchstens 1). Die Normalapproximation (z) steht daneben und ist nur verlässlich, wenn n·p₀ und n·(1 − p₀) mindestens 5 sind.' },
          { type: 'definition', term: 'Abweichung von Minitab', content: 'Minitab verwendet für einen Anteil standardmäßig das angepasste Blaker-Verfahren. Dieses Modul rechnet Clopper-Pearson (bei Minitab die Option „Exakt“). Die Intervalle sind etwas breiter, p-Werte können leicht abweichen.' },
        ],
      },
      en: {
        title: '1 proportion',
        blocks: [
          { type: 'paragraph', content: 'Tests whether the proportion x/n fits a target p₀. The decision uses the exact binomial test; the confidence interval is the exact Clopper-Pearson interval. The two-sided exact p-value doubles the smaller one-sided value (doubling rule, capped at 1). The normal approximation (z) is shown alongside and is reliable only when n·p₀ and n·(1 − p₀) are at least 5.' },
          { type: 'definition', term: 'Difference to Minitab', content: 'For one proportion Minitab uses the adjusted Blaker method by default. This module uses Clopper-Pearson (Minitab\'s "Exact" option). Intervals are slightly wider and p-values can differ a little.' },
        ],
      },
    },
    twoProportions: {
      de: {
        title: '2 Anteile',
        blocks: [
          { type: 'paragraph', content: 'Vergleicht zwei Anteile, etwa Ausschuss vor und nach einer Verbesserung. Der z-Test schätzt die Anteile getrennt (wie Minitab); mit „gepoolte Schätzung“ wird ein gemeinsamer Anteil verwendet, wie in vielen Lehrbüchern. Das Konfidenzintervall der Differenz ist immer ungepoolt. Fisher-exakt steht als zweiter {{term:p-wert|p-Wert}} daneben – bei kleinen Zahlen ist er der verlässlichere.' },
        ],
      },
      en: {
        title: '2 proportions',
        blocks: [
          { type: 'paragraph', content: 'Compares two proportions, e.g. scrap before and after an improvement. The z-test estimates the proportions separately (as Minitab does); "pooled estimate" uses a common proportion, as many textbooks do. The CI for the difference is always unpooled. Fisher\'s exact test is shown as a second {{term:p-wert|p-value}} – for small counts it is the more reliable one.' },
        ],
      },
    },
    association: {
      de: {
        title: 'Chi-Quadrat-Assoziation',
        blocks: [
          { type: 'paragraph', content: 'Prüft, ob zwei kategoriale Merkmale zusammenhängen ({{term:nullhypothese|H₀}}: unabhängig). Jede Zelle zeigt beobachtete und erwartete Häufigkeit und ihren Beitrag zu χ² – große Beiträge zeigen, wo der Zusammenhang sitzt. Neben Pearson-χ² steht der Likelihood-Quotient G². Bei 2×2 kommen Yates-Korrektur und Fisher-exakt dazu; nur dort lässt sich die Testrichtung wählen, und sie gilt ausschließlich für Fisher-exakt – die Entscheidung beruht immer auf dem zweiseitigen Pearson-χ².' },
          { type: 'definition', term: 'Warnungen', content: 'Liegt eine erwartete Häufigkeit unter 1 oder mehr als 20 % unter 5, ist der χ²-Test unzuverlässig – Kategorien zusammenfassen oder bei 2×2 Fisher-exakt verwenden. Zeilen und Spalten ohne Beobachtungen werden entfernt.' },
          { type: 'paragraph', content: 'Visuell zeigt das Mosaikdiagramm denselben Zusammenhang.' },
        ],
      },
      en: {
        title: 'Chi-square association',
        blocks: [
          { type: 'paragraph', content: 'Tests whether two categorical variables are related ({{term:nullhypothese|H₀}}: independent). Each cell shows observed and expected count and its contribution to χ² – large contributions show where the association sits. Pearson χ² is accompanied by the likelihood ratio G². For 2×2 tables Yates\' correction and Fisher\'s exact test are added; only there the test direction can be chosen, and it applies to Fisher\'s exact test only – the decision always rests on the two-sided Pearson χ².' },
          { type: 'definition', term: 'Warnings', content: 'If an expected count is below 1 or more than 20 % are below 5, the χ² test is unreliable – merge categories or, for 2×2, use Fisher\'s exact test. Rows and columns without observations are dropped.' },
          { type: 'paragraph', content: 'The mosaic plot shows the same association visually.' },
        ],
      },
    },
  },
};
