/**
 * D.Mike — Probability Plot Module Handbook (probability-plot-help.js)
 * Bilingual help content (DE/EN) for the probability plot module.
 */

export default {
  moduleId: 'probability-plot',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Ein Wahrscheinlichkeitsnetz (auch Normal Probability Plot) zeigt dir auf einen Blick mehrere wichtige Dinge:',
          },
          {
            type: 'definition',
            term: 'Verteilungsform',
            content: 'Liegen die Datenpunkte annähernd auf einer Geraden, sind deine Daten normalverteilt. Systematische Abweichungen (S-Kurven, Ausreißer, Knicke) deuten auf {{term:schiefe|Schiefe}}, Ausreißer oder eine andere Verteilung hin.',
          },
          {
            type: 'definition',
            term: 'Lage und Streuung',
            content: 'Der {{term:median|Median}} (50%-Punkt) zeigt dir die zentrale Lage, und die Steigung der Geraden spiegelt die Streuung wider – eine flache Gerade bedeutet große Streuung, eine steile geringe.',
          },
          {
            type: 'definition',
            term: 'Prozessfähigkeit abschätzen',
            content: 'Du kannst direkt ablesen, welcher Anteil deiner Daten innerhalb oder außerhalb der Spezifikationsgrenzen liegt, indem du die Grenzen auf der x-Achse einträgst und den zugehörigen Prozentsatz auf der y-Achse abliest.',
          },
          {
            type: 'definition',
            term: 'Ausreißer und Mischverteilungen erkennen',
            content: 'Einzelne Punkte, die weit von der Geraden abweichen, sind Ausreißer. Ein Knick in der Mitte deutet oft darauf hin, dass zwei Prozesse überlagert sind (z. B. zwei Maschinen, zwei Schichten).',
          },
          {
            type: 'paragraph',
            content: 'Kurz gesagt: Es ist ein schnelles visuelles Werkzeug, um zu prüfen, ob deine Daten „brav" normalverteilt sind und wie sich dein Prozess verhält – bevor du mit Cpk-Berechnungen oder Hypothesentests weiterarbeitest.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'A probability plot (also called a Normal Probability Plot) shows you several important things at a glance:',
          },
          {
            type: 'definition',
            term: 'Distribution shape',
            content: 'If the data points lie approximately on a straight line, your data is normally distributed. Systematic deviations (S-curves, outliers, kinks) indicate {{term:schiefe|skewness}}, outliers, or a different distribution.',
          },
          {
            type: 'definition',
            term: 'Location and spread',
            content: 'The {{term:median|median}} (50% point) tells you the central location, and the slope of the line reflects the spread — a flat line {{term:mittelwert|means}} large spread, a steep line means small spread.',
          },
          {
            type: 'definition',
            term: 'Estimating process capability',
            content: 'You can read off directly what fraction of your data lies inside or outside the specification limits by marking the limits on the x-axis and reading the corresponding percentage from the y-axis.',
          },
          {
            type: 'definition',
            term: 'Spotting outliers and mixed distributions',
            content: 'Individual points far from the line are outliers. A kink in the middle often indicates that two processes are superimposed (e.g. two machines, two shifts).',
          },
          {
            type: 'paragraph',
            content: 'In short: it is a quick visual tool to check whether your data is "well-behaved" and normally distributed and how your process behaves — before moving on to Cpk calculations or hypothesis tests.',
          },
        ],
      },
    },

    methodology: {
      de: {
        title: 'Methodik',
        blocks: [
          {
            type: 'paragraph',
            content: 'Das Wahrscheinlichkeitsnetz (Normal Probability Plot) ist eine grafische Methode, um zu prüfen, ob eine Stichprobe näherungsweise einer Normalverteilung folgt. Die geordneten Messwerte werden gegen die theoretischen Quantile der Standardnormalverteilung aufgetragen. Liegen die Punkte annähernd auf einer Geraden, ist Normalverteilung plausibel.',
          },
          {
            type: 'definition',
            term: 'Plotting Positions (Blom)',
            content: 'Für n Messwerte werden die kumulierten Wahrscheinlichkeiten p_i = (i − 3/8) / (n + 1/4) berechnet. Daraus ergeben sich über die Inverse der Standardnormalverteilung die theoretischen z-Werte.',
          },
          {
            type: 'definition',
            term: 'Wahrscheinlichkeitsachse (Y)',
            content: 'Die Y-Achse zeigt Prozentwerte (1 %, 5 %, 10 %, …, 99 %) an den Positionen der zugehörigen z-Quantile — wie auf klassischem Wahrscheinlichkeitspapier.',
          },
          {
            type: 'definition',
            term: 'Referenzgerade',
            content: 'Die gestrichelte Linie wird durch das erste und dritte Quartil (Q1/Q3) der Daten gelegt. Sie dient als visueller Vergleich: Punkte auf der Linie → normalverteilt, systematische Abweichungen → andere Verteilungsform.',
          },
          {
            type: 'definition',
            term: 'Gruppen im selben Plot',
            content: 'Optional kann eine kategoriale Spalte als Gruppierung hinzugefügt werden (z. B. Schicht, Maschine, Charge). Pro eindeutigem Gruppen-Wert entsteht eine eigene Serie mit eigener Q1/Q3-Anpassungsgerade — so lassen sich Verteilungsform, Lage und Streuung der Gruppen direkt im selben Plot vergleichen.',
          },
        ],
      },
      en: {
        title: 'Methodology',
        blocks: [
          {
            type: 'paragraph',
            content: 'A normal probability plot is a graphical method for checking whether a sample is approximately normally distributed. Sorted observations are plotted against the theoretical quantiles of the standard normal distribution. If the points fall close to a straight line, normality is plausible.',
          },
          {
            type: 'definition',
            term: 'Plotting Positions (Blom)',
            content: 'For n observations, cumulative probabilities p_i = (i − 3/8) / (n + 1/4) are computed and converted to theoretical z-values via the inverse standard normal CDF.',
          },
          {
            type: 'definition',
            term: 'Probability Axis (Y)',
            content: 'The Y-axis shows percentages (1 %, 5 %, 10 %, …, 99 %) placed at the corresponding z-quantile positions — just like classical probability paper.',
          },
          {
            type: 'definition',
            term: 'Reference Line',
            content: 'The dashed line passes through the first and third quartile (Q1/Q3) of the data. Use it as a visual yardstick: points on the line → normal, systematic deviations → different distribution shape.',
          },
          {
            type: 'definition',
            term: 'Groups in the same plot',
            content: 'Optionally add a categorical column as grouping (e.g. shift, machine, batch). Each distinct group value yields its own series with its own Q1/Q3 fit line — letting you compare distribution shape, location and spread of the groups directly in the same plot.',
          },
        ],
      },
    },

    example: {
      de: {
        title: 'Praxisbeispiel',
        blocks: [
          {
            type: 'scenario',
            content: 'Ein Qualitätsteam misst die Bohrungstiefe (mm) von 50 Werkstücken und möchte vor einer Prozessfähigkeitsanalyse prüfen, ob die Werte normalverteilt sind.',
          },
          {
            type: 'steps',
            items: [
              'Modul „Wahrscheinlichkeitsnetz" öffnen.',
              'Spalte „Bohrungstiefe" als Werte-Spalte auswählen.',
              'Diagramm erscheint automatisch — Punkte und Referenzlinie vergleichen.',
              'Liegen die Punkte nahe der Linie, kann mit der Normalverteilungsannahme gearbeitet werden.',
            ],
          },
          {
            type: 'result',
            content: 'Die Punkte folgen weitgehend der Referenzlinie, nur die Extreme weichen leicht ab. Eine Cpk-Analyse mit Normalverteilungsannahme ist vertretbar; zusätzlich kann ein formaler Test (Anderson-Darling, Shapiro-Wilk) im Modul „Verteilungsanpassung" durchgeführt werden.',
          },
        ],
      },
      en: {
        title: 'Practical Example',
        blocks: [
          {
            type: 'scenario',
            content: 'A quality team measures the hole depth (mm) of 50 parts and wants to check whether the values are normally distributed before running a process capability analysis.',
          },
          {
            type: 'steps',
            items: [
              'Open the "Probability Plot" module.',
              'Select the column "Hole Depth" as the value column.',
              'The chart appears automatically — compare the points against the reference line.',
              'If the points hug the line, working under the normality assumption is reasonable.',
            ],
          },
          {
            type: 'result',
            content: 'Most points follow the reference line; only the extremes deviate slightly. A Cpk analysis under the normal assumption is justifiable. A formal test (Anderson-Darling, Shapiro-Wilk) can additionally be run in the "Distribution Fit" module.',
          },
        ],
      },
    },

    interpretation: {
      de: {
        title: 'Interpretation',
        blocks: [
          {
            type: 'heading',
            content: 'Typische Muster',
          },
          {
            type: 'list',
            items: [
              'Punkte auf der Linie → Normalverteilung plausibel.',
              'S-förmiges Muster → leichte/starke Schiefe der Verteilung.',
              'Konvex (nach oben gewölbt) → rechtsschief (positiv schief).',
              'Konkav (nach unten gewölbt) → linksschief (negativ schief).',
              'Treppen-/Stufenmuster → diskrete oder gerundete Daten.',
              'Einzelne Punkte weit abseits → mögliche Ausreißer.',
              'Punkte folgen mehreren Geraden → gemischte Population (Stratifizierung prüfen).',
            ],
          },
          {
            type: 'decision',
            content: 'Das Wahrscheinlichkeitsnetz ist ein visueller Schnelltest. Bei Unsicherheit sollte ein formaler Normalitätstest (Shapiro-Wilk, Anderson-Darling) ergänzt werden — verfügbar im Modul „Verteilungsanpassung".',
          },
        ],
      },
      en: {
        title: 'Interpretation',
        blocks: [
          {
            type: 'heading',
            content: 'Typical Patterns',
          },
          {
            type: 'list',
            items: [
              'Points on the line → normality is plausible.',
              'S-shaped pattern → mild or strong skewness.',
              'Convex (curving up) → right-skewed (positive skew).',
              'Concave (curving down) → left-skewed (negative skew).',
              'Stair-step pattern → discrete or rounded data.',
              'Individual points far off → potential outliers.',
              'Points form multiple straight segments → mixed population (check stratification).',
            ],
          },
          {
            type: 'decision',
            content: 'The probability plot is a quick visual check. When in doubt, complement it with a formal normality test (Shapiro-Wilk, Anderson-Darling) — available in the "Distribution Fit" module.',
          },
        ],
      },
    },

    pitfalls: {
      de: {
        title: 'Stolperfallen',
        blocks: [
          {
            type: 'pitfall',
            content: 'Zu kleine Stichprobe (n < 15): Auch normalverteilte Daten zeigen oft scheinbare Abweichungen. Aussagen werden erst ab n ≥ 30 robust.',
          },
          {
            type: 'pitfall',
            content: 'Visuelle Beurteilung allein reicht nicht: Bei kritischen Entscheidungen (z. B. Freigabe einer Cpk-Analyse) immer einen formalen Normalitätstest ergänzen.',
          },
          {
            type: 'pitfall',
            content: 'Diskrete oder stark gerundete Daten erzeugen ein typisches Treppenmuster — das ist keine Nicht-Normalität, sondern eine Eigenart der Datenerfassung.',
          },
          {
            type: 'pitfall',
            content: 'Gemischte Populationen (z. B. zwei Maschinen, zwei Schichten) erzeugen oft mehrere Geradenstücke. Daten vor der Analyse stratifizieren.',
          },
          {
            type: 'pitfall',
            content: 'Wahrscheinlichkeitsnetz ≠ Anpassungstest: Das Diagramm zeigt nur, ob die Normalverteilung passend erscheint — andere Verteilungen (Weibull, lognormal) erfordern eigene Tests.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'pitfall',
            content: 'Too small a sample (n < 15): even normally distributed data often shows apparent deviations. Conclusions become robust only from n ≥ 30 onward.',
          },
          {
            type: 'pitfall',
            content: 'Visual judgment alone is not enough: for critical decisions (e.g. releasing a Cpk analysis) always complement with a formal normality test.',
          },
          {
            type: 'pitfall',
            content: 'Discrete or heavily rounded data produce a typical stair-step pattern — that is not non-normality but an artifact of data acquisition.',
          },
          {
            type: 'pitfall',
            content: 'Mixed populations (e.g. two machines, two shifts) often produce several line segments. Stratify the data before analysis.',
          },
          {
            type: 'pitfall',
            content: 'Probability plot ≠ goodness-of-fit test: the chart only shows whether the normal distribution looks appropriate — other distributions (Weibull, lognormal) require dedicated tests.',
          },
        ],
      },
    },
  },
};
