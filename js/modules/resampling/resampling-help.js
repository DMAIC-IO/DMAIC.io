/**
 * D.Mike — Resampling Module Handbook (resampling-help.js)
 * Bilingual help content (DE/EN) for the resampling module.
 */

export default {
  moduleId: 'resampling',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Resampling beantwortet statistische Fragen, indem es die vorhandenen Daten selbst immer wieder neu zieht oder neu zuordnet — statt eine Verteilungsannahme (etwa Normalverteilung) vorauszusetzen. Das Modul bietet zwei Verfahren: den {{term:bootstrap|Bootstrap}} für Konfidenzintervalle beliebiger Kenngrößen und den {{term:permutationstest|Permutationstest}} für Vergleiche von Gruppen {{ref:efron-tibshirani-1993}}.',
          },
          {
            type: 'definition',
            term: 'Wann Resampling?',
            content: 'Wenn für eine Kenngröße keine geschlossene Intervallformel existiert (z. B. {{term:median|Median}}, getrimmter Mittelwert, {{term:ppk|Ppk}}), wenn die Daten deutlich schief sind oder wenn wenige Werte vorliegen und Normalverteilungsannahmen fraglich sind.',
          },
          {
            type: 'list',
            items: [
              '1 Stichprobe: Konfidenzintervall der Kenngröße, optional Entscheidung gegen einen Sollwert.',
              '2 Stichproben: Intervall für Differenz oder Verhältnis, dazu ein Permutationstest.',
              'Gepaart: Intervall und Vorzeichen-Permutationstest der Differenzen (Vorher/Nachher).',
              'k Stichproben: globaler Permutationstest, Intervall je Gruppe und Paarvergleiche mit Holm-Korrektur.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Gerechnet wird nur auf Knopfdruck. Ändern sich Daten oder Einstellungen, markiert das Modul das Ergebnis als veraltet, statt sofort neu zu rechnen. Mit demselben Startwert (Seed) liefert jede Berechnung exakt dasselbe Ergebnis.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'Resampling answers statistical questions by redrawing or reassigning the observed data over and over — instead of assuming a distribution such as the normal. The module offers two methods: the {{term:bootstrap|bootstrap}} for confidence intervals of any statistic and the {{term:permutationstest|permutation test}} for comparing groups {{ref:efron-tibshirani-1993}}.',
          },
          {
            type: 'definition',
            term: 'When to resample?',
            content: 'When a statistic has no closed-form interval (e.g. {{term:median|median}}, trimmed mean, {{term:ppk|Ppk}}), when the data are clearly skewed, or when there are few values and normality assumptions are doubtful.',
          },
          {
            type: 'list',
            items: [
              '1 sample: confidence interval of the statistic, optional decision against a target value.',
              '2 samples: interval for the difference or ratio, plus a permutation test.',
              'Paired: interval and sign-flip permutation test of the differences (before/after).',
              'k samples: global permutation test, an interval per group and pairwise comparisons with Holm correction.',
            ],
          },
          {
            type: 'paragraph',
            content: 'The module computes only when you click the button. When data or settings change it marks the result as outdated instead of recomputing right away. The same seed always reproduces exactly the same result.',
          },
        ],
      },
    },
    methodology: {
      de: {
        title: 'Methodik',
        blocks: [
          {
            type: 'definition',
            term: 'Bootstrap',
            content: 'Aus den n Werten werden B-mal n Werte mit Zurücklegen gezogen; jedes Mal wird die Kenngröße berechnet. Die Streuung dieser Replikate schätzt den Standardfehler, ihr Mittel minus θ̂ die {{term:bias|Verzerrung}}. Bei zwei Stichproben wird jede Gruppe für sich gezogen, bei gepaarten Daten die Differenzen {{ref:davison-hinkley-1997}}.',
          },
          {
            type: 'definition',
            term: 'Perzentil- und BCa-Intervall',
            content: 'Das Perzentil-Intervall nimmt die α/2- und 1−α/2-Quantile der Replikate. Das {{term:bca-intervall|BCa-Intervall}} (Standard) korrigiert diese Quantile um Verzerrung (z₀) und Beschleunigung (a, aus dem Jackknife) und hält das Konfidenzniveau bei schiefen Kenngrößen deutlich besser ein {{ref:efron-tibshirani-1993}}. Lässt sich BCa nicht bestimmen — etwa wenn alle Replikate gleich sind —, zeigt das Modul das Perzentil-Intervall und weist darauf hin.',
          },
          {
            type: 'definition',
            term: 'Permutationstest',
            content: 'Unter der {{term:nullhypothese|Nullhypothese}} sind die Gruppenzugehörigkeiten austauschbar. Der Test ordnet die Werte B-mal zufällig neu den Gruppen zu (gepaart: zufällige Vorzeichen der Differenzen) und zählt, wie oft die {{term:teststatistik|Teststatistik}} mindestens so extrem ist wie beobachtet. {{term:p-wert|p-Wert}} = (1 + Anzahl) / (B + 1). Gibt es höchstens 20 000 verschiedene Zuordnungen, werden alle durchgezählt und der p-Wert ist exakt {{ref:good-2005}}.',
          },
          {
            type: 'definition',
            term: 'k Stichproben',
            content: 'Globale Teststatistik T = Σ nᵢ (θ̂ᵢ − θ̂)², θ̂ aus allen Daten zusammen; beim Mittelwert ist das die Quadratsumme zwischen den Gruppen der {{term:anova|ANOVA}}. Danach folgen alle Paarvergleiche als Zwei-Stichproben-Permutationstests; ihre p-Werte werden nach Holm korrigiert {{ref:good-2005}}.',
          },
          {
            type: 'definition',
            term: 'Ppk mit Konfidenzintervall',
            content: 'Für {{term:ppk|Ppk}} ist das Bootstrap-Intervall der übliche Weg zu einer Unsicherheitsangabe ohne Normalverteilungsformel. Es braucht mindestens 10 Werte je Stichprobe und mindestens eine Toleranzgrenze.',
          },
        ],
      },
      en: {
        title: 'Methodology',
        blocks: [
          {
            type: 'definition',
            term: 'Bootstrap',
            content: 'B times, n values are drawn with replacement from the n observations and the statistic is computed each time. The spread of these replicates estimates the standard error, their mean minus θ̂ the {{term:bias|bias}}. With two samples each group is resampled on its own, with paired data the differences {{ref:davison-hinkley-1997}}.',
          },
          {
            type: 'definition',
            term: 'Percentile and BCa interval',
            content: 'The percentile interval takes the α/2 and 1−α/2 quantiles of the replicates. The {{term:bca-intervall|BCa interval}} (default) adjusts these quantiles for bias (z₀) and acceleration (a, from the jackknife) and keeps the confidence level much better for skewed statistics {{ref:efron-tibshirani-1993}}. When BCa cannot be determined — for example when all replicates are equal — the module shows the percentile interval and says so.',
          },
          {
            type: 'definition',
            term: 'Permutation test',
            content: 'Under the {{term:nullhypothese|null hypothesis}} group labels are exchangeable. The test reassigns the values to the groups B times at random (paired: random signs of the differences) and counts how often the {{term:teststatistik|test statistic}} is at least as extreme as observed. {{term:p-wert|p-value}} = (1 + count) / (B + 1). With at most 20,000 distinct assignments all of them are enumerated and the p-value is exact {{ref:good-2005}}.',
          },
          {
            type: 'definition',
            term: 'k samples',
            content: 'Global test statistic T = Σ nᵢ (θ̂ᵢ − θ̂)², θ̂ from all data pooled; for the mean this is the between-groups sum of squares of the {{term:anova|ANOVA}}. All pairwise comparisons follow as two-sample permutation tests, their p-values Holm-adjusted {{ref:good-2005}}.',
          },
          {
            type: 'definition',
            term: 'Ppk with a confidence interval',
            content: 'For {{term:ppk|Ppk}} the bootstrap interval is the usual way to state uncertainty without a normal-theory formula. It needs at least 10 values per sample and at least one spec limit.',
          },
        ],
      },
    },
    pitfalls: {
      de: {
        title: 'Stolpersteine',
        blocks: [
          {
            type: 'definition',
            term: 'Zu wenige Daten',
            content: 'Der Bootstrap kann nur zeigen, was in den Daten steckt. Bei sehr kleinen Stichproben (unter etwa 10 Werten) sind Intervalle zu schmal, besonders für Median, Quantile und Ppk — das Konfidenzniveau wird dann nicht eingehalten.',
          },
          {
            type: 'definition',
            term: 'Abhängige Werte',
            content: 'Bootstrap und Permutationstest setzen unabhängige Werte voraus. Zeitlich korrelierte Prozessdaten (Drift, Autokorrelation) liefern zu enge Intervalle. Vorher/Nachher-Messungen an denselben Teilen gehören in den Modus „Gepaart“.',
          },
          {
            type: 'definition',
            term: 'Seed als Stellschraube',
            content: 'Einen Seed so lange zu wechseln, bis das Ergebnis gefällt, ist eine Form von p-Hacking. Seed vor der Analyse festlegen; schwankt das Ergebnis zwischen Seeds spürbar, B erhöhen.',
          },
          {
            type: 'definition',
            term: 'Permutationstest prüft Austauschbarkeit',
            content: 'Ein kleiner p-Wert heißt: Die Gruppen sind nicht austauschbar. Unterscheiden sich die Gruppen stark in der Streuung, kann das auch bei gleichem Median zu kleinen p-Werten führen. Das Intervall des Kontrasts zeigt, wie groß der Unterschied der gewählten Kenngröße ist.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Too little data',
            content: 'The bootstrap can only show what is in the data. With very small samples (below about 10 values) intervals are too narrow, especially for the median, quantiles and Ppk — the confidence level is then not kept.',
          },
          {
            type: 'definition',
            term: 'Dependent values',
            content: 'Bootstrap and permutation test assume independent values. Time-correlated process data (drift, autocorrelation) give intervals that are too narrow. Before/after measurements on the same parts belong in the "Paired" mode.',
          },
          {
            type: 'definition',
            term: 'The seed as a tuning knob',
            content: 'Changing the seed until the result looks right is a form of p-hacking. Fix the seed before the analysis; if results move noticeably between seeds, increase B.',
          },
          {
            type: 'definition',
            term: 'A permutation test checks exchangeability',
            content: 'A small p-value means the groups are not exchangeable. Groups that differ strongly in spread can yield small p-values even with equal medians. The interval of the contrast shows how large the difference in the chosen statistic is.',
          },
        ],
      },
    },
  },
};
