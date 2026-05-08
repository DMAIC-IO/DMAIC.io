/**
 * D.Mike — Process Capability Module Handbook (process-capability-help.js)
 * Bilingual help content (DE/EN) for the process capability module.
 */

export default {
  moduleId: 'process-capability',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Die Prozessfähigkeitsanalyse misst, wie gut ein Prozess die Anforderungen des Kunden einhält. Sie vergleicht die natürliche Streuung des Prozesses mit den Spezifikationsgrenzen und drückt das Ergebnis in einer Handvoll Kennzahlen aus. Sie ist ein Kernwerkzeug der Measure- und Control-Phase, um ein objektives Vorher/Nachher-Bild zu liefern.',
          },
          {
            type: 'definition',
            term: 'Cp',
            content: 'Potenzielle Fähigkeit — vergleicht die Breite der Spezifikation (USL − LSL) mit der natürlichen Streuung (6σ). Cp ignoriert die Lage des Mittelwerts; er sagt nur, ob der Prozess theoretisch schmal genug ist.',
          },
          {
            type: 'definition',
            term: 'Cpk',
            content: 'Tatsächliche Fähigkeit — berücksichtigt zusätzlich, wie weit der Mittelwert zur näheren Spezifikationsgrenze steht. Cpk ist immer ≤ Cp. Ein niedriger Cpk bei hohem Cp deutet auf eine Dezentrierung hin.',
          },
          {
            type: 'definition',
            term: 'Pp und Ppk',
            content: 'Long-term-Versionen von Cp und Cpk: Sie verwenden die gesamte Stichprobenstreuung statt der Within-Streuung. Pp/Ppk ist in der Regel schlechter als Cp/Cpk, weil auch Drift und Sonderursachen enthalten sind.',
          },
          {
            type: 'definition',
            term: 'Spezifikationsgrenzen (USL, LSL)',
            content: 'Die vom Kunden oder Konstrukteur vorgegebenen Toleranzgrenzen. Die Prozessfähigkeit ist ein Verhältnis zwischen Prozessverhalten und diesen Grenzen — ohne Spezifikation keine Fähigkeit.',
          },
          {
            type: 'definition',
            term: 'Normalverteilungsannahme',
            content: 'Die klassischen Kennzahlen setzen normalverteilte Daten voraus. Bei schiefen oder mehrgipfligen Daten werden Box-Cox-Transformationen oder nicht-parametrische Varianten (basierend auf Quantilen) benutzt.',
          },
          {
            type: 'paragraph',
            content: 'Orientierungswerte: Cpk < 1,00 = nicht fähig, 1,00–1,33 = knapp, 1,33–1,67 = gut, > 1,67 = sehr gut. In der Automotive-Welt ist 1,33 das Minimum, 1,67 das Ziel.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'Process capability analysis measures how well a process meets the customer\'s requirements. It compares the natural variation of the process to specification limits and expresses the result in a handful of indices. It is a core Measure and Control tool to produce an objective before/after picture.',
          },
          {
            type: 'definition',
            term: 'Cp',
            content: 'Potential capability — compares the specification width (USL − LSL) with natural variation (6σ). Cp ignores the mean\'s location; it only says whether the process is theoretically narrow enough.',
          },
          {
            type: 'definition',
            term: 'Cpk',
            content: 'Actual capability — additionally accounts for how far the mean sits from the nearer spec limit. Cpk is always ≤ Cp. Low Cpk with high Cp signals off-centering.',
          },
          {
            type: 'definition',
            term: 'Pp and Ppk',
            content: 'Long-term versions of Cp and Cpk using overall sample variation instead of within-subgroup variation. Pp/Ppk is usually worse because it includes drift and special causes.',
          },
          {
            type: 'definition',
            term: 'Specification limits (USL, LSL)',
            content: 'Tolerance limits set by the customer or designer. Capability is a ratio between process behavior and these limits — no spec, no capability.',
          },
          {
            type: 'definition',
            term: 'Normality assumption',
            content: 'Classic indices assume normal data. For skewed or multi-modal data, Box-Cox transformations or percentile-based nonparametric variants are used.',
          },
          {
            type: 'paragraph',
            content: 'Rules of thumb: Cpk < 1.00 = not capable, 1.00–1.33 = marginal, 1.33–1.67 = good, > 1.67 = very good. Automotive expects 1.33 as minimum and 1.67 as target.',
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
              'Spezifikationsgrenzen aus Anforderungen, Zeichnung oder Kundenvertrag holen.',
              'Daten sammeln — stabil, repräsentativ, mindestens 30 Werte, idealerweise 100+.',
              'Stabilität prüfen (Regelkarte) — nur ein stabiler Prozess liefert sinnvolle Kennzahlen.',
              'Normalität prüfen (Histogramm, Probability Plot, Shapiro-Wilk). Bei Abweichung Transformation oder nicht-parametrische Methode.',
              'Kennzahlen berechnen (Cp, Cpk, Pp, Ppk) und mit Konfidenzintervall angeben.',
              'Ergebnis grafisch darstellen — Histogramm mit Spezifikationsgrenzen und angepasster Normalkurve.',
              'Interpretation: fähig / nicht fähig / Verschiebung vs. Streuung dominieren.',
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
              'Get specification limits from requirements, drawings, or customer contracts.',
              'Collect data — stable, representative, at least 30 values, ideally 100+.',
              'Check stability (control chart) — only a stable process gives meaningful indices.',
              'Check normality (histogram, probability plot, Shapiro-Wilk). If off, transform or use nonparametric method.',
              'Compute indices (Cp, Cpk, Pp, Ppk) and report with confidence intervals.',
              'Visualize — histogram with spec limits and fitted normal curve.',
              'Interpret: capable / not capable / shift vs. spread dominating.',
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
            term: 'Fähigkeit auf instabilem Prozess berechnet',
            content: 'Kennzahlen aus einem driftenden oder gestörten Prozess sind wertlos — sie spiegeln die aktuelle Momentaufnahme, nicht das tatsächliche Verhalten. Vor jeder Fähigkeitsanalyse zuerst Stabilität sichern.',
          },
          {
            type: 'definition',
            term: 'Nicht-normalverteilte Daten ignoriert',
            content: 'Eine schiefe Verteilung liefert mit klassischen Formeln falsche Cpk-Werte — oft schlechter als die Realität. Vor dem Rechnen Verteilung prüfen und bei Bedarf transformieren.',
          },
          {
            type: 'definition',
            term: 'Zu wenige Daten',
            content: 'Mit 15 Werten ist das Konfidenzintervall für Cpk so breit, dass das Ergebnis bedeutungslos ist. Mindestens 30, besser 100+ Beobachtungen.',
          },
          {
            type: 'definition',
            term: 'Cp hoch, Cpk niedrig',
            content: 'Ein klassischer Fall von Dezentrierung: der Prozess ist schmal genug, aber verschoben. Die Maßnahme ist nicht Streuung reduzieren, sondern den Mittelwert zentrieren.',
          },
          {
            type: 'definition',
            term: 'Nur Cp angeben',
            content: 'Cp ohne Cpk verschleiert die Dezentrierung. Immer beide berichten.',
          },
          {
            type: 'definition',
            term: 'Spezifikation selbst gesetzt',
            content: 'Wenn das eigene Unternehmen die Spezifikation festlegt und dann die eigene Fähigkeit misst, wird die Schwelle gerne so gewählt, dass das Ergebnis „passt". Spezifikation kommt vom Kunden oder der Funktion — nicht vom Analysten.',
          },
          {
            type: 'definition',
            term: 'Cp/Cpk mit Pp/Ppk verwechseln',
            content: 'Cp/Cpk basiert auf Kurzzeitstreuung, Pp/Ppk auf Langzeitstreuung. Beide sind nützlich, aber nicht dasselbe — die Abkürzungen konsequent und passend zum Datensatz verwenden.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Capability on an unstable process',
            content: 'Indices from a drifting or disturbed process are worthless — they reflect the current snapshot, not the real behavior. Secure stability before any capability analysis.',
          },
          {
            type: 'definition',
            term: 'Non-normal data ignored',
            content: 'A skewed distribution plugged into classical formulas yields wrong Cpk values — often worse than reality. Check the distribution first and transform if needed.',
          },
          {
            type: 'definition',
            term: 'Too few data',
            content: 'At n = 15 the confidence interval for Cpk is so wide the result is meaningless. Use at least 30, preferably 100+ observations.',
          },
          {
            type: 'definition',
            term: 'High Cp, low Cpk',
            content: 'The classic off-centered case: the process is narrow enough but shifted. The fix is not to reduce variation but to recenter the mean.',
          },
          {
            type: 'definition',
            term: 'Reporting only Cp',
            content: 'Cp without Cpk hides off-centering. Always report both.',
          },
          {
            type: 'definition',
            term: 'Self-set specifications',
            content: 'When the same company sets the spec and measures its own capability, the threshold tends to be chosen so that the number "fits". Specs come from the customer or function — not from the analyst.',
          },
          {
            type: 'definition',
            term: 'Confusing Cp/Cpk with Pp/Ppk',
            content: 'Cp/Cpk uses short-term variation, Pp/Ppk long-term. Both are useful but not interchangeable — use the acronyms consistently and match them to the dataset.',
          },
        ],
      },
    },
  },
};
