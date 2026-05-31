/**
 * D.Mike — Multivariate Control Chart Module Handbook (multivariate-control-chart-help.js)
 */

export default {
  moduleId: 'multivariate-control-chart',
  sections: {
    overview: {
      de: {
        title: 'Hotelling T² — multivariate Regelkarte',
        blocks: [
          {
            type: 'paragraph',
            content: 'Wenn ein Prozess mehrere zusammenhängende Merkmale hat (z. B. Druck und Temperatur, Härte und Dichte), reicht es nicht, jedes Merkmal mit einer eigenen Shewhart-Karte zu überwachen. Das übersieht Verschiebungen, die nur in der Korrelationsstruktur sichtbar sind: Druck steigt, Temperatur fällt — beides individuell unauffällig, gemeinsam aber ein Alarmsignal.',
          },
          {
            type: 'definition',
            term: 'T²-Statistik',
            content: 'T²ᵢ = (xᵢ − x̄)′ S⁻¹ (xᵢ − x̄). Quadrierter Mahalanobis-Abstand jedes Punkts zum Stichprobenmittelvektor, gewichtet mit der inversen Kovarianzmatrix.',
          },
          {
            type: 'definition',
            term: 'Eingriffsgrenze (Phase II, Einzelwerte)',
            content: 'UCL = (p(m+1)(m−1)) / (m²−mp) · F_{α, p, m−p}, wobei m = Vorlauf-Stichprobengröße, p = Anzahl Merkmale, α = Falsch-Alarm-Wahrscheinlichkeit (üblich 0,0027 als 3σ-Äquivalent).',
          },
          {
            type: 'paragraph',
            content: 'Vorteil: erkennt Korrelationsbrüche, die einzelnen Karten entgehen. Nachteil: ein Alarm sagt nicht, welches Merkmal außer Kontrolle ist — dazu brauchen Folgeanalysen (z. B. T² in Beiträge zerlegen oder klassische Karten parallel laufen).',
          },
        ],
      },
      en: {
        title: 'Hotelling T² — Multivariate Control Chart',
        blocks: [
          {
            type: 'paragraph',
            content: 'When a process has several correlated characteristics (e.g. pressure and temperature, hardness and density), running a separate Shewhart chart on each one is not enough. It misses shifts that only show up in the correlation structure: pressure up, temperature down — each unremarkable individually, together a clear alarm.',
          },
          {
            type: 'definition',
            term: 'T² statistic',
            content: 'T²ᵢ = (xᵢ − x̄)′ S⁻¹ (xᵢ − x̄). Squared Mahalanobis distance of each observation from the sample {{term:mittelwert|mean}} vector, weighted by the inverse covariance matrix.',
          },
          {
            type: 'definition',
            term: 'Control limit (Phase II, individuals)',
            content: 'UCL = (p(m+1)(m−1)) / (m²−mp) · F_{α, p, m−p}, where m = baseline sample size, p = number of variables, α = false-alarm probability (typically 0.0027 as the 3σ equivalent).',
          },
          {
            type: 'paragraph',
            content: 'Benefit: catches correlation breaks that single charts miss. Drawback: an alarm does not say which variable is out of control — follow-up analyses (T² decomposition or parallel single charts) are needed for that.',
          },
        ],
      },
    },

    pitfalls: {
      de: {
        title: 'Stolperfallen',
        blocks: [
          { type: 'definition', term: 'Hochkorrelierte Merkmale doppelt erfasst', content: 'Wenn zwei Spalten faktisch dasselbe messen (Korrelation > 0,99), wird die Kovarianzmatrix singulär oder fast-singulär — die Inversion bricht ab. Vorher prüfen, ob alle Variablen unabhängig informativ sind.' },
          { type: 'definition', term: 'Zu kleines m', content: 'Mit m ≤ p ist die Kovarianzmatrix nicht invertierbar. Faustregel: m sollte mindestens das 5-Fache von p sein, besser 10-Fache.' },
          { type: 'definition', term: 'Diagnose schwierig', content: 'Ein T²-Alarm zeigt „irgendetwas im Merkmals-Vektor ist außerhalb". Welches Merkmal — oder welche Kombination — verantwortlich ist, sieht man nicht direkt; dafür braucht es Beitragszerlegung oder ergänzende Shewhart-Karten je Variable.' },
          { type: 'definition', term: 'α-Wahl', content: 'α = 0,0027 entspricht der klassischen 3σ-Konvention. Größere α erhöhen die Sensitivität, vervielfachen aber Falsch-Alarme — bei p Variablen multiplikativ.' },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          { type: 'definition', term: 'Highly correlated variables', content: 'If two columns measure essentially the same thing (correlation > 0.99) the covariance matrix becomes singular or near-singular and the inversion fails. Verify each variable is independently informative.' },
          { type: 'definition', term: 'Too small m', content: 'When m ≤ p the covariance matrix is not invertible. Rule of thumb: m should be at least 5×p, better 10×p.' },
          { type: 'definition', term: 'Hard to diagnose', content: 'A T² alarm says "something in the variable vector is out". It does not say which variable — or combination — is responsible; that needs contribution decomposition or parallel per-variable Shewhart charts.' },
          { type: 'definition', term: 'α choice', content: 'α = 0.0027 matches the classic 3σ convention. Larger α increases sensitivity but multiplies false alarms — multiplicatively in p.' },
        ],
      },
    },
  },
};
