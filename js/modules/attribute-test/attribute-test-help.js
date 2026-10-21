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
          { type: 'paragraph', content: 'Attributtests prüfen Häufigkeiten statt Messwerte: Ausschussanteile, Fehlerquoten, Zuordnungen zu Kategorien. Das Modul rechnet sieben Tests – einen Anteil gegen einen Sollwert, zwei Anteile gegeneinander, den {{term:chi-quadrat-test|Chi-Quadrat-Test}} auf Zusammenhang in einer {{term:kontingenztafel|Kreuztabelle}}, den {{term:mcnemar-test|McNemar-Test}} für gepaarte Anteile, den {{term:aequivalenztest|Äquivalenztest}} auf Gleichwertigkeit sowie eine und zwei {{term:poisson-rate|Poisson-Raten}} (Fehler je Einheit).' },
          { type: 'definition', term: 'Eingabe', content: 'Zusammengefasst („37 von 1200“) oder aus Spalten eines Arbeitsblatts. Bei Spalten wird die Tabelle gezählt; der Wert, der als Ereignis gilt, ist wählbar (Standard: der alphabetisch letzte). Leere Zellen werden übersprungen und gezählt.' },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          { type: 'paragraph', content: 'Attribute tests work on counts instead of measurements: scrap rates, defect rates, assignments to categories. The module runs seven tests – one proportion against a target, two proportions against each other, the {{term:chi-quadrat-test|chi-square test}} of association in a {{term:kontingenztafel|cross table}}, the {{term:mcnemar-test|McNemar test}} for paired proportions, the {{term:aequivalenztest|equivalence test}} for equivalence, and one and two {{term:poisson-rate|Poisson rates}} (defects per unit).' },
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
    mcnemar: {
      de: {
        title: 'McNemar (gepaarte Anteile)',
        blocks: [
          { type: 'paragraph', content: 'Der {{term:mcnemar-test|McNemar-Test}} vergleicht zwei Anteile, wenn dieselben Einheiten zweimal beurteilt werden. Das Lehrbuchbeispiel (Melzer 2019, §3.5.1): dieselben 500 Teile werden vor und nach einer Reinigung geprüft. Ein Test für zwei unabhängige Anteile wäre falsch, weil er so tut, als stammten beide Prüfungen von verschiedenen Teilen. Die Tafel zählt die Paare: beide gut, beide schlecht und die zwei Arten von Wechsel (Ereignis → kein Ereignis und umgekehrt). Nur die Wechsel tragen Information; {{term:nullhypothese|H₀}}: beide Richtungen sind gleich häufig.' },
          { type: 'definition', term: 'Eingabe', content: 'Zusammengefasst als 2×2-Tafel der Paare (die Beschriftungen für „vorher“ und „nachher“ sind frei wählbar) oder aus zwei gleich langen Spalten. Zeilen, in denen eine der beiden Zellen leer ist, werden übersprungen und gezählt. Beide Spalten zusammen dürfen genau zwei verschiedene Werte enthalten.' },
          { type: 'definition', term: 'Ergebnis', content: 'Maßgeblich ist der exakte Test (Binomial mit p = 0,5; der zweiseitige Wert verdoppelt den kleineren, höchstens 1). Daneben stehen χ² mit und ohne Stetigkeitskorrektur und das Konfidenzintervall der Differenz der Anteile (nachher − vorher). Der χ²-Wert mit Stetigkeitskorrektur nutzt max(0, |b − c| − 1)²; bei b = c weicht er daher von R und statsmodels ab. Gibt es keinen Wechsel, lässt sich nichts testen; bei wenigen Wechseln (unter 10) ist nur der exakte Test verlässlich.' },
        ],
      },
      en: {
        title: 'McNemar (paired proportions)',
        blocks: [
          { type: 'paragraph', content: 'The {{term:mcnemar-test|McNemar test}} compares two proportions when the same units are judged twice. The textbook case (Melzer 2019, §3.5.1): the same 500 parts are inspected before and after a cleaning. A test for two independent proportions would be wrong because it pretends the two inspections come from different parts. The table counts the pairs: both good, both bad and the two kinds of change (event → no event and vice versa). Only the changes carry information; {{term:nullhypothese|H₀}}: both directions are equally frequent.' },
          { type: 'definition', term: 'Input', content: 'Summarized as a 2×2 table of pairs (the labels for "before" and "after" are free) or from two columns of equal length. Rows in which one of the two cells is empty are skipped and counted. Both columns together may contain exactly two distinct values.' },
          { type: 'definition', term: 'Result', content: 'The exact test is decisive (binomial with p = 0.5; the two-sided value doubles the smaller one, capped at 1). Alongside are χ² with and without continuity correction and the confidence interval of the difference in proportions (after − before). The continuity-corrected χ² uses max(0, |b − c| − 1)², so for b = c it differs from R and statsmodels. Without any change nothing can be tested; with few changes (below 10) only the exact test is reliable.' },
        ],
      },
    },
    equivalence: {
      de: {
        title: 'Äquivalenztest',
        blocks: [
          { type: 'paragraph', content: 'Ein nicht signifikanter Vergleich heißt nicht, dass die Anteile gleichwertig sind – er heißt nur, dass kein Unterschied nachgewiesen wurde. Der {{term:aequivalenztest|Äquivalenztest}} (TOST) dreht die Frage um: Er legt Grenzen fest und prüft, ob die Differenz sicher darin liegt. „Gleichwertig“ lautet das Ergebnis nur, wenn beide einseitigen Tests bestanden sind.' },
          { type: 'definition', term: 'Beispiel Nachprüfung', content: 'Melzer 2019, §13.4: 184 von 3902 Teilen gegen 179 von 4023. Der gewöhnliche Test findet keinen Unterschied (p = 0,571). Der 90-%-Bereich der Differenz beträgt etwa (−0,51; +1,04) Prozentpunkte – er ragt über +1 hinaus, also ist Gleichwertigkeit innerhalb von ±1 Prozentpunkt nicht nachgewiesen. Mit der Grenze ±1,5 wäre sie es.' },
          { type: 'definition', term: 'Grenzen', content: 'Die Grenzen sind eine fachliche, keine statistische Entscheidung: Welcher Unterschied in Prozentpunkten ist praktisch noch egal? Sie werden vor der Auswertung festgelegt und nicht aus dem Ergebnis abgelesen. Standardmäßig sind sie symmetrisch (± δ); getrennte Unter- und Obergrenze sind möglich. Bei 2 Stichproben gelten die Grenzen für die Differenz p₁ − p₂ und müssen die 0 einschließen; bei 1 Stichprobe gelten sie relativ zum Sollwert p₀ (Grenzen ±2 bei p₀ = 10 % prüfen den Bereich 8 % bis 12 %), und das Ergebnis steht in absoluten Prozent.' },
          { type: 'definition', term: 'Warum 90 %?', content: 'TOST besteht, wenn beide einseitigen Tests zum Niveau α bestehen. Das entspricht genau dem (1 − 2α)-Intervall, bei α = 0,05 also dem 90-%-Intervall. Das übliche 95-%-Intervall wäre für diese Entscheidung zu streng.' },
          { type: 'definition', term: 'Verfahren', content: 'Zwei Stichproben: Normalapproximation (Wald) für beide einseitigen z-Tests; der p-Wert ist der größere der beiden. Eine Stichprobe: exaktes Verfahren über das Clopper-Pearson-(1 − 2α)-Intervall, das auch bei 0 Ereignissen brauchbar bleibt. Sind beide Anteile 0 oder beide 1, trägt die Näherung nicht; das Modul zeigt dann einen Hinweis statt eines Ergebnisses. Minitab bietet Äquivalenztests nur für Mittelwerte an, für Anteile gibt es dort keine Vergleichswerte.' },
        ],
      },
      en: {
        title: 'Equivalence test',
        blocks: [
          { type: 'paragraph', content: 'A non-significant comparison does not mean the proportions are equivalent – it only means no difference was shown. The {{term:aequivalenztest|equivalence test}} (TOST) turns the question around: it sets bounds and tests whether the difference lies safely inside. The result reads "equivalent" only if both one-sided tests pass.' },
          { type: 'definition', term: 'Re-inspection example', content: 'Melzer 2019, §13.4: 184 of 3902 parts against 179 of 4023. The ordinary test finds no difference (p = 0.571). The 90 % interval of the difference is about (−0.51; +1.04) percentage points – it reaches beyond +1, so equivalence within ±1 percentage point is not shown. With a bound of ±1.5 it would be.' },
          { type: 'definition', term: 'Bounds', content: 'The bounds are a practical, not a statistical decision: which difference in percentage points no longer matters? They are fixed before the analysis and not read off the result. Symmetric (± δ) by default; separate lower and upper bounds are possible. With 2 samples the bounds apply to the difference p₁ − p₂ and must enclose 0; with 1 sample they are relative to the target p₀ (bounds of ±2 at p₀ = 10 % test the range 8 % to 12 %), and the result is given in absolute percent.' },
          { type: 'definition', term: 'Why 90 %?', content: 'TOST passes if both one-sided tests pass at level α. This corresponds exactly to the (1 − 2α) interval, i.e. the 90 % interval at α = 0.05. The usual 95 % interval would be too strict for this decision.' },
          { type: 'definition', term: 'Method', content: 'Two samples: normal approximation (Wald) for both one-sided z-tests; the p-value is the larger of the two. One sample: exact procedure via the Clopper-Pearson (1 − 2α) interval, which stays usable at 0 events. If both proportions are 0 or both are 1 the approximation does not hold; the module then shows a notice instead of a result. Minitab offers equivalence tests only for means; there are no reference values for proportions.' },
        ],
      },
    },
    poissonRates: {
      de: {
        title: '1 und 2 Poisson-Raten',
        blocks: [
          { type: 'paragraph', content: 'Zählt man Fehler statt guter und schlechter Einheiten – Lackfehler je Fläche, Störungen je Betriebsstunde –, ist das Ergebnis eine {{term:poisson-rate|Poisson-Rate}}: x Ereignisse in der Beobachtungsmenge t. Die Beobachtungsmenge (Exposure) ist die Fläche, Zeit oder Stückzahl, in der gezählt wurde; sie muss nicht ganzzahlig sein und darf bei zwei Raten verschieden sein – verglichen wird x/t. Mit Spalten gibt die Zählspalte die Ereignisse je Zeile an; die Beobachtungsmenge je Zeile wird extra eingegeben.' },
          { type: 'definition', term: '1 Rate', content: 'Der exakte Test beruht auf der Poisson-Verteilung mit dem Mittelwert λ₀·t; das Konfidenzintervall ist das exakte (Garwood-)Intervall. Der zweiseitige p-Wert verdoppelt den kleineren einseitigen Wert (Verdopplungsregel, höchstens 1) und passt damit zum Intervall. Die Normalapproximation (z) steht daneben und ist nur bei λ₀·t ≥ 5 verlässlich.' },
          { type: 'definition', term: 'Abweichung von R', content: 'Die Funktion poisson.test in R bildet den zweiseitigen p-Wert nach dem „minlike“-Verfahren (alle Ausgänge, die höchstens so wahrscheinlich sind wie der beobachtete). Dieses Modul verdoppelt dagegen den kleineren einseitigen Wert („central“). Die p-Werte können daher abweichen; das Intervall ist dasselbe.' },
          { type: 'definition', term: '2 Raten', content: 'Differenz der Raten mit Normalapproximations-Intervall (ungepoolter Standardfehler) und z-Test der Differenz. Standardmäßig werden die Raten getrennt geschätzt; „gepoolte Schätzung“ nimmt eine gemeinsame Rate und ist nur bei der Hypothese „Differenz = 0“ möglich. Daneben stehen der exakte bedingte Test (Binomial auf x₁ von x₁ + x₂, zentral wie oben) und das Verhältnis der Raten mit Intervall.' },
        ],
      },
      en: {
        title: '1 and 2 Poisson rates',
        blocks: [
          { type: 'paragraph', content: 'When you count defects instead of good and bad units – paint defects per area, breakdowns per operating hour – the result is a {{term:poisson-rate|Poisson rate}}: x events in the exposure t. The exposure is the area, time or number of units in which the events were counted; it need not be an integer and may differ between two rates – x/t is compared. With columns, the count column gives the events per row; the exposure per row is entered separately.' },
          { type: 'definition', term: '1 rate', content: 'The exact test rests on the Poisson distribution with mean λ₀·t; the confidence interval is the exact (Garwood) interval. The two-sided p-value doubles the smaller one-sided value (doubling rule, capped at 1) and thus matches the interval. The normal approximation (z) is shown alongside and is reliable only when λ₀·t ≥ 5.' },
          { type: 'definition', term: 'Difference to R', content: 'The function poisson.test in R forms the two-sided p-value by the "minlike" method (all outcomes at most as likely as the observed one). This module doubles the smaller one-sided value instead ("central"). The p-values can therefore differ; the interval is the same.' },
          { type: 'definition', term: '2 rates', content: 'Difference of the rates with a normal-approximation interval (unpooled standard error) and a z-test of the difference. By default the rates are estimated separately; "pooled estimate" uses a common rate and is possible only for the hypothesis "difference = 0". Alongside are the exact conditional test (binomial on x₁ out of x₁ + x₂, central as above) and the ratio of the rates with its interval.' },
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
