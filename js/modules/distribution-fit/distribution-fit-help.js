/**
 * D.Mike — Distribution Fit Help (distribution-fit-help.js)
 * Bilingual handbook content (DE / EN).
 */

export default {
  de: {
    methodology: {
      title: 'Methodik',
      blocks: [
        {
          type: 'text',
          content: 'Die Verteilungstests (Distribution Fitting) prüfen, welche statistische Verteilung am besten zu einem gegebenen Datensatz passt. Das Modul testet 7 Verteilungen: Normal, Log-Normal, Weibull, Exponential und Gamma (stetig) sowie Poisson und Binomial (diskret).',
        },
        {
          type: 'heading',
          content: 'Ablauf',
        },
        {
          type: 'list',
          items: [
            'Datentyp erkennen: Auto-Erkennung (ganzzahlig → diskret, sonst stetig) oder manuelle Wahl',
            'Parameterschätzung: Maximum-Likelihood / Momentenmethode für jede Verteilung',
            'Goodness-of-Fit: Kolmogorov-Smirnov (stetige) bzw. Chi²-Anpassungstest (diskrete)',
            'Ranking nach p-Wert: höchster p-Wert = beste Anpassung',
            'Normalitäts-Tiefenanalyse: Shapiro-Wilk, Anderson-Darling, Jarque-Bera, D\'Agostino-Pearson',
          ],
        },
        {
          type: 'heading',
          content: 'Getestete Verteilungen',
        },
        {
          type: 'table',
          headers: ['Verteilung', 'Typ', 'Parameter', 'Typische Anwendung'],
          rows: [
            ['Normal', 'Stetig', 'μ, σ', 'Maße, Toleranzen, natürliche Variation'],
            ['Log-Normal', 'Stetig', 'μ_log, σ_log', 'Zykluszeiten, Einkommen, Partikelgrößen'],
            ['Weibull', 'Stetig', 'k, λ', 'Lebensdauer, Ausfallanalyse'],
            ['Exponential', 'Stetig', 'λ', 'Wartezeiten, Ausfallraten'],
            ['Gamma', 'Stetig', 'α, β', 'Wartezeiten, Aggregierte Poissonprozesse'],
            ['Poisson', 'Diskret', 'λ', 'Fehleranzahl, Ereignisse pro Zeiteinheit'],
            ['Binomial', 'Diskret', 'n, p', 'Pass/Fail, Ausschussrate'],
          ],
        },
      ],
    },
    example: {
      title: 'Beispiel',
      blocks: [
        {
          type: 'text',
          content: 'Ein Fertigungsprozess produziert Zykluszeiten in Sekunden. Die Daten zeigen eine Rechtsschiefe — typisch für Log-Normal-Verteilungen.',
        },
        {
          type: 'list',
          items: [
            'Datensatz laden (Beispiel: Zykluszeiten)',
            'Analyse starten → Ranking zeigt Log-Normal als Best Fit',
            'K-S-Test p-Wert > 0.10 → Verteilung passt gut',
            'Normalitäts-Tiefenanalyse zeigt, dass Normal abgelehnt wird',
          ],
        },
        {
          type: 'text',
          content: 'Ergebnis: Für Regelkarten und Fähigkeitsanalysen sollten die Daten log-transformiert werden, bevor Standardmethoden angewendet werden.',
        },
      ],
    },
    interpretation: {
      title: 'Interpretation',
      blocks: [
        {
          type: 'heading',
          content: 'p-Wert-Bewertung',
        },
        {
          type: 'table',
          headers: ['p-Wert', 'Bewertung', 'Empfehlung'],
          rows: [
            ['≥ 0.10', 'Gut', 'Verteilung passt — nicht verwerfen'],
            ['0.05 – 0.10', 'Grenzwertig', 'Mit Vorsicht verwenden, größere Stichprobe empfohlen'],
            ['< 0.05', 'Schlecht', 'Verteilung passt nicht — verwerfen'],
          ],
        },
        {
          type: 'heading',
          content: 'Normalitäts-Konsens',
        },
        {
          type: 'text',
          content: 'Das Modul führt vier spezialisierte Normalitätstests durch und bildet ein Konsens-Urteil. Shapiro-Wilk ist der Goldstandard für kleine Stichproben, Anderson-Darling ist besonders empfindlich in den Verteilungsrändern, Jarque-Bera ist ein asymptotischer Test basierend auf Schiefe und Kurtosis (ideal für n > 30), und D\'Agostino-Pearson zeigt, warum Normalität scheitert (Schiefe vs. Kurtosis).',
        },
      ],
    },
    pitfalls: {
      title: 'Häufige Fehler',
      blocks: [
        {
          type: 'list',
          items: [
            'Zu kleine Stichprobe: GOF-Tests haben geringe Power bei n < 30. Ein nicht-signifikantes Ergebnis bedeutet nicht, dass die Verteilung passt.',
            'Mehrfachtests: 7 Verteilungen werden parallel getestet — der Best Fit kann zufällig gut aussehen. Immer die fachliche Plausibilität prüfen.',
            'Datentyp ignorieren: Poisson/Binomial nur für ganzzahlige Zähldaten sinnvoll. Stetige Daten nicht als diskret testen.',
            'p > 0.05 ≠ Beweis: Ein hoher p-Wert beweist nicht, dass die Verteilung korrekt ist — er sagt nur, dass die Daten nicht dagegen sprechen.',
            'Ausreißer: Einzelne Extremwerte können die Parameterschätzung stark verzerren. Daten vorher auf Ausreißer prüfen.',
          ],
        },
      ],
    },
  },

  en: {
    methodology: {
      title: 'Methodology',
      blocks: [
        {
          type: 'text',
          content: 'Distribution fitting tests which statistical distribution best matches a given dataset. This module tests 7 distributions: Normal, Log-Normal, Weibull, Exponential, and Gamma (continuous) plus Poisson and Binomial (discrete).',
        },
        {
          type: 'heading',
          content: 'Workflow',
        },
        {
          type: 'list',
          items: [
            'Detect data type: auto-detection (all integers → discrete, otherwise continuous) or manual selection',
            'Parameter estimation: Maximum Likelihood / Method of Moments for each distribution',
            'Goodness-of-Fit: Kolmogorov-Smirnov (continuous) or Chi-Squared (discrete)',
            'Ranking by p-value: highest p-value = best fit',
            'Normality deep-dive: Shapiro-Wilk, Anderson-Darling, Jarque-Bera, D\'Agostino-Pearson',
          ],
        },
        {
          type: 'heading',
          content: 'Tested Distributions',
        },
        {
          type: 'table',
          headers: ['Distribution', 'Type', 'Parameters', 'Typical Use'],
          rows: [
            ['Normal', 'Continuous', 'μ, σ', 'Measurements, tolerances, natural variation'],
            ['Log-Normal', 'Continuous', 'μ_log, σ_log', 'Cycle times, income, particle sizes'],
            ['Weibull', 'Continuous', 'k, λ', 'Lifetime, failure analysis'],
            ['Exponential', 'Continuous', 'λ', 'Wait times, failure rates'],
            ['Gamma', 'Continuous', 'α, β', 'Wait times, aggregated Poisson processes'],
            ['Poisson', 'Discrete', 'λ', 'Defect counts, events per time unit'],
            ['Binomial', 'Discrete', 'n, p', 'Pass/Fail, scrap rate'],
          ],
        },
      ],
    },
    example: {
      title: 'Example',
      blocks: [
        {
          type: 'text',
          content: 'A manufacturing process produces cycle times in seconds. The data shows right skewness — typical for log-normal distributions.',
        },
        {
          type: 'list',
          items: [
            'Load dataset (example: cycle times)',
            'Run analysis → ranking shows Log-Normal as best fit',
            'K-S test p-value > 0.10 → distribution fits well',
            'Normality deep-dive shows Normal is rejected',
          ],
        },
        {
          type: 'text',
          content: 'Result: For control charts and capability analysis, data should be log-transformed before applying standard methods.',
        },
      ],
    },
    interpretation: {
      title: 'Interpretation',
      blocks: [
        {
          type: 'heading',
          content: 'p-Value Assessment',
        },
        {
          type: 'table',
          headers: ['p-Value', 'Assessment', 'Recommendation'],
          rows: [
            ['≥ 0.10', 'Good', 'Distribution fits — do not reject'],
            ['0.05 – 0.10', 'Borderline', 'Use with caution, larger sample recommended'],
            ['< 0.05', 'Poor', 'Distribution does not fit — reject'],
          ],
        },
        {
          type: 'heading',
          content: 'Normality Consensus',
        },
        {
          type: 'text',
          content: 'The module runs four specialized normality tests and forms a consensus verdict. Shapiro-Wilk is the gold standard for small samples, Anderson-Darling is especially sensitive in the distribution tails, Jarque-Bera is an asymptotic test based on skewness and kurtosis (ideal for n > 30), and D\'Agostino-Pearson reveals why normality fails (skewness vs. kurtosis).',
        },
      ],
    },
    pitfalls: {
      title: 'Common Pitfalls',
      blocks: [
        {
          type: 'list',
          items: [
            'Small sample size: GOF tests have low power when n < 30. A non-significant result does not mean the distribution fits.',
            'Multiple testing: 7 distributions are tested simultaneously — the best fit may look good by chance. Always check substantive plausibility.',
            'Ignoring data type: Poisson/Binomial only meaningful for integer count data. Do not test continuous data as discrete.',
            'p > 0.05 ≠ proof: A high p-value does not prove the distribution is correct — it only says the data do not contradict it.',
            'Outliers: Individual extreme values can heavily bias parameter estimates. Check for outliers before fitting.',
          ],
        },
      ],
    },
  },
};
