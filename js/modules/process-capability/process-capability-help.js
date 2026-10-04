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
            content: 'Die {{term:prozessfaehigkeit|Prozessfähigkeitsanalyse}} misst, wie gut ein Prozess die Anforderungen des Kunden einhält. Sie vergleicht die {{term:zufallsursache|natürliche Streuung}} des Prozesses mit den Spezifikationsgrenzen und drückt das Ergebnis in einer Handvoll Kennzahlen aus. Sie ist ein Kernwerkzeug der Measure- und Control-Phase, um ein objektives Vorher/Nachher-Bild zu liefern.',
          },
          {
            type: 'definition',
            term: 'Cp',
            content: '{{term:cp|Cp}} — potenzielle Fähigkeit — vergleicht die Breite der Spezifikation (USL − LSL) mit der natürlichen Streuung (6σ). Cp ignoriert die Lage des {{term:mittelwert|Mittelwerts}}; er sagt nur, ob der Prozess theoretisch schmal genug ist. σ ist hier die Streuung innerhalb. Wie Minitab stehen sechs Schätzer zur Wahl: bei Untergruppen die gepoolte Standardabweichung (Standard), R̄/d2 und S̄/c4, bei Einzelwerten die mittlere gleitende Spannweite (Standard), ihr Median und die Wurzel aus MSSD. Die Biaskorrektur (c4 bzw. c4′) lässt sich für gepoolte s, S̄ und √MSSD abschalten. Das Konfidenzintervall von Cp und Cpk nutzt die Freiheitsgrade ν des gewählten Schätzers. Deshalb kommt es auf die Reihenfolge der Werte an.',
          },
          {
            type: 'definition',
            term: 'Cpk',
            content: '{{term:cpk|Cpk}} — tatsächliche Fähigkeit — berücksichtigt zusätzlich, wie weit der Mittelwert zur näheren Spezifikationsgrenze steht. Cpk ist immer ≤ Cp. Ein niedriger Cpk bei hohem Cp deutet auf eine Dezentrierung hin.',
          },
          {
            type: 'definition',
            term: 'Pp und Ppk',
            content: '{{term:pp|Pp}} und {{term:ppk|Ppk}} — Long-term-Versionen von Cp und Cpk: Sie verwenden die gesamte Stichprobenstreuung statt der Within-Streuung. Pp/Ppk ist in der Regel schlechter als Cp/Cpk, weil auch Drift und Sonderursachen enthalten sind.',
          },
          {
            type: 'definition',
            term: 'Sigma-Level (Z.bench) und PPM',
            content: 'Der Sigma-Level ist der Z.bench: der Quantilwert der Standardnormalverteilung zum gesamten erwarteten Anteil außerhalb beider Grenzen, berechnet mit σ innerhalb. Er entspricht 3 · Cpk nur, wenn der Anteil jenseits der ferneren Grenze vernachlässigbar ist. Z.bench gesamt nutzt s; die Six-Sigma-Konvention addiert 1,5σ darauf — eine Vereinbarung, kein Messergebnis. Die Tabelle „Ausschuss (PPM)“ zeigt beobachtete Teile außerhalb der Grenzen sowie die erwarteten Anteile innerhalb und gesamt je Million.',
          },
          {
            type: 'definition',
            term: 'Spezifikationsgrenzen (USL, LSL)',
            content: '{{term:spezifikationsgrenzen|Spezifikationsgrenzen (USL, LSL)}} — die vom Kunden oder Konstrukteur vorgegebenen Toleranzgrenzen. Die Prozessfähigkeit ist ein Verhältnis zwischen Prozessverhalten und diesen Grenzen — ohne Spezifikation keine Fähigkeit.',
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
            content: '{{term:prozessfaehigkeit|Process capability analysis}} measures how well a process meets the customer\'s requirements. It compares the natural variation of the process to specification limits and expresses the result in a handful of indices. It is a core Measure and Control tool to produce an objective before/after picture.',
          },
          {
            type: 'definition',
            term: 'Cp',
            content: '{{term:cp|Cp}} — potential capability — compares the specification width (USL − LSL) with natural variation (6σ). Cp ignores the {{term:mittelwert|mean}}\'s location; it only says whether the process is theoretically narrow enough. σ here is the within variation. As in Minitab there are six estimators: for subgroups the pooled standard deviation (default), R̄/d2 and S̄/c4; for individuals the average moving range (default), its median and the square root of MSSD. The unbiasing constant (c4 or c4′) can be switched off for pooled s, S̄ and √MSSD. The confidence interval of Cp and Cpk uses the degrees of freedom ν of the chosen estimator. That is why the order of the values matters.',
          },
          {
            type: 'definition',
            term: 'Cpk',
            content: '{{term:cpk|Cpk}} — actual capability — additionally accounts for how far the mean sits from the nearer spec limit. Cpk is always ≤ Cp. Low Cpk with high Cp signals off-centering.',
          },
          {
            type: 'definition',
            term: 'Pp and Ppk',
            content: '{{term:pp|Pp}} and {{term:ppk|Ppk}} — long-term versions of Cp and Cpk using overall sample variation instead of within-subgroup variation. Pp/Ppk is usually worse because it includes drift and special causes.',
          },
          {
            type: 'definition',
            term: 'Sigma level (Z.bench) and PPM',
            content: 'The sigma level is Z.bench: the standard normal quantile of the total expected fraction outside both limits, computed with σ within. It equals 3 · Cpk only when the fraction beyond the far limit is negligible. Z.bench overall uses s; the Six Sigma convention adds 1.5σ to it — an agreement, not a measurement. The "Nonconforming (PPM)" table shows observed parts outside the limits and the expected fractions within and overall, per million.',
          },
          {
            type: 'definition',
            term: 'Specification limits (USL, LSL)',
            content: '{{term:spezifikationsgrenzen|Specification limits (USL, LSL)}} — tolerance limits set by the customer or designer. Capability is a ratio between process behavior and these limits — no spec, no capability.',
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
              'Normalität prüfen ({{term:histogramm|Histogramm}}, {{term:wahrscheinlichkeitsnetz|Probability Plot}}, Shapiro-Wilk). Bei Abweichung Transformation oder nicht-parametrische Methode.',
              'Untergruppen festlegen: feste Größe (1 = Einzelwerte) oder eine Spalte mit Untergruppen-IDs — eine neue Untergruppe beginnt, sobald die ID wechselt. Dann den Schätzer für σ innerhalb wählen. Die Werte müssen in Produktionsreihenfolge vorliegen.',
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
              'Check stability ({{term:regelkarte|control chart}}) — only a stable process gives meaningful indices.',
              'Check normality (histogram, probability plot, Shapiro-Wilk). If off, transform or use nonparametric method.',
              'Define the subgroups: a fixed size (1 = individuals) or a column of subgroup IDs — a new subgroup starts whenever the ID changes. Then choose the estimator for σ within. Values must be in production order.',
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
