/**
 * D.Mike — Sample Size Module Handbook (sample-size-help.js)
 * Bilingual help content (DE/EN) for the sample size module.
 */

export default {
  moduleId: 'sample-size',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Die Stichprobenumfangsplanung — angebunden an {{term:power|Power}} und {{term:effektstaerke|Effektstärke}} — bestimmt, wie viele Beobachtungen nötig sind, damit ein Test oder eine Schätzung die gewünschte Aussagekraft hat. Zu kleine Stichproben verpassen echte Effekte, zu große verschwenden Ressourcen. Vor jedem ernsthaften Experiment oder Vergleich sollte der Umfang geplant werden — nicht im Nachhinein.',
          },
          {
            type: 'definition',
            term: 'Signifikanzniveau (α)',
            content: 'Das Risiko, einen Effekt zu sehen, der gar nicht existiert ({{term:fehler-erster-art|Fehler 1. Art}}). Meist {{term:signifikanzniveau|α}} = 0,05.',
          },
          {
            type: 'definition',
            term: 'Power (1 − β)',
            content: 'Die {{term:power|Power}} — Wahrscheinlichkeit, einen tatsächlich vorhandenen Effekt mit dem Test auch zu entdecken. Üblich: Power = 0,80 oder 0,90. Niedrige Power heißt: selbst ein echter Effekt wird oft übersehen.',
          },
          {
            type: 'definition',
            term: 'Effektgröße (δ)',
            content: 'Die {{term:effektstaerke|Effektstärke}} — die kleinste Differenz, die noch als praktisch relevant gilt. „Ab welchem Unterschied würden wir handeln?". Kleinere Effekte brauchen größere Stichproben.',
          },
          {
            type: 'definition',
            term: 'Streuung (σ)',
            content: 'Die Streuung der einzelnen Messwerte. Je größer die Streuung, desto mehr Beobachtungen werden gebraucht, um einen Effekt klar herauszufiltern.',
          },
          {
            type: 'definition',
            term: 'Konfidenzintervall-Breite',
            content: 'Bei Schätzungen (nicht Tests) wird der Umfang so gewählt, dass das Intervall schmal genug wird, um die Frage zu beantworten. Halbierung der Breite vervierfacht n.',
          },
          {
            type: 'paragraph',
            content: 'Die vier Größen α, Power, δ und σ sind gekoppelt: Sind drei davon festgelegt, ergibt sich die vierte. In der Planung werden α, Power und δ festgelegt, σ wird aus Vorwissen oder Pilotdaten geschätzt — n ist das Ergebnis.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'Sample size planning — tied to {{term:power|power}} and {{term:effektstaerke|effect size}} — determines how many observations are needed for a test or estimate to have the desired statistical power. Too few samples miss real effects; too many waste resources. Before any serious experiment or comparison, plan the sample size — not after.',
          },
          {
            type: 'definition',
            term: 'Significance level (α)',
            content: 'The risk of seeing an effect that does not exist ({{term:fehler-erster-art|Type I error}}). Usually {{term:signifikanzniveau|α}} = 0.05.',
          },
          {
            type: 'definition',
            term: 'Power (1 − β)',
            content: 'The {{term:power|power}} — probability of detecting an effect that really exists. Common: power = 0.80 or 0.90. Low power means: even a real effect is often missed.',
          },
          {
            type: 'definition',
            term: 'Effect size (δ)',
            content: 'The {{term:effektstaerke|effect size}} — the smallest difference still considered practically relevant. "From which difference on would we act?". Smaller effects need larger samples.',
          },
          {
            type: 'definition',
            term: 'Variation (σ)',
            content: 'The scatter of individual measurements. Greater variation requires more observations to pull an effect out of the noise.',
          },
          {
            type: 'definition',
            term: 'Confidence interval width',
            content: 'For estimates (not tests), the sample size is chosen so the interval becomes narrow enough to answer the question. Halving the width quadruples n.',
          },
          {
            type: 'paragraph',
            content: 'The four quantities α, power, δ, and σ are coupled: fix three and the fourth follows. In planning, α, power, and δ are set; σ is estimated from prior knowledge or pilot data — n is the result.',
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
              'Testart oder Schätzproblem klären — 1 Stichprobe, 2 Stichproben, Anteilsvergleich, Regression?',
              'Signifikanzniveau wählen (meist α = 0,05).',
              'Power festlegen (meist 0,80 oder 0,90).',
              'Kleinste praktisch relevante Effektgröße definieren — nicht die erwartete, sondern die kleinste noch interessante.',
              'Streuung schätzen — aus Historie, Pilotdaten oder Literatur.',
              'n berechnen und prüfen, ob er ressourcen-technisch machbar ist. Wenn nicht, Parameter ehrlich anpassen oder Experiment neu designen.',
              'Geplanten Umfang dokumentieren — so ist später nachvollziehbar, warum der Test mit genau dieser Zahl gerechnet wurde.',
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
              'Clarify test type or estimation problem — 1-sample, 2-sample, proportion comparison, regression?',
              'Choose significance level (usually α = 0.05).',
              'Set power (usually 0.80 or 0.90).',
              'Define the smallest practically relevant effect size — not the expected one, the smallest still interesting.',
              'Estimate variation — from history, pilot data, or literature.',
              'Compute n and check whether it is resource-feasible. If not, honestly revise parameters or redesign the experiment.',
              'Document the planned size — so it is later traceable why exactly this n was used.',
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
            term: 'Power zu niedrig',
            content: 'Eine Power von 0,50 entspricht einem Münzwurf — selbst ein echter Effekt wird nur in der Hälfte der Fälle erkannt. Unter 0,80 wird es riskant.',
          },
          {
            type: 'definition',
            term: 'Effektgröße zu optimistisch',
            content: 'Wer eine große Effektgröße annimmt, bekommt ein bequemes kleines n. Trifft in der Realität nur ein kleiner Effekt auf, ist der Test blind. Pessimistischer planen schützt vor leeren Ergebnissen.',
          },
          {
            type: 'definition',
            term: 'Streuung unterschätzt',
            content: 'Ohne Pilotdaten oder Historie wird σ häufig zu klein angesetzt. Ergebnis: n zu klein, Test verpasst den Effekt. Bei Unsicherheit eher aufrunden.',
          },
          {
            type: 'definition',
            term: 'Nachträgliche Power-Rechnung',
            content: 'Die Power nach dem Test mit dem beobachteten Effekt zu berechnen ist Unsinn — sie korreliert direkt mit dem p-Wert. Power gehört in die Planung, nicht in die Auswertung.',
          },
          {
            type: 'definition',
            term: 'Stichprobenaufbau vergessen',
            content: 'Der Umfang allein reicht nicht — wie die Stichprobe gezogen wird, ist genauso wichtig. Eine schiefe Ziehung lässt sich durch keine Rechenformel reparieren.',
          },
          {
            type: 'definition',
            term: '„Je mehr, desto besser"',
            content: 'Unnötig große Stichproben verteuern das Projekt und liefern signifikante, aber inhaltlich belanglose Ergebnisse. Die Planung bestimmt bewusst den gerade nötigen Umfang.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Power too low',
            content: 'Power of 0.50 is a coin flip — even a real effect is found only half the time. Below 0.80 it becomes risky.',
          },
          {
            type: 'definition',
            term: 'Effect size too optimistic',
            content: 'Assuming a large effect gives a comfortable small n. If reality shows only a small effect, the test is blind. Plan pessimistically to avoid empty results.',
          },
          {
            type: 'definition',
            term: 'Variation underestimated',
            content: 'Without pilot data or history, σ is often set too low. Result: n too small, test misses the effect. When uncertain, round up.',
          },
          {
            type: 'definition',
            term: 'Post-hoc power',
            content: 'Computing power after the test with the observed effect is nonsense — it correlates directly with the p-value. Power belongs to planning, not to evaluation.',
          },
          {
            type: 'definition',
            term: 'Sampling design forgotten',
            content: 'Size alone is not enough — how the sample is drawn matters equally. A biased draw cannot be fixed by any formula.',
          },
          {
            type: 'definition',
            term: '"The more, the better"',
            content: 'Unnecessarily large samples inflate cost and produce significant but irrelevant results. Planning deliberately picks just the sample size needed.',
          },
        ],
      },
    },
  },
};
