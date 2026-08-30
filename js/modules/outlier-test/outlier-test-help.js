/**
 * D.Mike — Outlier Test Module Handbook (outlier-test-help.js)
 * Bilingual help content (DE/EN) for the outlier test module.
 */

export default {
  moduleId: 'outlier-test',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Ein Ausreißertest prüft, ob einzelne Beobachtungen so weit vom Rest der Daten entfernt liegen, dass sie nicht aus derselben Verteilung stammen können — sondern z. B. auf Messfehler, Eingabefehler oder einen veränderten Prozesszustand zurückgehen. Das Modul rechnet mehrere klassische Verfahren parallel und stellt deren Verdikt nebeneinander, weil kein einziges Verfahren in allen Situationen optimal ist.',
          },
          {
            type: 'definition',
            term: 'Ausreißer',
            content: 'Ein Datenpunkt, der signifikant von den übrigen Beobachtungen abweicht. Achtung: Ein Ausreißer ist nicht automatisch „falsch" — manchmal ist er das Wertvollste in den Daten, weil er auf einen unerwarteten Effekt hinweist.',
          },
          {
            type: 'definition',
            term: 'Grubbs-Test',
            content: 'Sucht den am stärksten vom {{term:mittelwert|Mittelwert}} abweichenden Punkt und prüft per t-Verteilung, ob diese Abweichung mit Normalverteilung verträglich ist. Klassischer Einzel-Ausreißer-Test, n ≥ 3, setzt Normalverteilung voraus.',
          },
          {
            type: 'definition',
            term: 'Dixon Q-Test',
            content: 'Vergleicht den verdächtigen Wert mit seinem Nachbarn relativ zur {{term:spannweite|Spannweite}}. Tabelliert für n = 3..30. Sehr beliebt in der Analytik (DIN 53804) bei kleinen Stichproben.',
          },
          {
            type: 'definition',
            term: 'Generalized ESD (Rosner 1983)',
            content: 'Iteratives Verfahren, das bis zu k Ausreißer gleichzeitig identifiziert — ohne das „Maskierungsproblem" einzelner Tests, bei dem ein extremer Wert einen zweiten verdeckt. Empfohlen, wenn mehrere Ausreißer vermutet werden.',
          },
          {
            type: 'definition',
            term: 'Tukey IQR-Regel',
            content: 'Markiert Punkte unterhalb Q1 − k·IQR oder oberhalb Q3 + k·IQR (Standard k = 1,5; „extreme" Ausreißer bei k = 3). Verteilungsfrei, robust, und entspricht den Whiskers im {{term:boxplot|Boxplot}}.',
          },
          {
            type: 'definition',
            term: 'Hampel-Identifier',
            content: 'Wie der Z-Score, aber auf {{term:median|Median}} und MAD (Median Absolute Deviation) statt Mittelwert und {{term:standardabweichung|Standardabweichung}}. Robust gegen die Verzerrung, die echte Ausreißer auf x̄ und s ausüben — ideal für „verseuchte" Daten.',
          },
          {
            type: 'definition',
            term: 'Z-Score und Modified Z-Score',
            content: 'Z = (xᵢ − x̄)/s, Schwelle typisch 3. Achtung: Mittelwert und Standardabweichung werden selbst durch Ausreißer verzerrt („Maskierung"). Der Modified Z-Score (Iglewicz & Hoaglin 1993) nutzt Median und MAD und ist robuster — Schwelle typisch 3,5.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'An outlier test checks whether individual observations deviate so far from the rest of the data that they cannot plausibly come from the same distribution — and may instead reflect measurement errors, data entry errors, or a changed process state. The module runs several classical procedures in parallel and compares their verdicts side by side, because no single test is optimal in all situations.',
          },
          {
            type: 'definition',
            term: 'Outlier',
            content: 'A data point that deviates significantly from the rest. Caveat: an outlier is not automatically "wrong" — sometimes it is the most valuable observation in the dataset because it flags an unexpected effect.',
          },
          {
            type: 'definition',
            term: 'Grubbs\' Test',
            content: 'Identifies the point most distant from the {{term:mittelwert|mean}} and checks via the t-distribution whether that distance is compatible with normality. Classical single-outlier test, n ≥ 3, requires normality.',
          },
          {
            type: 'definition',
            term: 'Dixon Q Test',
            content: 'Compares the suspected value to its neighbour, scaled by the range. Tabulated for n = 3..30. Very common in analytical chemistry (DIN 53804) for small samples.',
          },
          {
            type: 'definition',
            term: 'Generalized ESD (Rosner 1983)',
            content: 'Iterative procedure that identifies up to k outliers simultaneously — avoiding the "masking" effect of single-step tests where one extreme value can hide a second. Recommended when multiple outliers are suspected.',
          },
          {
            type: 'definition',
            term: 'Tukey IQR Rule',
            content: 'Flags points below Q1 − k·IQR or above Q3 + k·IQR (default k = 1.5; "extreme" outliers at k = 3). Distribution-free, robust, and matches the whiskers in a boxplot.',
          },
          {
            type: 'definition',
            term: 'Hampel Identifier',
            content: 'Like the Z-score but using the {{term:median|median}} and MAD (Median Absolute Deviation) in place of mean and {{term:standardabweichung|standard deviation}}. Robust against the bias that real outliers exert on x̄ and s — ideal for "contaminated" data.',
          },
          {
            type: 'definition',
            term: 'Z-score and Modified Z-score',
            content: 'Z = (xᵢ − x̄)/s, typical threshold 3. Beware: mean and standard deviation are themselves distorted by outliers ("masking"). The Modified Z-score (Iglewicz & Hoaglin 1993) uses median and MAD and is more robust — typical threshold 3.5.',
          },
        ],
      },
    },

    methodology: {
      de: {
        title: 'Vorgehen',
        blocks: [
          {
            type: 'list',
            items: [
              'Erst visuell prüfen — Boxplot oder Individual-Value-Plot zeigt sofort, ob es überhaupt verdächtige Punkte gibt.',
              'Spalte mit numerischen Daten wählen (mindestens n ≥ 3, für Generalized ESD eher n ≥ 15).',
              'Verfahren aktivieren, die zur Datensituation passen: kleine Stichprobe → Dixon Q oder Grubbs; mehrere Ausreißer vermutet → Generalized ESD; verteilungsfrei → Tukey IQR oder Hampel.',
              '{{term:signifikanzniveau|Signifikanzniveau}} α (typisch 0,05) und Schwellen festlegen — Tukey-Faktor 1,5 (potenziell) bzw. 3 (extrem), Hampel k = 3, Z-Score 3, Modified Z 3,5.',
              'Ergebnisse vergleichen: Stimmen mehrere Verfahren überein, ist das Urteil belastbar; widersprechen sie sich, lohnt der Blick auf die Verteilung.',
              'Niemals automatisch löschen — Ursache eines Ausreißers untersuchen (Messfehler, Prozessstörung, neuer Effekt) und dokumentieren, was gemacht wurde.',
              'Bei Bedarf Analyse mit und ohne markierte Punkte rechnen und die Robustheit der Schlussfolgerung bewerten.',
            ],
          },
        ],
      },
      en: {
        title: 'Approach',
        blocks: [
          {
            type: 'list',
            items: [
              'Look first — a boxplot or individual-value plot immediately shows whether any points look suspect at all.',
              'Pick a numeric column (at least n ≥ 3; for Generalized ESD prefer n ≥ 15).',
              'Enable methods that fit the data: small sample → Dixon Q or Grubbs; multiple outliers suspected → Generalized ESD; distribution-free → Tukey IQR or Hampel.',
              'Set the significance level α (typical 0.05) and the thresholds — Tukey factor 1.5 (potential) or 3 (extreme), Hampel k = 3, Z-score 3, Modified Z 3.5.',
              'Compare results: when several methods agree the verdict is robust; when they disagree, inspect the distribution.',
              'Never delete automatically — investigate the {{term:ursachenanalyse|root cause}} of any outlier (measurement error, process disturbance, real new effect) and document what was done.',
              'If in doubt, run the downstream analysis both with and without the flagged points and evaluate how sensitive the conclusion is.',
            ],
          },
        ],
      },
    },

    pitfalls: {
      de: {
        title: 'Stolperfallen',
        blocks: [
          {
            type: 'definition',
            term: 'Ausreißer einfach löschen',
            content: 'Ein Ausreißer ist eine Information, kein Datendefekt. Vor dem Entfernen prüfen, ob es einen physikalischen, messtechnischen oder organisatorischen Grund gibt. Andernfalls verfälscht man die Analyse selbst.',
          },
          {
            type: 'definition',
            term: 'Maskierungsproblem',
            content: 'Zwei extreme Werte können sich gegenseitig „verstecken": Mittelwert und Standardabweichung wachsen mit, der einzelne Z-Score wird unauffällig. Lösung: Generalized ESD oder robuste Verfahren (Hampel, Modified Z) verwenden.',
          },
          {
            type: 'definition',
            term: 'Swamping-Problem',
            content: 'Das Gegenteil: Ein einzelner extremer Punkt zieht x̄ und s so weit, dass auch unverdächtige Punkte als Ausreißer markiert werden. Auch hier helfen robuste Verfahren.',
          },
          {
            type: 'definition',
            term: 'Grubbs auf nicht-normale Daten',
            content: 'Bei schiefen oder schwerendigen Verteilungen liefert Grubbs zu viele falsch positive Treffer. Vorher Normalverteilung prüfen — sonst auf Hampel oder Tukey IQR ausweichen.',
          },
          {
            type: 'definition',
            term: 'Dixon außerhalb von n = 3..30',
            content: 'Die Dixon-Tabellen sind nur für kleine Stichproben gültig. Für n > 30 stattdessen Grubbs (Normalverteilung) oder Generalized ESD verwenden.',
          },
          {
            type: 'definition',
            term: 'Mehrfachtests ohne Korrektur',
            content: 'Wer alle Punkte einer großen Stichprobe einzeln auf Ausreißer testet, findet bei α = 0,05 im Schnitt 5 % „Ausreißer" rein zufällig. Generalized ESD korrigiert das pro Schritt — Einzeltests nicht.',
          },
          {
            type: 'definition',
            term: 'Z-Score auf wenige Daten',
            content: 'Bei n < 30 ist die Schätzung von s instabil; ein einzelner extremer Punkt verzerrt den Z-Score so stark, dass er sich selbst „normal" rechnet. Modified Z (MAD-basiert) ist hier zuverlässiger.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Just deleting outliers',
            content: 'An outlier is information, not a data defect. Before removing, check whether there is a physical, measurement, or organisational cause. Otherwise you bias the analysis yourself.',
          },
          {
            type: 'definition',
            term: 'Masking',
            content: 'Two extreme values can hide each other: mean and standard deviation grow with them, and the individual Z-score looks ordinary. Fix: use Generalized ESD or robust methods (Hampel, Modified Z).',
          },
          {
            type: 'definition',
            term: 'Swamping',
            content: 'The opposite: a single extreme point pulls x̄ and s so far that ordinary points are flagged as outliers too. Robust methods help here as well.',
          },
          {
            type: 'definition',
            term: 'Grubbs on non-normal data',
            content: 'On skewed or heavy-tailed distributions Grubbs produces too many false positives. {{term:normalitaetstest|Test for normality}} first — otherwise switch to Hampel or Tukey IQR.',
          },
          {
            type: 'definition',
            term: 'Dixon outside n = 3..30',
            content: 'Dixon tables are valid for small samples only. For n > 30 use Grubbs (under normality) or Generalized ESD.',
          },
          {
            type: 'definition',
            term: 'Multiple testing without correction',
            content: 'Testing every point in a large sample individually at α = 0.05 will flag 5 % as "outliers" by chance. Generalized ESD corrects step by step — naive single tests do not.',
          },
          {
            type: 'definition',
            term: 'Z-score on small samples',
            content: 'For n < 30 the estimate of s is unstable; a single extreme point distorts the Z-score so strongly that it reports itself as "normal". Modified Z (MAD-based) is more reliable here.',
          },
        ],
      },
    },
  },
};
