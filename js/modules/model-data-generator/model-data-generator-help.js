/**
 * D.Mike — Model Data Generator Module Handbook (model-data-generator-help.js)
 * Bilingual help content (DE/EN) for the model data generator module.
 */

export default {
  moduleId: 'model-data-generator',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Der Modell-Datengenerator erzeugt synthetische Datensätze aus einem konfigurierbaren {{term:regression|Regressionsmodell}}. Im Unterschied zum reinen Zufallsgenerator wird hier ein gerichteter Zusammenhang zwischen Eingangs- und Ausgangsgrößen modelliert — ideal, um DOE-Auswertungen, Regressionsanalysen oder Optimierungsmethoden an einem bekannten „wahren" Modell zu üben und zu validieren.',
          },
          {
            type: 'definition',
            term: 'Faktoren',
            content: 'Die Eingangsgrößen (X1, X2, …) mit jeweils einem Min- und Max-Wert. Die Faktoren werden je nach Sampling-Methode innerhalb dieses Bereichs erzeugt.',
          },
          {
            type: 'definition',
            term: 'Beta-Koeffizienten',
            content: 'Die Modellkoeffizienten für Achsenabschnitt, Haupteffekte, Wechselwirkungen und ggf. quadratische Terme. Sie definieren das „wahre" Modell — das Generator-Modell, gegen das später Auswertungen verglichen werden.',
          },
          {
            type: 'definition',
            term: 'Wechselwirkungen',
            content: 'Produkte zweier oder mehrerer Faktoren (X1·X2, X1·X2·X3, …). Bis zur 5. Ordnung möglich. Wechselwirkungen sind für die Interpretation von DOE-Ergebnissen besonders wichtig.',
          },
          {
            type: 'definition',
            term: 'Sampling-Methode',
            content: 'Steuert, wie die Faktorkombinationen erzeugt werden — Monte Carlo (zufällig), Latin Hypercube Sampling (LHS, gleichmäßiger verteilt) oder vollfaktoriell (alle Kombinationen einer festen Stufenanzahl).',
          },
          {
            type: 'definition',
            term: 'Rauschen',
            content: 'Zusätzliches normalverteiltes Mess-Rauschen wird auf den modellierten Y-Wert addiert. Damit lässt sich realistische Streuung simulieren und das Signal-Rausch-Verhältnis kontrollieren.',
          },
          {
            type: 'definition',
            term: 'Seed (Saat)',
            content: 'Mit einem festen Seed entsteht bei jedem Lauf derselbe Datensatz — wichtig für {{term:reproduzierbarkeit|Reproduzierbarkeit}} von Schulungen und Vergleichen.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'The model data generator produces synthetic datasets from a configurable regression model. Unlike the plain random generator, here a directed relationship between inputs and outputs is modeled — ideal for practicing and validating DOE analyses, regression, or optimization methods against a known "true" model.',
          },
          {
            type: 'definition',
            term: 'Factors',
            content: 'The input variables (X1, X2, …) each with a min and max range. The factors are generated within this range according to the chosen sampling method.',
          },
          {
            type: 'definition',
            term: 'Beta coefficients',
            content: 'The model coefficients for intercept, main effects, interactions, and optional quadratic terms. They define the "true" model — the generator model against which later analyses can be compared.',
          },
          {
            type: 'definition',
            term: 'Interactions',
            content: 'Products of two or more factors (X1·X2, X1·X2·X3, …). Supported up to 5th order. Interactions are particularly important for interpreting DOE results.',
          },
          {
            type: 'definition',
            term: 'Sampling method',
            content: 'Controls how factor combinations are generated — Monte Carlo (random), Latin Hypercube Sampling (LHS, more evenly spread), or {{term:vollfaktoriell|full factorial}} (all combinations of a fixed number of levels).',
          },
          {
            type: 'definition',
            term: 'Noise',
            content: 'Additional normally distributed measurement noise is added to the modeled Y value. This simulates realistic scatter and lets you control the signal-to-noise ratio.',
          },
          {
            type: 'definition',
            term: 'Seed',
            content: 'With a fixed seed, every run produces the same dataset — important for reproducible training and comparisons.',
          },
        ],
      },
    },

    methodology: {
      de: {
        title: 'Bedienung',
        blocks: [
          {
            type: 'list',
            items: [
              'Faktoren anlegen — Name, Min und Max für jede Eingangsgröße eintragen.',
              'Beta-Koeffizienten setzen: Achsenabschnitt, Haupteffekte und gewünschte Wechselwirkungs-Terme.',
              'Sampling-Methode wählen: Monte Carlo für schnelle Streuung, LHS für gleichmäßige Abdeckung, vollfaktoriell für DOE-Schulungen.',
              'Stichprobenumfang n bzw. Stufenzahl festlegen.',
              'Noise-Stärke (z. B. σ = 0,5) eintragen — bestimmt die Streuung der {{term:zielgroesse|Antwortgröße}}.',
              'Optional Seed setzen, dann „Generieren".',
              'Mit „In Worksheet übernehmen" wird der Datensatz als neue Tabelle ins Arbeitsblatt geschrieben.',
            ],
          },
        ],
      },
      en: {
        title: 'Operation',
        blocks: [
          {
            type: 'list',
            items: [
              'Add factors — name, min, and max for each input.',
              'Set the beta coefficients: intercept, main effects, and the interaction terms you want.',
              'Pick a sampling method: Monte Carlo for fast scatter, LHS for even coverage, full factorial for DOE training.',
              'Set the sample size n or the number of levels.',
              'Enter the noise level (e.g. σ = 0.5) — this controls the spread of the response.',
              'Optionally set a seed, then click "Generate".',
              'Use "Send to worksheet" to write the dataset as a new table into the worksheet.',
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
            term: 'Zu viele Wechselwirkungs-Terme',
            content: 'Modelle mit Wechselwirkungen 4. oder 5. Ordnung sind oft unrealistisch und schwer zu interpretieren. In der Praxis dominieren Haupteffekte und Wechselwirkungen 2. Ordnung — höhere Ordnungen nur einsetzen, wenn dafür ein konkreter Zweck besteht.',
          },
          {
            type: 'definition',
            term: 'Skalenabhängigkeit der Beta-Koeffizienten',
            content: 'Ein Beta von 5 hat unterschiedliche Wirkung, je nachdem ob X von 0–1 oder von 0–1000 läuft. Bei der Modellbildung die Faktorbereiche im Auge behalten oder Faktoren intern kodieren.',
          },
          {
            type: 'definition',
            term: 'Rauschen vs. Effekt',
            content: 'Wenn das Rauschen größer als die Effekte ist, lassen sich die Modellparameter selbst mit großen Stichproben kaum rekonstruieren. Verhältnis von Effekt zu σ bewusst wählen.',
          },
          {
            type: 'definition',
            term: 'Vollfaktoriell explodiert mit Faktoren',
            content: 'Bei k Faktoren mit l Stufen entstehen l^k Versuchspunkte — bei 5 Faktoren und 5 Stufen schon 3 125. Vollfaktoriell nur für kleine Faktorenzahlen einsetzen.',
          },
          {
            type: 'definition',
            term: 'Seed dokumentieren',
            content: 'Ohne dokumentierten Seed lässt sich ein Datensatz nicht reproduzieren — wichtig bei Schulungen, Vergleichstests und Validierungsstudien.',
          },
          {
            type: 'definition',
            term: 'Synthetik bleibt Synthetik',
            content: 'Ein Modell-Datensatz hat keine Mess-Drift, keine Maschinenwechsel und keine Operator-Effekte. Reale Streuung übersteigt synthetische oft deutlich — Methoden in der Praxis nochmals validieren.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Too many interaction terms',
            content: 'Models with 4th or 5th order interactions are often unrealistic and hard to interpret. In practice main effects and 2nd order interactions dominate — only use higher orders when there is a specific reason.',
          },
          {
            type: 'definition',
            term: 'Scale dependency of beta coefficients',
            content: 'A beta of 5 has very different impact depending on whether X runs from 0–1 or from 0–1000. Keep factor ranges in mind when designing the model, or code factors internally.',
          },
          {
            type: 'definition',
            term: 'Noise vs. effect',
            content: 'If noise is larger than the effects, model parameters can hardly be recovered even with large samples. Pick the effect-to-σ ratio deliberately.',
          },
          {
            type: 'definition',
            term: 'Full factorial explodes with factors',
            content: 'With k factors at l levels, you get l^k design points — 5 factors at 5 levels already gives 3 125. Only use full factorial for small factor counts.',
          },
          {
            type: 'definition',
            term: 'Document the seed',
            content: 'Without a documented seed, a dataset is not reproducible — important for training, comparisons, and validation studies.',
          },
          {
            type: 'definition',
            term: 'Synthetic stays synthetic',
            content: 'A model dataset has no measurement drift, no machine changes, and no operator effects. Real-world scatter often exceeds synthetic by a wide margin — re-validate methods in practice.',
          },
        ],
      },
    },
  },
};
