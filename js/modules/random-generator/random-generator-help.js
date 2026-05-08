/**
 * D.Mike — Random Generator Module Handbook (random-generator-help.js)
 * Bilingual help content (DE/EN) for the random generator module.
 */

export default {
  moduleId: 'random-generator',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Der Zufallsgenerator erzeugt synthetische Datensätze aus statistischen Verteilungen. Er dient dazu, Methoden zu üben, ohne echte Daten zu benötigen, Annahmen zu prüfen, Schulungsbeispiele aufzubauen und die Robustheit von Analysen zu testen.',
          },
          {
            type: 'definition',
            term: 'Verteilungen',
            content: 'Verfügbar sind unter anderem Normal-, Lognormal-, Exponential-, Weibull-, Gleich-, Dreieck-, Beta-, Gamma-, Poisson- und Binomialverteilung. Jede Verteilung hat ihre eigenen Parameter (z. B. μ und σ für die Normalverteilung).',
          },
          {
            type: 'definition',
            term: 'Attributiver Modus',
            content: 'Statt einer kontinuierlichen Verteilung lässt sich auch ein Anteilswert simulieren — z. B. „2 % defekt" — und erzeugt eine Folge von 0/1-Werten oder „i.O./n.i.O." für SPC-, Fähigkeits- und Stichprobenbeispiele.',
          },
          {
            type: 'definition',
            term: 'Seed (Saat)',
            content: 'Mit einem festen Seed wird derselbe Datensatz reproduzierbar erzeugt. Praktisch für Schulungen oder Vergleichstests, bei denen alle Teilnehmer dieselben Werte sehen sollen.',
          },
          {
            type: 'definition',
            term: 'Stichprobenstatistik & Histogramm',
            content: 'Direkt nach der Generierung werden Mittelwert, Standardabweichung, Schiefe, Min/Max und ein Histogramm der erzeugten Werte angezeigt — so lässt sich auf einen Blick prüfen, ob die Stichprobe der theoretischen Verteilung entspricht.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'The random generator creates synthetic datasets from statistical distributions. It is used to practice methods without real data, check assumptions, build training examples, and test the robustness of analyses.',
          },
          {
            type: 'definition',
            term: 'Distributions',
            content: 'Available are normal, lognormal, exponential, Weibull, uniform, triangular, beta, gamma, Poisson, and binomial — each with its own parameters (e.g. μ and σ for the normal distribution).',
          },
          {
            type: 'definition',
            term: 'Attributive mode',
            content: 'Instead of a continuous distribution, a defect rate can be simulated — e.g. "2 % defective" — producing a sequence of 0/1 or "good/bad" values for SPC, capability, and sampling examples.',
          },
          {
            type: 'definition',
            term: 'Seed',
            content: 'With a fixed seed, the same dataset is reproducible. Useful for training sessions or comparison tests where every participant should see identical values.',
          },
          {
            type: 'definition',
            term: 'Sample statistics & histogram',
            content: 'Right after generation, mean, standard deviation, skewness, min/max, and a histogram of the produced values are displayed — letting you check at a glance whether the sample matches the theoretical distribution.',
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
              'Verteilung wählen und die zugehörigen Parameter eintragen.',
              'Stichprobenumfang n festlegen — typischerweise zwischen 10 und mehreren tausend.',
              'Optional einen Seed setzen (z. B. 42) für Reproduzierbarkeit.',
              'Auf „Generieren" klicken — Histogramm und Statistik erscheinen sofort.',
              'Mit „In Worksheet übernehmen" werden die erzeugten Werte als neue Spalte ins Arbeitsblatt geschrieben.',
              'Optional: Export als CSV für externe Tools.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Typische Einsatzfälle: Cpk-Beispiele, MSA-Schulungen, Hypothesentests demonstrieren, Kontrollkarten testen, Verteilungsanpassung auf bekannten Verteilungen üben.',
          },
        ],
      },
      en: {
        title: 'Operation',
        blocks: [
          {
            type: 'list',
            items: [
              'Pick a distribution and enter its parameters.',
              'Set the sample size n — typically between 10 and several thousand.',
              'Optionally set a seed (e.g. 42) for reproducibility.',
              'Click "Generate" — histogram and statistics appear immediately.',
              'Use "Send to worksheet" to write the generated values as a new column into the worksheet.',
              'Optional: export as CSV for external tools.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Typical use cases: Cpk examples, MSA training, demonstrating hypothesis tests, testing control charts, practicing distribution fit on known distributions.',
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
            term: 'Synthetische Daten ≠ Realität',
            content: 'Generierte Daten haben eine bekannte, saubere Verteilung. Echte Prozesse zeigen Ausreißer, Drift, Mischverteilungen und Mess-Rauschen — Schlussfolgerungen aus Simulationen vorsichtig auf reale Prozesse übertragen.',
          },
          {
            type: 'definition',
            term: 'Zu kleines n',
            content: 'Bei n < 30 können die Stichprobenstatistiken stark von den eingestellten Parametern abweichen — auch wenn der Generator korrekt arbeitet. Das ist kein Fehler, sondern reine Stichprobenstreuung.',
          },
          {
            type: 'definition',
            term: 'Falsche Parameter-Interpretation',
            content: 'Bei der Lognormalverteilung ist μ der Mittelwert des Logarithmus, nicht des Werts selbst. Bei Weibull steuert der Shape-Parameter die Form, der Scale-Parameter die typische Größenordnung. Bei Unsicherheit das Histogramm prüfen.',
          },
          {
            type: 'definition',
            term: 'Nicht reproduzierbar ohne Seed',
            content: 'Ohne festen Seed entsteht bei jedem Klick ein anderer Datensatz. Für Vergleiche, Schulungen oder Tests den Seed dokumentieren.',
          },
          {
            type: 'definition',
            term: 'Attributiv vs. kontinuierlich verwechseln',
            content: 'Der attributive Modus erzeugt 0/1-Werte mit einem Anteilswert. Wer hier eine Cpk-Analyse erwartet, bekommt unsinnige Ergebnisse — für Cpk eine kontinuierliche Verteilung wählen.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Synthetic data ≠ reality',
            content: 'Generated data has a known, clean distribution. Real processes show outliers, drift, mixed populations, and measurement noise — transfer conclusions from simulations to real processes carefully.',
          },
          {
            type: 'definition',
            term: 'Sample too small',
            content: 'With n < 30, sample statistics can differ noticeably from the configured parameters — even when the generator works correctly. This is not a bug, just sampling variation.',
          },
          {
            type: 'definition',
            term: 'Wrong parameter interpretation',
            content: 'For the lognormal distribution, μ is the mean of the logarithm, not of the value itself. For Weibull, the shape parameter controls the form and the scale parameter the typical magnitude. When in doubt, check the histogram.',
          },
          {
            type: 'definition',
            term: 'Not reproducible without a seed',
            content: 'Without a fixed seed, every click produces a different dataset. For comparisons, training, or tests, document the seed.',
          },
          {
            type: 'definition',
            term: 'Confusing attributive and continuous mode',
            content: 'Attributive mode produces 0/1 values from a defect rate. Expecting a Cpk analysis here yields nonsense — pick a continuous distribution for Cpk.',
          },
        ],
      },
    },
  },
};
