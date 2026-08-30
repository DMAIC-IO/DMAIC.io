/**
 * D.Mike — Histogram Module Handbook (histogram-help.js)
 * Bilingual help content (DE/EN) for the histogram module.
 */

export default {
  moduleId: 'histogram',
  sections: {
    overview: {
      de: {
        title: 'Aufbau eines Histogramms',
        blocks: [
          {
            type: 'paragraph',
            content: 'Ein Histogramm zeigt die Häufigkeitsverteilung einer numerischen Variable. Die Werte werden in gleich breite Klassen (Bins) aufgeteilt; die Höhe jedes Balkens entspricht der Anzahl der Beobachtungen in dieser Klasse. Es ist eines der wichtigsten Werkzeuge zur visuellen Charakterisierung eines Datensatzes.',
          },
          {
            type: 'definition',
            term: 'Bins (Klassen)',
            content: 'Die Anzahl der Balken bestimmt, wie fein die Verteilung aufgelöst wird. Zu wenige Bins verbergen Strukturen, zu viele erzeugen ein zerklüftetes Bild. Faustregel: ⌈√n⌉ oder die Sturges-/Freedman-Diaconis-Regel.',
          },
          {
            type: 'definition',
            term: 'Häufigkeit vs. Dichte',
            content: 'Die Y-Achse zeigt entweder absolute Häufigkeiten (Anzahl) oder Dichten (relative Häufigkeit pro Klassenbreite). Die Dichte-Darstellung ist nötig, um eine theoretische Verteilungskurve zu überlagern.',
          },
          {
            type: 'definition',
            term: 'Normalverteilungs-Kurve',
            content: 'Optionale Überlagerung einer Normalverteilung mit derselben Lage (μ) und Streuung (σ) wie die Stichprobe. Zeigt auf einen Blick, wie gut die Daten zur Glockenkurve passen.',
          },
          {
            type: 'definition',
            term: 'Spezifikationsgrenzen',
            content: 'USL und LSL können als vertikale Linien eingeblendet werden. Damit lässt sich sofort einschätzen, ob die Verteilung innerhalb der Toleranz liegt — ein erster Schritt vor der formalen Cpk-Analyse.',
          },
          {
            type: 'paragraph',
            content: 'Kurz gesagt: Ein Histogramm zeigt Lage, Streuung, Form und mögliche Ausreißer einer Stichprobe — und sollte am Anfang fast jeder datengetriebenen Analyse stehen.',
          },
        ],
      },
      en: {
        title: 'Anatomy of a Histogram',
        blocks: [
          {
            type: 'paragraph',
            content: 'A histogram shows the {{term:histogramm|frequency distribution}} of a numeric variable. Values are bucketed into equal-width classes (bins); the height of each bar equals the number of observations in that class. It is one of the most important tools for visually characterizing a dataset.',
          },
          {
            type: 'definition',
            term: 'Bins (classes)',
            content: 'The number of bars controls how finely the distribution is resolved. Too few bins hide structure, too many produce a jagged picture. Rule of thumb: ⌈√n⌉ or the Sturges / Freedman–Diaconis rules.',
          },
          {
            type: 'definition',
            term: 'Frequency vs. density',
            content: 'The Y axis shows either absolute frequencies (count) or densities (relative frequency per bin width). Density mode is required to overlay a theoretical distribution curve.',
          },
          {
            type: 'definition',
            term: 'Normal curve',
            content: 'Optional overlay of a normal distribution with the same location (μ) and spread (σ) as the sample. Shows at a glance how closely the data matches the bell curve.',
          },
          {
            type: 'definition',
            term: 'Specification limits',
            content: 'USL and LSL can be drawn as vertical lines. This lets you immediately judge whether the distribution lies within the tolerance — a first step before a formal Cpk analysis.',
          },
          {
            type: 'paragraph',
            content: 'In short: a histogram shows location, spread, shape, and possible outliers of a sample — and should appear at the start of almost every data-driven analysis.',
          },
        ],
      },
    },

    interpretation: {
      de: {
        title: 'Typische Formen',
        blocks: [
          {
            type: 'list',
            items: [
              'Glockenförmig, symmetrisch → Normalverteilung plausibel.',
              'Rechtsschief (lange rechte Flanke) → typisch für Bearbeitungszeiten, Wartezeiten, Reaktionszeiten.',
              'Linksschief → seltener, oft bei oberen Sättigungseffekten.',
              'Zwei Gipfel (bimodal) → vermischte Populationen — z. B. zwei Maschinen, zwei Schichten — Daten stratifizieren.',
              'Plateau / Rechteck → Gleichverteilung oder Mischung mehrerer Quellen mit ähnlicher Häufigkeit.',
              'Kamm-Muster mit regelmäßigen Lücken → Rundung oder Messauflösung — Skala oder Messgerät prüfen.',
              'Einzelne abgesetzte Balken weit außen → Ausreißer.',
              'Verteilung an USL/LSL „abgeschnitten" → die Daten wurden vorab gefiltert oder das Messgerät hat eine Grenze.',
            ],
          },
        ],
      },
      en: {
        title: 'Typical Shapes',
        blocks: [
          {
            type: 'list',
            items: [
              'Bell-shaped, symmetric → normality is plausible.',
              'Right-skewed (long right tail) → typical for processing times, waiting times, reaction times.',
              'Left-skewed → rarer, often with upper saturation effects.',
              'Two peaks (bimodal) → mixed populations — e.g. two machines, two shifts — stratify the data.',
              'Plateau / rectangle → uniform distribution or a mix of several sources with similar frequency.',
              'Comb pattern with regular gaps → rounding or measurement resolution — check the scale or instrument.',
              'Isolated bars far out → outliers.',
              'Distribution "cut off" at USL/LSL → data was filtered beforehand or the instrument has a hard limit.',
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
            term: 'Zu wenige Daten',
            content: 'Bei n < 30 ist die Form nur schwach belastbar. Zufällige Lücken können wie Bimodalität aussehen, glatte Glocken können trotzdem nicht-normal sein.',
          },
          {
            type: 'definition',
            term: 'Bin-Anzahl manipuliert das Bild',
            content: 'Die gleiche Stichprobe sieht mit 5 oder 50 Bins völlig anders aus. Bei wichtigen Aussagen mehrere Bin-Anzahlen testen, bevor man sich auf eine Interpretation festlegt.',
          },
          {
            type: 'definition',
            term: 'Histogramm ≠ Normalitätstest',
            content: 'Eine glockenförmige Form ist ein Indiz, kein Beweis. Vor Cpk- oder t-Test-Anwendungen mit einem {{term:wahrscheinlichkeitsnetz|Wahrscheinlichkeitsnetz}} oder einem formalen Test absichern.',
          },
          {
            type: 'definition',
            term: 'Gemischte Populationen übersehen',
            content: 'Ein einzelner Gipfel kann durch zwei sehr nahe {{term:mittelwert|Mittelwerte}} entstehen. Wenn Stratifizierungsmerkmale vorliegen (Schicht, Maschine), die Daten getrennt darstellen.',
          },
          {
            type: 'definition',
            term: 'Diskrete Daten in stetigem Histogramm',
            content: 'Zähldaten oder gerundete Werte erzeugen typische Lücken im Histogramm. Für diskrete Daten sind Balkendiagramme oder {{term:pareto|Pareto}} besser geeignet.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Too few data points',
            content: 'With n < 30 the shape is only weakly reliable. Random gaps can look like bimodality, smooth bells can still hide non-normal shapes.',
          },
          {
            type: 'definition',
            term: 'Bin count shapes the picture',
            content: 'The same sample looks completely different with 5 or 50 bins. For important statements, test several bin counts before committing to an interpretation.',
          },
          {
            type: 'definition',
            term: 'Histogram ≠ normality test',
            content: 'A bell shape is an indication, not a proof. Before Cpk or {{term:t-test|t-test}} applications, verify with a probability plot or formal test.',
          },
          {
            type: 'definition',
            term: 'Missed mixed populations',
            content: 'A single peak can be produced by two very close {{term:mittelwert|means}}. If stratification attributes exist (shift, machine), display the data separately.',
          },
          {
            type: 'definition',
            term: 'Discrete data in a continuous histogram',
            content: 'Count data or rounded values create characteristic gaps. For discrete data, bar charts or Pareto are more appropriate.',
          },
        ],
      },
    },
  },
};
