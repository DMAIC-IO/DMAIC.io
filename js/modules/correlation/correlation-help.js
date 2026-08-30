/**
 * D.Mike — Correlation Module Handbook (correlation-help.js)
 * Bilingual help content (DE/EN) for the correlation analysis module.
 */

export default {
  moduleId: 'correlation',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Die Korrelationsanalyse misst die Stärke und Richtung des linearen Zusammenhangs zwischen zwei stetigen Variablen. Sie ist ein erster Schritt der Analyze-Phase, um zu prüfen, ob zwei Größen überhaupt zusammenhängen — und ob sich eine genauere Untersuchung (z. B. {{term:regression|Regression}}) lohnt.',
          },
          {
            type: 'definition',
            term: 'Pearson-Korrelation (r)',
            content: 'Misst die lineare Stärke zwischen zwei stetigen, normalverteilten Variablen. Werte von −1 bis +1: −1 = perfekter negativer linearer Zusammenhang, 0 = kein linearer Zusammenhang, +1 = perfekter positiver linearer Zusammenhang.',
          },
          {
            type: 'definition',
            term: 'Spearman-Korrelation (ρ)',
            content: 'Rang-basierte Variante, die monotone (nicht zwingend lineare) Zusammenhänge misst. Robuster gegenüber Ausreißern und nicht-normalverteilten Daten — bei schiefen Verteilungen die bessere Wahl.',
          },
          {
            type: 'definition',
            term: 'Kendall-Tau (τ)',
            content: 'Ebenfalls rang-basiert, basiert auf konkordanten und diskordanten Paaren. Bei kleinen Stichproben oft stabiler als Spearman.',
          },
          {
            type: 'definition',
            term: 'p-Wert',
            content: 'Wahrscheinlichkeit, einen Korrelationskoeffizienten dieser Größe (oder größer) zu beobachten, wenn in Wahrheit kein Zusammenhang besteht. p < 0,05 ist die übliche Schwelle für „signifikant".',
          },
          {
            type: 'definition',
            term: 'Streudiagramm',
            content: 'Die wichtigste Begleitgrafik. Eine einzelne Zahl (r oder ρ) kann irreführen — das Diagramm zeigt nichtlineare Muster, Ausreißer und Cluster, die der Koeffizient verschweigt.',
          },
          {
            type: 'paragraph',
            content: 'Zentrale Warnung: Korrelation bedeutet nicht Kausalität. Eine starke Korrelation zwischen zwei Variablen kann auf eine direkte Ursache, eine gemeinsame dritte Ursache, einen Zufall oder eine umgekehrte Wirkung hindeuten. Die Methode beantwortet die Frage „bewegen sie sich gemeinsam?", nicht „verursacht das eine das andere?".',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'Correlation analysis measures the strength and direction of the linear relationship between two continuous variables. It is a first step in the Analyze phase, used to check whether two quantities are related at all — and whether a deeper study (e.g. regression) is worthwhile.',
          },
          {
            type: 'definition',
            term: 'Pearson correlation (r)',
            content: 'Measures linear strength between two continuous, normally distributed variables. Values from −1 to +1: −1 = perfect negative linear, 0 = no linear relation, +1 = perfect positive linear.',
          },
          {
            type: 'definition',
            term: 'Spearman correlation (ρ)',
            content: 'Rank-based variant measuring monotone (not necessarily linear) relations. More robust to outliers and non-normal data — the better choice for skewed distributions.',
          },
          {
            type: 'definition',
            term: 'Kendall tau (τ)',
            content: 'Also rank-based, built on concordant and discordant pairs. Often more stable than Spearman for small samples.',
          },
          {
            type: 'definition',
            term: 'p-value',
            content: 'Probability of observing a correlation coefficient this large (or larger) if in truth no relation exists. p < 0.05 is the usual threshold for "significant".',
          },
          {
            type: 'definition',
            term: 'Scatter plot',
            content: 'The most important companion chart. A single number (r or ρ) can mislead — the plot reveals nonlinear patterns, outliers, and clusters the coefficient hides.',
          },
          {
            type: 'paragraph',
            content: 'Central warning: correlation does not imply causation. A strong correlation may indicate a direct cause, a shared third cause, chance, or reverse direction. The method answers "do they move together?", not "does one cause the other?".',
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
              'Zwei stetige Variablen auswählen, deren Zusammenhang interessiert.',
              '{{term:streudiagramm|Streudiagramm}} erstellen — vor jeder Zahl. Sieht das Bild linear aus, gekrümmt, ohne Muster?',
              'Verteilungsannahme prüfen: bei näherungsweise normalverteilten, linearen Daten Pearson; bei schiefen oder nichtlinearen Daten Spearman/Kendall.',
              'Koeffizienten berechnen und p-Wert beachten.',
              'Bei signifikantem Ergebnis prüfen, ob die Größe praktisch relevant ist (r = 0,15 ist signifikant in großen Stichproben, aber inhaltlich wenig wert).',
              'Ergebnis nie ohne Diagramm präsentieren — und nie mit kausaler Sprache.',
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
              'Pick two continuous variables whose relation interests you.',
              'Make a scatter plot — before any number. Does the picture look linear, curved, or patternless?',
              'Check assumptions: for approximately normal, linear data use Pearson; for skewed or nonlinear data use Spearman/Kendall.',
              'Compute the coefficients and note the p-value.',
              'For a significant result, check whether the magnitude is practically relevant (r = 0.15 is significant in large samples but means little).',
              'Never present the result without a chart — and never with causal language.',
            ],
          },
        ],
      },
    },

    interpretation: {
      de: {
        title: 'Interpretation',
        blocks: [
          {
            type: 'list',
            items: [
              '|r| < 0,3: schwacher Zusammenhang',
              '0,3 ≤ |r| < 0,5: moderater Zusammenhang',
              '0,5 ≤ |r| < 0,7: starker Zusammenhang',
              '|r| ≥ 0,7: sehr starker Zusammenhang',
            ],
          },
          {
            type: 'paragraph',
            content: 'Diese Schwellen sind Faustregeln. In präzisionsorientierten Bereichen (Messtechnik, Physik) erwartet man r > 0,95 — in sozialen oder organisatorischen Daten ist r = 0,4 oft schon ein starkes Signal. Kontext schlägt Tabelle.',
          },
        ],
      },
      en: {
        title: 'Interpretation',
        blocks: [
          {
            type: 'list',
            items: [
              '|r| < 0.3: weak relation',
              '0.3 ≤ |r| < 0.5: moderate relation',
              '0.5 ≤ |r| < 0.7: strong relation',
              '|r| ≥ 0.7: very strong relation',
            ],
          },
          {
            type: 'paragraph',
            content: 'These thresholds are rules of thumb. In precision-oriented domains (metrology, physics) one expects r > 0.95 — in social or organizational data, r = 0.4 is often a strong signal already. Context beats table.',
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
            term: 'Korrelation als Kausalität gelesen',
            content: 'Der Klassiker. „Eiscreme-Verkäufe korrelieren mit Ertrinkungsfällen" — gemeinsame Ursache (Sommer), keine kausale Verbindung. Vor Schlussfolgerungen nach Drittvariablen suchen.',
          },
          {
            type: 'definition',
            term: 'Nichtlinearen Zusammenhang übersehen',
            content: 'Pearson erkennt nur lineare Muster. Eine perfekte U-Kurve liefert r ≈ 0 — das Diagramm zeigt sofort, dass ein Zusammenhang besteht.',
          },
          {
            type: 'definition',
            term: 'Ausreißer dominieren das Ergebnis',
            content: 'Ein einzelner Ausreißer kann r von 0,1 auf 0,8 heben — oder umgekehrt. Vor der Bewertung Ausreißer prüfen und ihre Plausibilität klären.',
          },
          {
            type: 'definition',
            term: 'Signifikant ≠ stark',
            content: 'Bei n = 10 000 ist r = 0,03 statistisch signifikant — und praktisch belanglos. p-Wert und {{term:effektstaerke|Effektstärke}} immer gemeinsam interpretieren.',
          },
          {
            type: 'definition',
            term: 'Falsche Methode für die Verteilung',
            content: 'Pearson auf stark schiefe Daten anwenden ist riskant. Bei Zweifel zusätzlich Spearman berechnen — wenn beide Werte stark abweichen, ist Pearson wahrscheinlich nicht gerechtfertigt.',
          },
          {
            type: 'definition',
            term: 'Sub-Gruppen ignoriert',
            content: 'Ein einzelner {{term:korrelation|Korrelationskoeffizient}} kann zwei gegensätzliche Untergruppen verschmelzen (Simpson-Paradoxon). Bei strukturierten Daten gruppiert plotten und gruppiert berechnen.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Reading correlation as causation',
            content: 'The classic. "Ice-cream sales correlate with drownings" — shared cause (summer), no causal link. Look for confounders before drawing conclusions.',
          },
          {
            type: 'definition',
            term: 'Missing nonlinear relations',
            content: 'Pearson detects only linear patterns. A perfect U curve gives r ≈ 0 — the plot instantly shows the relation exists.',
          },
          {
            type: 'definition',
            term: 'Outliers dominate the result',
            content: 'A single outlier can lift r from 0.1 to 0.8 — or vice versa. Inspect outliers and judge their plausibility before evaluating.',
          },
          {
            type: 'definition',
            term: 'Significant ≠ strong',
            content: 'At n = 10,000, r = 0.03 is statistically significant — and practically irrelevant. Always interpret p-value and effect size together.',
          },
          {
            type: 'definition',
            term: 'Wrong method for the distribution',
            content: 'Applying Pearson to highly skewed data is risky. When in doubt also compute Spearman — if both differ widely, Pearson is probably not justified.',
          },
          {
            type: 'definition',
            term: 'Subgroups ignored',
            content: 'A single coefficient can merge two opposing subgroups (Simpson\'s paradox). For structured data, plot and compute by group.',
          },
        ],
      },
    },
  },
};
