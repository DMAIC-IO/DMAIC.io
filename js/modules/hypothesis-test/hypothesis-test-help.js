/**
 * D.Mike — Hypothesis Test Module Handbook (hypothesis-test-help.js)
 * Bilingual help content (DE/EN) for the hypothesis test module.
 */

export default {
  moduleId: 'hypothesis-test',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Ein {{term:hypothesentest|Hypothesentest}} prüft, ob eine in den Daten beobachtete Abweichung wirklich ein echter Effekt ist oder durch Zufall entstanden sein könnte. Er ist das zentrale Entscheidungsinstrument der Analyze-Phase — mit ihm lassen sich Aussagen wie „der {{term:mittelwert|Mittelwert}} hat sich verändert" oder „die beiden Maschinen liefern unterschiedliche Qualität" statistisch absichern.',
          },
          {
            type: 'definition',
            term: 'Nullhypothese (H₀)',
            content: 'Die {{term:nullhypothese|Nullhypothese H₀}} ist die „Es ist nichts los"-Annahme. Typisch: „die Mittelwerte sind gleich", „es gibt keinen Unterschied". Der Test versucht, diese Annahme zu widerlegen — er bestätigt sie nie.',
          },
          {
            type: 'definition',
            term: 'Alternativhypothese (H₁)',
            content: 'Die {{term:alternativhypothese|Alternativhypothese H₁}} — die interessante Gegenannahme: „die Mittelwerte unterscheiden sich", „der neue Prozess ist besser". Sie wird akzeptiert, wenn die Daten H₀ widerlegen.',
          },
          {
            type: 'definition',
            term: 'p-Wert',
            content: 'Der {{term:p-wert|p-Wert}} ist die Wahrscheinlichkeit, die beobachteten (oder extremere) Daten zu sehen, wenn H₀ wahr wäre. Klein = H₀ unwahrscheinlich. Übliche Schwelle: p < 0,05 → H₀ verwerfen.',
          },
          {
            type: 'definition',
            term: 'Signifikanzniveau (α)',
            content: 'Das {{term:signifikanzniveau|Signifikanzniveau α}} ist die vorab festgelegte Risikogrenze, H₀ fälschlich zu verwerfen. Meist 0,05 (5 %). α ist eine Entscheidung des Analysten, nicht der Daten.',
          },
          {
            type: 'definition',
            term: 'Fehler 1. und 2. Art',
            content: '{{term:fehler-erster-art|Fehler 1. Art (α)}}: H₀ verwerfen, obwohl sie stimmt — „Alarm ohne Grund". {{term:fehler-zweiter-art|Fehler 2. Art}} (β): H₀ nicht verwerfen, obwohl sie falsch ist — „echten Effekt übersehen". Power = 1 − β.',
          },
          {
            type: 'definition',
            term: 'Teststatistik',
            content: 'Die {{term:teststatistik|Teststatistik}} ist eine aus den Daten berechnete Kennzahl (z. B. t, z, F, χ²), die in eine bekannte Verteilung eingeordnet wird. Aus ihr wird der p-Wert abgeleitet.',
          },
          {
            type: 'paragraph',
            content: 'Die Wahl des richtigen Tests hängt von der Fragestellung (ein Mittelwert, Vergleich zweier Gruppen, mehr als zwei Gruppen?), der Skala (stetig, kategorial) und den Verteilungsannahmen ab. Häufige Tests: 1-Stichproben-t, 2-Stichproben-{{term:t-test|t}}, gepaarter t, {{term:anova|ANOVA}}, Chi-Quadrat, Mann-Whitney (nichtparametrisch).',
          },
          {
            type: 'definition',
            term: 'k-Stichproben-Vergleich (Mittelwerte)',
            content: 'Bei mehr als zwei Gruppen ist die einfaktorielle {{term:anova|Varianzanalyse (One-Way ANOVA)}} das passende Verfahren — sie zerlegt die Gesamtvariation in Anteile zwischen und innerhalb der Gruppen und vergleicht diese über eine F-Statistik. Bei nicht normalverteilten Daten wird automatisch auf den Kruskal-Wallis-Test (rangbasiert; nichtparametrisches Pendant zur {{term:anova|ANOVA}}) gewechselt. Beide Tests sind Omnibus-Tests: sie zeigen, dass mindestens ein Mittelwert abweicht, ohne zu sagen welcher — dafür sind anschließende Post-Hoc-Vergleiche (z. B. Tukey HSD) nötig.',
          },
          {
            type: 'definition',
            term: 'k-Stichproben-Vergleich (Varianzen)',
            content: 'Für die Gleichheit von {{term:varianz|Varianzen}} über mehrere Gruppen stehen zwei Tests bereit: der {{term:varianzhomogenitaet|Bartlett-Test}} (parametrisch, sehr trennscharf bei Normalverteilung, aber empfindlich gegen Abweichungen davon) und der {{term:varianzhomogenitaet|Levene-Test}} (Brown-Forsythe-Variante, robust gegen Nicht-Normalität). Das Modul wählt automatisch je nach Normalverteilungsprüfung.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'A {{term:hypothesentest|hypothesis test}} checks whether an observed deviation in the data is a real effect or could have arisen by chance. It is the central decision instrument of the Analyze phase — used to statistically back up statements like "the {{term:mittelwert|mean}} has changed" or "the two machines deliver different quality".',
          },
          {
            type: 'definition',
            term: 'Null hypothesis (H₀)',
            content: 'The {{term:nullhypothese|null hypothesis H₀}} is the "nothing going on" assumption. Typical: "means are equal", "there is no difference". The test tries to refute it — never to confirm it.',
          },
          {
            type: 'definition',
            term: 'Alternative hypothesis (H₁)',
            content: 'The {{term:alternativhypothese|alternative hypothesis H₁}} is the interesting counter-assumption: "the means differ", "the new process is better". Accepted when data refute H₀.',
          },
          {
            type: 'definition',
            term: 'p-value',
            content: 'The {{term:p-wert|p-value}} is the probability of seeing data this extreme (or more) if H₀ were true. Small = H₀ unlikely. Usual threshold: p < 0.05 → reject H₀.',
          },
          {
            type: 'definition',
            term: 'Significance level (α)',
            content: 'The {{term:signifikanzniveau|significance level α}} — the risk threshold, set in advance, for wrongly rejecting H₀. Usually 0.05 (5%). α is an analyst decision, not a data property.',
          },
          {
            type: 'definition',
            term: 'Type I and Type II errors',
            content: '{{term:fehler-erster-art|Type I (α)}}: reject H₀ when it is true — "{{term:false-alarm-rate|false alarm}}". Type II (β): fail to reject H₀ when it is false — "missed real effect". Power = 1 − β.',
          },
          {
            type: 'definition',
            term: 'Test statistic',
            content: 'The {{term:teststatistik|test statistic}} — a quantity computed from the data (e.g. t, z, F, χ²) placed against a known distribution. From it the p-value is derived.',
          },
          {
            type: 'paragraph',
            content: 'The right test depends on the question (one mean, two groups, more than two?), the scale (continuous, categorical), and distributional assumptions. Common tests: 1-sample t, 2-sample {{term:t-test|t}}, paired t, {{term:anova|ANOVA}}, chi-square, Mann-Whitney (nonparametric).',
          },
          {
            type: 'definition',
            term: 'k-sample comparison (means)',
            content: 'For more than two groups, one-way {{term:anova|analysis of variance (One-Way ANOVA)}} is the appropriate procedure — it decomposes the total variation into between- and within-group components and compares them via an F-statistic. For non-normal data the module automatically switches to the rank-based Kruskal-Wallis test (nonparametric counterpart of {{term:anova|ANOVA}}). Both are omnibus tests: they show that at least one mean differs without identifying which one — that requires follow-up post-hoc comparisons (e.g. Tukey HSD).',
          },
          {
            type: 'definition',
            term: 'k-sample comparison (variances)',
            content: 'For equality of variances across several groups, two tests are available: {{term:varianzhomogenitaet|Bartlett}} (parametric, very powerful under normality but sensitive to departures from it) and {{term:varianzhomogenitaet|Levene}} (Brown-Forsythe variant, robust to non-normality). The module picks automatically based on the normality assessment.',
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
              'Fragestellung präzise formulieren — was will ich eigentlich wissen?',
              'H₀ und H₁ sauber aufschreiben — vor der Datenanalyse.',
              '{{term:signifikanzniveau|Signifikanzniveau α}} festlegen (typisch 0,05) — vor dem Rechnen.',
              'Passenden Test wählen (abhängig von Skala, Gruppenzahl, Verteilung, Unabhängigkeit).',
              'Voraussetzungen prüfen ({{term:normalitaetstest|Normalverteilung}}? gleiche Varianzen? unabhängige Beobachtungen?).',
              'Test rechnen und p-Wert ablesen.',
              'Entscheidung: p < α → H₀ verwerfen; sonst keine Evidenz gegen H₀.',
              'Zusätzlich {{term:effektstaerke|Effektstärke}} und Konfidenzintervall berichten — der p-Wert allein sagt wenig über Größe und Relevanz.',
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
              'State the question precisely — what do I actually want to know?',
              'Write down H₀ and H₁ clearly — before analyzing data.',
              'Set the {{term:signifikanzniveau|significance level α}} (typically 0.05) — before computing.',
              'Choose the right test (based on scale, number of groups, distribution, independence).',
              'Check assumptions ({{term:normalitaetstest|normality}}? equal variances? independent observations?).',
              'Run the test and read the p-value.',
              'Decide: p < α → reject H₀; otherwise no evidence against H₀.',
              'Additionally report {{term:effektstaerke|effect size}} and confidence interval — a p-value alone says little about magnitude and relevance.',
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
            term: '„H₀ akzeptieren" statt „nicht verwerfen"',
            content: 'Ein nicht-signifikantes Ergebnis beweist H₀ nicht — es zeigt nur, dass die Daten nicht reichen, sie zu widerlegen. Abwesenheit von Evidenz ist nicht Evidenz für Abwesenheit.',
          },
          {
            type: 'definition',
            term: '{{term:p-wert|p-Wert}} als {{term:effektstaerke|Effektgröße}} missdeuten',
            content: 'p = 0,001 bedeutet nicht „großer Effekt", sondern nur „sehr unwahrscheinlich unter H₀". Ein p-Wert hängt stark von der Stichprobengröße ab. Effektstärke und Konfidenzintervall zeigen die Größe.',
          },
          {
            type: 'definition',
            term: 'Voraussetzungen nicht geprüft',
            content: 'Ein t-Test auf stark schiefe Daten oder ein ANOVA bei massiv unterschiedlichen Varianzen liefert falsche p-Werte. Mindestens {{term:histogramm|Histogramm}} und Varianzen prüfen, ggf. nichtparametrisch arbeiten.',
          },
          {
            type: 'definition',
            term: 'Mehrfachtests ohne Korrektur',
            content: 'Wer 20 Tests auf zufälligen Daten rechnet, findet im Schnitt einen mit p < 0,05 — ohne echten Effekt. Bei vielen Vergleichen Bonferroni, FDR oder ein besseres Design verwenden.',
          },
          {
            type: 'definition',
            term: 'Nach den Daten die Hypothese formulieren',
            content: 'H₀/H₁ erst nach dem Blick auf die Daten aufzuschreiben, macht aus Exploration einen scheinbar bestätigten Test (p-Hacking). Die Hypothese gehört vor das Experiment.',
          },
          {
            type: 'definition',
            term: 'Signifikant ≠ praktisch relevant',
            content: 'Bei n = 100 000 wird jeder minimale Unterschied signifikant. Vor der Präsentation immer fragen: „Ist die Differenz groß genug, um überhaupt zu handeln?".',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: '"Accept H₀" instead of "fail to reject"',
            content: 'A non-significant result does not prove H₀ — it only shows the data are not enough to refute it. Absence of evidence is not evidence of absence.',
          },
          {
            type: 'definition',
            term: 'Reading the {{term:p-wert|p-value}} as {{term:effektstaerke|effect size}}',
            content: 'p = 0.001 does not mean "large effect", only "very unlikely under H₀". p-values depend heavily on sample size. Effect size and confidence interval show magnitude.',
          },
          {
            type: 'definition',
            term: 'Assumptions not checked',
            content: 'A t-test on strongly skewed data or ANOVA on very unequal variances yields wrong p-values. At least check histogram and variances, switch to nonparametric if needed.',
          },
          {
            type: 'definition',
            term: 'Multiple testing without correction',
            content: 'Running 20 tests on random data produces roughly one with p < 0.05 by chance. For many comparisons use Bonferroni, FDR, or a better design.',
          },
          {
            type: 'definition',
            term: 'Hypothesizing after seeing the data',
            content: 'Writing H₀/H₁ only after looking at the data turns exploration into apparent confirmation (p-hacking). The hypothesis belongs before the experiment.',
          },
          {
            type: 'definition',
            term: 'Significant ≠ practically relevant',
            content: 'At n = 100,000 even the tiniest difference becomes significant. Before presenting always ask: "is the difference big enough to act on?".',
          },
        ],
      },
    },
  },
};
