/**
 * D.Mike — Run Chart Module Handbook (run-chart-help.js)
 * Bilingual help content (DE/EN).
 */

export default {
  moduleId: 'run-chart',
  sections: {
    overview: {
      de: {
        title: 'Run Chart',
        blocks: [
          {
            type: 'paragraph',
            content: 'Ein Run Chart zeigt eine Datenreihe in zeitlicher Reihenfolge und prüft, ob die Reihenfolge zufällig ist. Anders als bei einer Regelkarte werden keine Eingriffsgrenzen berechnet — nur eine Medianlinie. Dafür laufen vier formale Lauftests, die typische Nicht-Zufalls-Muster aufdecken.',
          },
          {
            type: 'definition',
            term: 'Medianlinie',
            content: 'Der {{term:median|Median}} der Werte. Bei zufällig schwankenden Daten liegt etwa die Hälfte der Punkte oberhalb, die andere Hälfte unterhalb. Punkte genau auf dem Median werden in den Tests nicht mitgezählt.',
          },
          {
            type: 'definition',
            term: 'Run um den Median',
            content: 'Eine zusammenhängende Folge von Punkten, die alle auf derselben Seite des Medians liegen. Bei rein zufälligen Daten ist die erwartete Anzahl Runs aus der Anzahl Punkte über/unter dem Median berechenbar.',
          },
          {
            type: 'definition',
            term: 'Run aufwärts/abwärts',
            content: 'Eine Folge fortlaufend steigender oder fortlaufend fallender Werte. Zufällige Reihen produzieren typischerweise viele kurze Wechsel — extrem wenige (lange monotone Strecken) oder extrem viele (Zickzack) sind verdächtig.',
          },
          {
            type: 'paragraph',
            content: 'Run Charts werden in der Measure-Phase eingesetzt, um sich einen ersten Eindruck zu verschaffen, bevor eine Regelkarte aufgesetzt wird. Sie sind weniger formal als Shewhart-Karten, weil sie keine Streuungsannahme benötigen — der Median funktioniert auch bei nicht-normalverteilten Daten.',
          },
        ],
      },
      en: {
        title: 'Run Chart',
        blocks: [
          {
            type: 'paragraph',
            content: 'A run chart shows a data series in time order and tests whether that order looks random. Unlike a control chart it has no control limits — only a {{term:median|median}} line. Four formal runs tests detect typical non-random patterns.',
          },
          {
            type: 'definition',
            term: 'Median line',
            content: 'The median of the values. With random variation about half the points fall above, half below. Points exactly on the median are excluded from the tests.',
          },
          {
            type: 'definition',
            term: 'Run about the median',
            content: 'A consecutive sequence of points all on the same side of the median. For purely random data the expected number of such runs follows from the counts above/below.',
          },
          {
            type: 'definition',
            term: 'Run up/down',
            content: 'A sequence of consecutively increasing or decreasing values. Random series typically produce many short changes — extremely few (long monotone streaks) or extremely many (zigzag) are suspicious.',
          },
          {
            type: 'paragraph',
            content: 'Run charts are used in the Measure phase to get a first feel for the process before setting up a control chart. They are less formal than Shewhart charts because they need no spread assumption — the median works for non-normal data too.',
          },
        ],
      },
    },

    methodology: {
      de: {
        title: 'Die vier Lauftests',
        blocks: [
          {
            type: 'list',
            items: [
              'Clustering — zu wenige Runs um den Median (Punkte „klumpen" auf einer Seite). Hinweis auf Niveauverschiebung oder Mischpopulation.',
              'Mischungen — zu viele Runs um den Median (Punkte wechseln zu oft die Seite). Hinweis auf zwei überlagerte Quellen, etwa zwei Maschinen.',
              'Trends — zu wenige Runs aufwärts/abwärts (lange monotone Strecken). Hinweis auf Drift, Verschleiß, Aufwärm-/Abkühleffekte.',
              'Oszillation — zu viele Runs aufwärts/abwärts (Zickzack). Hinweis auf systematische Hin-und-Her-Verstellung, etwa Übersteuerung im Regler.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Jeder Test liefert einen p-Wert. Wenn p < α (Standard 0,05), ist das Muster signifikant — die Hypothese „rein zufällige Reihenfolge" wird abgelehnt. Mehr als ein gleichzeitig flag-gender Test deutet meist auf eine echte Sonderursache hin.',
          },
        ],
      },
      en: {
        title: 'The Four Runs Tests',
        blocks: [
          {
            type: 'list',
            items: [
              'Clustering — too few runs about the median (points cluster on one side). Indicates a level shift or mixed population.',
              'Mixtures — too many runs about the median (points cross too often). Indicates two superimposed sources, e.g. two machines.',
              'Trends — too few runs up/down (long monotone runs). Indicates drift, wear, warm-up/cool-down effects.',
              'Oscillation — too many runs up/down (zigzag). Indicates systematic over-correction, e.g. controller overshoot.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Each test produces a p-value. If p < α (default 0.05), the pattern is significant — the hypothesis of pure random order is rejected. More than one simultaneously-flagged test usually points to a real special cause.',
          },
        ],
      },
    },

    interpretation: {
      de: {
        title: 'Lesen und Reagieren',
        blocks: [
          {
            type: 'list',
            items: [
              'Zuerst die Form des Charts ansehen — Trends, Zyklen, Sprünge sind oft mit bloßem Auge erkennbar.',
              'Dann die p-Werte prüfen. Ein einzelner kleiner p-Wert kann Zufall sein (multiple Vergleiche!), zwei oder mehr deuten klar auf Struktur hin.',
              'Bei signifikanten Mustern: Ursache suchen, bevor eine Regelkarte aufgebaut wird. Sonderursachen verzerren die Baseline.',
              'Wenn alle Tests grün sind und das Bild zufällig aussieht: Daten eignen sich für eine Regelkarte (I-MR, X̄-R, …).',
            ],
          },
        ],
      },
      en: {
        title: 'Reading and Reacting',
        blocks: [
          {
            type: 'list',
            items: [
              'First inspect the shape — trends, cycles, jumps are often visible by eye.',
              'Then check the p-values. A single small p can be chance (multiple comparisons!), two or more clearly indicate structure.',
              'If patterns are significant: investigate the cause before setting up a control chart. Special causes will bias the baseline.',
              'If all tests pass and the picture looks random: data is ready for a control chart (I-MR, X̄-R, …).',
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
            term: 'Run Chart als Regelkarten-Ersatz',
            content: 'Ein Run Chart zeigt Muster, aber keine Eingriffsgrenzen. Er ersetzt keine Regelkarte für laufende Überwachung — nur deren Voranalyse.',
          },
          {
            type: 'definition',
            term: 'Datenreihenfolge unklar',
            content: 'Lauftests setzen voraus, dass die Reihenfolge der Werte der zeitlichen Erfassung entspricht. Sortierte oder umgruppierte Daten liefern Müll-Ergebnisse.',
          },
          {
            type: 'definition',
            term: 'Zu wenige Datenpunkte',
            content: 'Mit weniger als ~10 Punkten haben die Lauftests fast keine Aussagekraft. Mindestens 15–25 Punkte für sinnvolle p-Werte; bei kleinen Stichproben die Tests nur grob interpretieren.',
          },
          {
            type: 'definition',
            term: 'Multiple Vergleiche',
            content: 'Vier Tests gleichzeitig erhöhen die Falsch-Alarm-Rate. Ein einzelnes p < 0,05 ist nicht stark; signifikant wird das Bild erst, wenn mehrere Tests gleichzeitig anschlagen oder ein Test sehr klein ist.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Run chart as a control chart substitute',
            content: 'A run chart shows patterns but no control limits. It does not replace a control chart for ongoing monitoring — only the pre-analysis.',
          },
          {
            type: 'definition',
            term: 'Unclear data order',
            content: 'Runs tests assume the order of values matches the time of collection. Sorted or regrouped data produces garbage results.',
          },
          {
            type: 'definition',
            term: 'Too few data points',
            content: 'With fewer than ~10 points the runs tests carry almost no power. At least 15–25 points for meaningful p-values; on small samples interpret roughly.',
          },
          {
            type: 'definition',
            term: 'Multiple comparisons',
            content: 'Four simultaneous tests inflate the false-alarm rate. A single p < 0.05 is weak evidence; the picture becomes significant when several tests fire at once or one is very small.',
          },
        ],
      },
    },
  },
};
