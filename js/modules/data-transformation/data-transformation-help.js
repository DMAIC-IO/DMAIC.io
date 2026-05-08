/**
 * D.Mike — Data Transformation Module Handbook (data-transformation-help.js)
 * Bilingual help content (DE/EN) for the data transformation module.
 */

export default {
  moduleId: 'data-transformation',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Die Datentransformation rechnet Messwerte mit einer mathematischen Funktion (z. B. ln, √, Box-Cox) um, sodass die transformierten Werte einer Normalverteilung näher kommen. Sinn der Sache ist nicht, „bessere Daten" zu erzeugen, sondern Methoden anwendbar zu machen, die Normalverteilung voraussetzen — etwa Cp/Cpk, I-MR-Karten, t-Test oder lineare Regression.',
          },
          {
            type: 'paragraph',
            content: 'Eine Transformation ist ein Werkzeug, kein Allheilmittel. Sie hilft bei einer bestimmten Klasse von Verteilungsproblemen — und richtet bei einer anderen mehr Schaden als Nutzen an. Die wichtigste Frage lautet daher immer: warum sind die Daten nicht normalverteilt?',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'Data transformation reshapes measurements with a mathematical function (e.g. ln, √, Box-Cox) so that the transformed values come closer to a normal distribution. The point is not to manufacture "better" data, but to make methods applicable that assume normality — Cp/Cpk, I-MR charts, t-tests or linear regression.',
          },
          {
            type: 'paragraph',
            content: 'A transformation is a tool, not a cure-all. It helps with one class of distribution problems and actively harms another. The first question is always: why are the data not normal?',
          },
        ],
      },
    },

    whenToUse: {
      de: {
        title: 'Wann ist eine Transformation sinnvoll?',
        blocks: [
          {
            type: 'paragraph',
            content: 'Transformiere, wenn alle drei Bedingungen erfüllt sind: (1) das nachfolgende Verfahren setzt Normalverteilung voraus, (2) deine Daten sind nachweislich nicht normalverteilt, und (3) die Abweichung erklärt sich aus der Form der Verteilung — nicht aus Ausreißern, Mischungen oder Stratifizierung.',
          },
          {
            type: 'heading',
            content: 'Typische Anwendungsfälle',
          },
          {
            type: 'list',
            items: [
              'Prozessfähigkeit (Cp, Cpk, Pp, Ppk) für rechtsschiefe Größen wie Zykluszeiten, Wartezeiten, Rauheit oder Lebensdauern.',
              'I-MR- oder X̄-S-Karten, wenn die Schiefe systematisch zu falschen Eingriffsgrenzen oder vielen falschen Alarmen führt.',
              'Lineare Regression, wenn die Residuenanalyse Trichterform (Heteroskedastizität) oder Schiefe zeigt — eine Transformation der Zielgröße stabilisiert oft die Varianz.',
              't-Test oder ANOVA bei stark schiefen Daten und kleinen Stichproben, wo das Konfidenzintervall sonst unsymmetrisch verzerrt ist.',
              'Daten mit physikalisch erzwungener unterer Grenze bei null (Konzentrationen, Partikelgrößen, Fehleranzahlen pro Einheit), die auf einer log- oder Wurzelskala natürlich symmetrisch werden.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Faustregel: Wenn der Anderson-Darling- oder Shapiro-Wilk-Test die Normalitätshypothese verwirft UND das Histogramm/Wahrscheinlichkeitsnetz eine klare, einseitige Schiefe zeigt, ist eine Transformation einen Versuch wert.',
          },
        ],
      },
      en: {
        title: 'When is a transformation useful?',
        blocks: [
          {
            type: 'paragraph',
            content: 'Transform when all three conditions hold: (1) the downstream method assumes normality, (2) your data demonstrably are not normal, and (3) the deviation comes from the shape of the distribution — not from outliers, mixtures or stratification.',
          },
          {
            type: 'heading',
            content: 'Typical use cases',
          },
          {
            type: 'list',
            items: [
              'Process capability (Cp, Cpk, Pp, Ppk) for right-skewed measurands like cycle times, waiting times, surface roughness or lifetimes.',
              'I-MR or X̄-S charts, when skewness systematically pushes the control limits and produces frequent false alarms.',
              'Linear regression, when residual analysis shows funnel shape (heteroscedasticity) or skewness — transforming the response often stabilizes variance.',
              't-test or ANOVA on heavily skewed data with small samples, where the confidence interval would otherwise be asymmetrically biased.',
              'Data with a hard physical lower bound at zero (concentrations, particle sizes, defect counts per unit) that become naturally symmetric on a log or square-root scale.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Rule of thumb: if Anderson-Darling or Shapiro-Wilk rejects normality AND the histogram / probability plot shows a clear one-sided skewness, a transformation is worth trying.',
          },
        ],
      },
    },

    whenNotToUse: {
      de: {
        title: 'Wann solltest du NICHT transformieren?',
        blocks: [
          {
            type: 'paragraph',
            content: 'Eine Transformation behebt das Symptom, nicht die Ursache. In den folgenden Situationen verschleiert sie das eigentliche Problem oder löst gar keines:',
          },
          {
            type: 'definition',
            term: 'Daten sind bereits normalverteilt',
            content: 'Dann gibt es nichts zu tun. Eine unnötige Transformation macht die Ergebnisse schwerer interpretierbar, ohne irgendetwas zu verbessern.',
          },
          {
            type: 'definition',
            term: 'Mischverteilung / Stratifizierung',
            content: 'Mehrere Maschinen, Schichten, Chargen oder Materialien in einem Datensatz erzeugen Bimodalität oder Knicke im Wahrscheinlichkeitsnetz. Hier hilft kein λ, sondern das Trennen der Gruppen und die getrennte Auswertung.',
          },
          {
            type: 'definition',
            term: 'Ausreißer und besondere Ursachen',
            content: 'Wenige extreme Werte machen die Verteilung schief, aber sie sind ein Hinweis auf einen gestörten Prozess. Ursache untersuchen und beheben — nicht über eine Transformation „glätten".',
          },
          {
            type: 'definition',
            term: 'Diskrete oder gezählte Daten',
            content: 'Anzahlen, Klassen, Bewertungen oder ja/nein-Daten gehören in attributive Verfahren (p-, np-, c-, u-Karte, Poisson-/Binomial-Verteilung). Eine Box-Cox-Transformation darauf ist methodisch falsch.',
          },
          {
            type: 'definition',
            term: 'Sehr kleine Stichproben (n < 20–30)',
            content: 'Bei wenigen Messwerten ist der Normalitätstest selbst unsicher. Eine Transformation passt sich dann oft an Zufallsrauschen an und überträgt sich nicht auf neue Daten.',
          },
          {
            type: 'definition',
            term: 'Existierende, nicht-parametrische Alternative',
            content: 'Wilcoxon, Mann-Whitney, Kruskal-Wallis, Levene-Test oder eine Kapazitätsanalyse mit der tatsächlich passenden Verteilung (Weibull, Lognormal) liefern meist ehrlichere Ergebnisse als eine erzwungene Normalisierung.',
          },
          {
            type: 'definition',
            term: 'Kommunikation mit Stakeholdern',
            content: 'Spezifikationsgrenzen, Toleranzen und Prozessziele sind in Originaleinheiten definiert. Wenn das Ergebnis von Kunden, Auditoren oder der Produktion verstanden werden muss, wiegt die Verständlichkeit oft schwerer als ein paar Zehntel im Cpk.',
          },
          {
            type: 'paragraph',
            content: 'Kurzregel: Transformiere nie, ohne vorher das Histogramm angeschaut zu haben. Wenn du dort zwei Berge, einen langen Schwanz aus drei Punkten oder eine Treppe aus diskreten Werten siehst, ist die Transformation die falsche Antwort.',
          },
        ],
      },
      en: {
        title: 'When should you NOT transform?',
        blocks: [
          {
            type: 'paragraph',
            content: 'A transformation treats the symptom, not the cause. In the following situations it hides the real problem or solves nothing at all:',
          },
          {
            type: 'definition',
            term: 'Data are already normal',
            content: 'Then there is nothing to do. An unnecessary transformation makes results harder to interpret without improving anything.',
          },
          {
            type: 'definition',
            term: 'Mixed populations / stratification',
            content: 'Several machines, shifts, batches or materials in one dataset cause bimodality or kinks in the probability plot. No λ helps here — split the groups and analyse them separately.',
          },
          {
            type: 'definition',
            term: 'Outliers and special causes',
            content: 'A few extreme values can skew the distribution, but they signal a disturbed process. Investigate and fix the root cause; do not "smooth them away" with a transformation.',
          },
          {
            type: 'definition',
            term: 'Discrete or count data',
            content: 'Counts, categories, ratings or pass/fail data belong to attribute methods (p-, np-, c-, u-charts, Poisson/binomial distribution). Applying Box-Cox to them is methodologically wrong.',
          },
          {
            type: 'definition',
            term: 'Very small samples (n < 20–30)',
            content: 'With few observations the normality test itself is unreliable. A transformation then easily fits the random noise and does not generalize to new data.',
          },
          {
            type: 'definition',
            term: 'A non-parametric alternative exists',
            content: 'Wilcoxon, Mann-Whitney, Kruskal-Wallis, Levene or a capability analysis using the actually fitting distribution (Weibull, Lognormal) usually deliver more honest results than a forced normalization.',
          },
          {
            type: 'definition',
            term: 'Communication with stakeholders',
            content: 'Specification limits, tolerances and process targets are defined in original units. If the result has to be understood by customers, auditors or production, intelligibility usually outweighs gaining a few decimals in Cpk.',
          },
          {
            type: 'paragraph',
            content: 'Short rule: never transform without first looking at the histogram. If you see two peaks, a long tail of three points, or a stair-step pattern from discrete values, transformation is the wrong answer.',
          },
        ],
      },
    },

    methodology: {
      de: {
        title: 'Verfügbare Transformationen',
        blocks: [
          {
            type: 'definition',
            term: 'Box-Cox',
            content: '(x^λ − 1) / λ mit automatisch optimiertem λ. Funktioniert nur für strikt positive Daten. Sehr universell für rechtsschiefe Größen — die häufigste Wahl in der Praxis.',
          },
          {
            type: 'definition',
            term: 'Yeo-Johnson',
            content: 'Erweiterung von Box-Cox, die auch null und negative Werte zulässt. Die richtige Wahl, wenn die Daten Vorzeichen wechseln können.',
          },
          {
            type: 'definition',
            term: 'Logarithmus (ln, log₁₀)',
            content: 'Spezialfall von Box-Cox mit λ = 0. Klassisch für Lebensdauern, Konzentrationen und Größen, die sich multiplikativ verhalten. Erfordert positive Werte.',
          },
          {
            type: 'definition',
            term: 'Quadratwurzel',
            content: 'Mildere Korrektur für leicht rechtsschiefe Daten oder Zähldaten (Poisson-ähnlich). Werte ≥ 0 nötig.',
          },
          {
            type: 'definition',
            term: 'Inverse (1/x)',
            content: 'Sehr starke Stauchung, geeignet für extrem rechtsschiefe Daten. Werte dürfen nicht null sein und das Vorzeichen kehrt sich um — die Interpretation wird unhandlich.',
          },
          {
            type: 'definition',
            term: 'Quadrat (x²)',
            content: 'Streckt rechte und staucht linke Seite — nützlich für linksschiefe Verteilungen, in der Praxis aber selten benötigt.',
          },
          {
            type: 'definition',
            term: 'Johnson-System (SU, SB, SL)',
            content: 'Familie sehr flexibler Transformationen, die nahezu jede stetige Verteilung normal machen kann. Stark, aber komplex und schwer zu kommunizieren — sinnvoll, wenn Box-Cox/Yeo-Johnson nicht ausreichen.',
          },
        ],
      },
      en: {
        title: 'Available transformations',
        blocks: [
          {
            type: 'definition',
            term: 'Box-Cox',
            content: '(x^λ − 1) / λ with automatically optimized λ. Works only for strictly positive data. Very general-purpose for right-skewed measurands — the most common choice in practice.',
          },
          {
            type: 'definition',
            term: 'Yeo-Johnson',
            content: 'Extension of Box-Cox that also accepts zero and negative values. The right choice when the data can change sign.',
          },
          {
            type: 'definition',
            term: 'Logarithm (ln, log₁₀)',
            content: 'Special case of Box-Cox with λ = 0. Classic for lifetimes, concentrations and quantities that behave multiplicatively. Requires positive values.',
          },
          {
            type: 'definition',
            term: 'Square root',
            content: 'Milder correction for slightly right-skewed data or count data (Poisson-like). Values ≥ 0 required.',
          },
          {
            type: 'definition',
            term: 'Inverse (1/x)',
            content: 'Very strong compression, suitable for extremely right-skewed data. Values must be non-zero and the sign flips — interpretation becomes awkward.',
          },
          {
            type: 'definition',
            term: 'Square (x²)',
            content: 'Stretches the right and compresses the left side — useful for left-skewed distributions, but rarely needed in practice.',
          },
          {
            type: 'definition',
            term: 'Johnson system (SU, SB, SL)',
            content: 'Family of very flexible transformations that can normalize almost any continuous distribution. Powerful but complex and hard to communicate — sensible when Box-Cox/Yeo-Johnson are not enough.',
          },
        ],
      },
    },

    workflow: {
      de: {
        title: 'Vorgehen Schritt für Schritt',
        blocks: [
          {
            type: 'list',
            items: [
              'Histogramm und Wahrscheinlichkeitsnetz der Originaldaten anschauen — Form, Schiefe und mögliche Mischungen erkennen.',
              'Stratifizierung, Ausreißer und Datenfehler ausschließen, bevor irgendetwas transformiert wird.',
              'Passende Transformation wählen: positive Daten und Schiefe → Box-Cox; Vorzeichenwechsel → Yeo-Johnson; theoretisch begründet (z. B. Lebensdauern) → Logarithmus.',
              'Bei Box-Cox/Yeo-Johnson die automatische λ-Optimierung verwenden.',
              'Transformierte Daten erneut prüfen: Histogramm, Wahrscheinlichkeitsnetz, Anderson-Darling/Shapiro-Wilk.',
              'Folgeauswertung (Cpk, Regelkarte, Test) mit den transformierten Werten durchführen.',
              'Ergebnisse für die Kommunikation in die Originaleinheit zurücktransformieren — Spezifikationsgrenzen mitführen.',
            ],
          },
        ],
      },
      en: {
        title: 'Step-by-step workflow',
        blocks: [
          {
            type: 'list',
            items: [
              'Inspect histogram and probability plot of the original data — identify shape, skewness and possible mixtures.',
              'Rule out stratification, outliers and data errors before transforming anything.',
              'Pick a suitable transformation: positive data with skew → Box-Cox; sign changes → Yeo-Johnson; theoretically motivated (e.g. lifetimes) → logarithm.',
              'For Box-Cox / Yeo-Johnson use the automatic λ optimization.',
              'Re-check the transformed data: histogram, probability plot, Anderson-Darling / Shapiro-Wilk.',
              'Run the downstream analysis (Cpk, control chart, test) on the transformed values.',
              'Back-transform results into the original unit for communication — carry the specification limits along.',
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
            type: 'list',
            items: [
              'Negative oder null-Werte mit Box-Cox/Logarithmus: kein Ergebnis. Stattdessen Yeo-Johnson verwenden oder eine Verschiebung explizit dokumentieren.',
              'λ manuell setzen: führt fast immer zu schlechteren Ergebnissen als die automatische Optimierung — und überdeckt oft, dass die Daten gar nicht transformierbar sind.',
              'Spezifikationsgrenzen vergessen mitzutransformieren: Cpk auf transformierten Daten ist sinnlos, wenn USL/LSL noch in der Originaleinheit stehen.',
              'Erfolgsmeldung „p > 0,05" überschätzen: Ein bestandener Normalitätstest auf transformierten Daten heißt nicht, dass die Modellannahmen für das Folgeverfahren wirklich erfüllt sind. Residuen weiterhin prüfen.',
              'Eine Transformation als „Datenkorrektur" verkaufen: Transformation ändert nicht die Werte, sondern die Skala. Das muss bei Auditierung, Reporting und Rückverfolgbarkeit klar kommuniziert werden.',
              'Auf jede neue Charge dasselbe λ anwenden: Wenn sich der Prozess ändert, ändert sich auch die optimale Transformation. Regelmäßig nachkalibrieren.',
            ],
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'list',
            items: [
              'Negative or zero values with Box-Cox / logarithm: no result. Use Yeo-Johnson instead, or document an explicit shift.',
              'Setting λ manually: almost always produces worse results than the automatic optimization — and often hides the fact that the data are not transformable at all.',
              'Forgetting to transform the specification limits: a Cpk on transformed data is meaningless if USL/LSL still live in the original unit.',
              'Over-claiming "p > 0.05": passing a normality test on transformed data does not mean the modelling assumptions of the downstream method are truly met. Continue to inspect residuals.',
              'Selling a transformation as a "data correction": a transformation does not change the values, it changes the scale. This must be communicated clearly for audits, reporting and traceability.',
              'Reusing the same λ for every new batch: when the process changes, the optimal transformation changes too. Re-calibrate regularly.',
            ],
          },
        ],
      },
    },
  },
};
