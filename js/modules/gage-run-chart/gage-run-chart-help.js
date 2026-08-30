/**
 * D.Mike — Gage Run Chart Module Handbook (gage-run-chart-help.js)
 * Bilingual help content (DE/EN).
 */

export default {
  moduleId: 'gage-run-chart',
  sections: {
    overview: {
      de: {
        title: 'Messverlaufsdiagramm',
        blocks: [
          {
            type: 'paragraph',
            content: 'Das Messverlaufsdiagramm zeigt **jede einzelne Messung** einer Prüfmittelstudie: gruppiert in ein Feld je Prüfeinheit, farblich und symbolisch getrennt nach Prüfer, gegen eine gemeinsame waagerechte Referenzlinie. Es rechnet nichts aus — es macht sichtbar, was eine Kennzahl verdichtet.',
          },
          {
            type: 'paragraph',
            content: 'In Minitab liegt es unter *Statistik → Qualitätswerkzeuge → Messsystemanalyse → Messverlaufsdiagramm*. Es ist **nicht** dasselbe wie das Verlaufsdiagramm ({{term:run-chart|Run Chart}}) — jenes zeigt eine einzelne Reihe über die Zeit mit Medianlinie und vier Lauftests und hat mit Messmitteln nichts zu tun.',
          },
          {
            type: 'definition',
            term: 'Feld je Prüfeinheit',
            content: 'Jedes Feld enthält alle Messungen an einer Prüfeinheit. Innerhalb des Felds stehen die Prüfer blockweise nebeneinander, ihre Wiederholmessungen sind verbunden.',
          },
          {
            type: 'definition',
            term: 'Referenzlinie',
            content: 'Standardmäßig der {{term:mittelwert|Mittelwert}} aller Messwerte. Ein eigener Wert lässt sich eintragen — etwa der bekannte Referenzwert eines Normals oder die Mitte des Toleranzbands.',
          },
        ],
      },
      en: {
        title: 'Gage Run Chart',
        blocks: [
          {
            type: 'paragraph',
            content: 'The gage run chart shows **every single measurement** of a gage study: grouped into one panel per part, separated by colour and symbol per operator, against a common horizontal reference line. It computes nothing — it makes visible what a summary statistic compresses away.',
          },
          {
            type: 'paragraph',
            content: 'In Minitab it lives under *Stat → Quality Tools → Gage Study → Gage Run Chart*. It is **not** the run chart — that one shows a single series over time with a median line and four runs tests, and has nothing to do with gages.',
          },
          {
            type: 'definition',
            term: 'Panel per part',
            content: 'Each panel holds every measurement taken on one part. Inside the panel the operators sit in contiguous blocks, their repeat measurements connected by a line.',
          },
          {
            type: 'definition',
            term: 'Reference line',
            content: 'The mean of all measurements by default. A custom value can be entered — the known value of a standard, say, or the centre of the tolerance band.',
          },
        ],
      },
    },

    methodology: {
      de: {
        title: 'Daten & Bedienung',
        blocks: [
          {
            type: 'list',
            items: [
              'Long/tidy-Format mit zwei Pflicht-Spalten: **Prüfeinheit** und **Messwert**. Jede Zeile ist eine Einzelmessung.',
              'Optionale **Prüfer**-Spalte. Fehlt sie, wird je Prüfeinheit eine einzelne Reihe gezeichnet — sinnvoll für Studien mit nur einem Prüfer oder automatisierten Messsystemen.',
              'Die Reihenfolge der Zeilen im Arbeitsblatt definiert die Wiederholung. Eine eigene Wiederholungs-Spalte gibt es bewusst nicht.',
              'Prüfeinheiten werden numerisch sortiert, wenn alle Bezeichner Zahlen sind (3, 4, 10, 15), sonst alphabetisch.',
              'Prüfer behalten die Reihenfolge ihres ersten Auftretens im Arbeitsblatt — eine bewusst gewählte Reihenfolge bleibt damit erhalten.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Bei vielen Prüfeinheiten bricht die Darstellung in mehrere Zeilen um. Alle Zeilen teilen sich dieselbe Y-Skala und dieselbe Referenzlinie, sind also direkt vergleichbar. Über „Prüfeinheiten je Zeile" lässt sich der Umbruch steuern.',
          },
          {
            type: 'paragraph',
            content: 'Die fünf Freitextfelder unter „Prüfmittelinformationen" dokumentieren die Studie (Messgerät, Datum, Berichtersteller, Toleranz, Sonstiges) und erscheinen über dem Diagramm. Sie werden mit dem Projekt gespeichert.',
          },
        ],
      },
      en: {
        title: 'Data & operation',
        blocks: [
          {
            type: 'list',
            items: [
              'Long/tidy layout with two required columns: **parts** and **measurement data**. Each row is one individual measurement.',
              'Optional **operators** column. Without it a single series per part is drawn — useful for single-operator studies or automated measuring systems.',
              'Row order in the worksheet defines the repeat. There is deliberately no separate trial column.',
              'Parts are ordered numerically when every label is a number (3, 4, 10, 15), alphabetically otherwise.',
              'Operators keep the order of their first appearance in the worksheet, so a deliberately chosen order survives.',
            ],
          },
          {
            type: 'paragraph',
            content: 'With many parts the display wraps into several rows. All rows share one y-scale and one reference line and are therefore directly comparable. "Parts per row" controls the wrap.',
          },
          {
            type: 'paragraph',
            content: 'The five free-text fields under "Gage information" document the study (gage, date, reporter, tolerance, misc) and appear above the chart. They are stored with the project.',
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
              '**Ein Prüfer liegt durchgehend höher oder tiefer** als die anderen: Hinweis auf Prüfer-Bias — unterschiedliche Ablesegewohnheit, Aufspannung oder Auslegung der Prüfvorschrift.',
              '**Ein Prüfer streut sichtbar breiter**: schlechte Wiederholpräzision bei diesem Prüfer. Die Verbindungslinien zwischen den Wiederholmessungen zeigen das direkt.',
              '**Große senkrechte Sprünge innerhalb eines Felds**: die Wiederholmessungen an derselben Prüfeinheit gehen auseinander — das Messsystem ist an dieser Stelle nicht reproduzierbar.',
              '**Felder streuen stark untereinander, innerhalb aber wenig**: das ist der Normalfall einer brauchbaren Prüfmittelstudie — die {{term:teile-variation|Teile-zu-Teile-Streuung}} dominiert.',
              '**Alle Felder liegen dicht beieinander**: die Prüfeinheiten decken den Prozessbereich nicht ab. Die Studie kann das Messsystem so nicht sinnvoll bewerten.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Das Diagramm liefert keine Kennzahlen. Für %GRR, Wiederholpräzision und Vergleichspräzision gehört eine {{term:gage-rr|Prüfmittelfähigkeitsstudie}} daneben — Typ 2 für variable, Typ 5 für attributive Merkmale. Das Messverlaufsdiagramm zeigt, *warum* eine Kennzahl so ausfällt.',
          },
        ],
      },
      en: {
        title: 'Interpretation',
        blocks: [
          {
            type: 'list',
            items: [
              '**One operator sits consistently high or low** versus the others: operator bias — different reading habits, fixturing, or reading of the inspection instruction.',
              '**One operator scatters visibly wider**: poor repeatability for that operator. The lines connecting repeat measurements show this directly.',
              '**Large vertical jumps inside one panel**: repeat measurements on the same part disagree — the measuring system is not reproducible there.',
              '**Panels differ a lot, within-panel scatter is small**: the normal picture of a usable gage study — part-to-part variation dominates.',
              '**All panels sit close together**: the parts do not span the process range. The study cannot meaningfully assess the measuring system that way.',
            ],
          },
          {
            type: 'paragraph',
            content: 'The chart yields no numbers. For %GRR, repeatability and reproducibility run a {{term:gage-rr|gage study}} alongside — type 2 for variable, type 5 for attribute characteristics. The gage run chart shows *why* a number came out the way it did.',
          },
        ],
      },
    },

    pitfalls: {
      de: {
        title: 'Stolpersteine',
        blocks: [
          {
            type: 'list',
            items: [
              '**Namensverwechslung.** „Messverlaufsdiagramm" ist der Gage Run Chart, „Verlaufsdiagramm" der Run Chart. Wer die Lauftests sucht, ist im Modul Verlaufsdiagramm richtig.',
              '**Unbalancierter Versuchsplan.** Fehlt einem Prüfer eine Prüfeinheit, wird das als Warnung gemeldet. Das Diagramm bleibt lesbar, aber die Felder sind nicht mehr direkt vergleichbar.',
              '**Zu viele Prüfeinheiten je Zeile.** Ab etwa zehn Feldern pro Zeile werden die Punkte ununterscheidbar. Lieber den Umbruch verkleinern als das Diagramm breiter ziehen.',
              '**Attributive Daten.** Bei 0/1-Ergebnissen liegen fast alle Punkte auf zwei Höhen — genau das macht die wenigen Abweichler auffällig. Der Mittelwert als Referenzlinie ist dann aber kaum interpretierbar.',
              '**Reihenfolge im Arbeitsblatt.** Da die Zeilenreihenfolge die Wiederholung definiert, verändert Sortieren des Arbeitsblatts die Verbindungslinien.',
            ],
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'list',
            items: [
              '**Name confusion.** German Minitab calls the gage run chart "Messverlaufsdiagramm" and the run chart "Verlaufsdiagramm". If you are after the runs tests, use the run chart module.',
              '**Unbalanced design.** A part missing for one operator is reported as a warning. The chart stays readable, but the panels are no longer directly comparable.',
              '**Too many parts per row.** Beyond roughly ten panels per row the points become indistinguishable. Reduce the wrap rather than widening the chart.',
              '**Attribute data.** With 0/1 results almost all points sit at two heights — which is exactly what makes the few deviants stand out. The mean as a reference line, however, is then barely interpretable.',
              '**Worksheet order.** Because row order defines the repeat, sorting the worksheet changes the connecting lines.',
            ],
          },
        ],
      },
    },
  },
};
