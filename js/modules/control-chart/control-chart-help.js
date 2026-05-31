/**
 * D.Mike — Control Chart Module Handbook (control-chart-help.js)
 * Bilingual help content (DE/EN) for the control chart module.
 */

export default {
  moduleId: 'control-chart',
  sections: {
    overview: {
      de: {
        title: 'Aufbau einer Regelkarte',
        blocks: [
          {
            type: 'paragraph',
            content: 'Eine Regelkarte (Control Chart, SPC-Karte) zeigt den zeitlichen Verlauf eines Prozesskennwerts zusammen mit statistischen Grenzen. Sie unterscheidet zufällige Streuung (Prozess „im Griff") von systematischen Abweichungen (Sonderursachen) — und ist das Standardwerkzeug der Control-Phase, um einen verbesserten Prozess dauerhaft zu überwachen.',
          },
          {
            type: 'definition',
            term: 'Mittellinie (CL)',
            content: 'Der {{term:mittelwert|Mittelwert}} der beobachteten Messwerte oder Teilgruppen-Mittelwerte. Sie repräsentiert das aktuelle Prozessniveau.',
          },
          {
            type: 'definition',
            term: 'UCL und LCL (±3σ)',
            content: 'Obere und untere Eingriffsgrenze, typischerweise im Abstand von 3 {{term:standardabweichung|Standardabweichungen}} vom Mittelwert. Innerhalb dieser Grenzen gelten Abweichungen als zufällig; Werte außerhalb deuten auf eine Sonderursache hin.',
          },
          {
            type: 'definition',
            term: 'Zonen A, B, C',
            content: 'Der Bereich zwischen Mittellinie und Grenzen wird in drei Zonen zu je einer Standardabweichung unterteilt. Western-Electric- und Nelson-Regeln nutzen diese Zonen, um nicht-zufällige Muster zu erkennen.',
          },
          {
            type: 'definition',
            term: 'Sonderursache (special cause)',
            content: 'Ein Einfluss außerhalb der normalen Prozessstreuung — z. B. ein Werkzeugbruch, ein neuer Operator, ein Materialwechsel. Muss identifiziert und beseitigt werden, bevor der Prozess weiterläuft.',
          },
          {
            type: 'definition',
            term: 'Kartentypen',
            content: 'I-MR für Einzelwerte, X̄-R und X̄-S für Teilgruppen, p- und np-Karte für Anteile (defekt/nicht defekt), c- und u-Karte für Zählwerte (Fehler pro Einheit). Die Wahl hängt von Datentyp und Untergruppen ab.',
          },
          {
            type: 'paragraph',
            content: 'Regelkarten verhindern, dass Prozesse unbemerkt driften. Sie sind kein Qualitätsurteil, sondern ein Frühwarnsystem: sie zeigen, dass etwas passiert, bevor die Spezifikation verletzt wird.',
          },
        ],
      },
      en: {
        title: 'Anatomy of a Control Chart',
        blocks: [
          {
            type: 'paragraph',
            content: 'A control chart (SPC chart) plots a process metric over time together with statistical limits. It separates random variation (process "in control") from systematic deviations (special causes) — and is the standard Control-phase tool to keep an improved process in check long-term.',
          },
          {
            type: 'definition',
            term: 'Center line (CL)',
            content: 'The {{term:mittelwert|mean}} of observed values or subgroup means. It represents the current process level.',
          },
          {
            type: 'definition',
            term: 'UCL and LCL (±3σ)',
            content: 'Upper and lower control limits, typically at 3 {{term:standardabweichung|standard deviations}} from the mean. Deviations within are treated as random; points outside indicate a special cause.',
          },
          {
            type: 'definition',
            term: 'Zones A, B, C',
            content: 'The region between center line and limits is divided into three zones of one standard deviation each. Western Electric and Nelson rules use these zones to detect non-random patterns.',
          },
          {
            type: 'definition',
            term: 'Special cause',
            content: 'An influence outside normal process variation — e.g. a tool break, a new operator, a material change. Must be identified and removed before the process continues.',
          },
          {
            type: 'definition',
            term: 'Chart types',
            content: 'I-MR for individuals, X̄-R and X̄-S for subgroups, p and np for proportions (defective/not), c and u for counts (defects per unit). Choice depends on data type and subgroups.',
          },
          {
            type: 'paragraph',
            content: 'Control charts prevent processes from drifting unnoticed. They are not quality verdicts but early-warning systems: they show something is happening before the spec is violated.',
          },
        ],
      },
    },

    stages: {
      de: {
        title: 'Stages — mehrere Baselines',
        blocks: [
          {
            type: 'paragraph',
            content: 'Wenn ein Prozess durch eine bekannte Veränderung neu eingestellt wurde (Werkzeugwechsel, neue Charge, Materialwechsel, Maschinen-Override), liefern globale Grenzen ein verzerrtes Bild — sie mischen die alten und neuen Streuungen. Mit Stages werden für jeden Abschnitt eigene Mittellinie und Eingriffsgrenzen berechnet.',
          },
          {
            type: 'definition',
            term: 'Eingabe',
            content: 'Im Feld „Stage-Grenzen" Indizes mit Komma trennen, an denen jeweils ein neuer Abschnitt beginnt. Beispiel: „12, 25" bei 30 Punkten ergibt drei Stages: 1–12, 13–25, 26–30.',
          },
          {
            type: 'definition',
            term: 'Wirkung',
            content: 'Die Karte zeigt treppenförmige Mittellinie und Grenzen, mit gestrichelten vertikalen Trennlinien an jedem Stage-Wechsel. Nelson-Regeln werden gegen die Grenzen der ersten Stage geprüft (im Multi-Stage-Modus konzentriert die Karte sich auf das Bild „Out-of-Limit").',
          },
          {
            type: 'paragraph',
            content: 'Stages ersetzen den Baseline-Count nicht — sie sind ein anderer Mechanismus. Setze entweder einen Baseline-Count (klassisch Phase I/II) oder Stage-Grenzen (mehrere stabile Abschnitte). Die Stages-Eingabe übersteuert den Baseline-Count, sobald sie gesetzt ist.',
          },
        ],
      },
      en: {
        title: 'Stages — multiple baselines',
        blocks: [
          {
            type: 'paragraph',
            content: 'When a process has been deliberately retuned (tool change, new batch, material switch, machine override), global limits produce a misleading picture — they mix the old and new variation. With stages each section gets its own center line and control limits.',
          },
          {
            type: 'definition',
            term: 'Input',
            content: 'In the "Stage boundaries" field, list indices separated by commas where a new stage starts. Example: "12, 25" with 30 points yields three stages: 1–12, 13–25, 26–30.',
          },
          {
            type: 'definition',
            term: 'Effect',
            content: 'The chart shows stepped center line and limits with dashed vertical separators at each stage break. Nelson rules are evaluated against the first stage\'s limits (in multi-stage mode the chart focuses on the "out-of-limit" view).',
          },
          {
            type: 'paragraph',
            content: 'Stages do not replace the baseline count — they are a different mechanism. Either use a baseline count (classic Phase I/II) or stage boundaries (multiple stable sections). When set, stages override the baseline count.',
          },
        ],
      },
    },

    phase1and2: {
      de: {
        title: 'Phase I / II und Annotationen',
        blocks: [
          {
            type: 'paragraph',
            content: 'Der klassische SPC-Workflow trennt zwei Phasen: Phase I sammelt Vorlaufdaten, identifiziert Sonderursachen und schließt sie aus, bis die Baseline „stabil" ist. Phase II hält die so ermittelten Grenzen fest und prüft neue Datenpunkte gegen sie.',
          },
          {
            type: 'definition',
            term: 'Annotationen (Phase I)',
            content: 'Klick auf eine Regelverletzung in der Tabelle öffnet einen Dialog: Ursache als Freitext eintragen und den Punkt optional aus der Grenzen-Berechnung ausschließen. Ausgeschlossene Punkte erscheinen als graues ✕ — sie stehen weiterhin im Chart, beeinflussen aber UCL/LCL nicht mehr. Die Limits passen sich nach jedem Ausschluss live an.',
          },
          {
            type: 'definition',
            term: 'Phase II — Grenzen einfrieren',
            content: 'Mit „Grenzen einfrieren" werden die aktuellen Limits gespeichert. Anschließend hinzukommende Daten werden gegen diese fixen Limits geprüft, ohne dass UCL/LCL sich verändern. Über „Auftauen" lässt sich der Live-Modus wieder einschalten.',
          },
          {
            type: 'paragraph',
            content: 'Phase II funktioniert nur ohne Stages — bei Multi-Stage-Karten gibt es bereits per Stage eigene Grenzen, ein zusätzliches Einfrieren wäre doppelte Buchführung.',
          },
        ],
      },
      en: {
        title: 'Phase I / II and Annotations',
        blocks: [
          {
            type: 'paragraph',
            content: 'The classic SPC workflow has two phases: Phase I collects baseline data, identifies special causes and excludes them until the baseline is "in control". Phase II locks those limits and checks new data points against them.',
          },
          {
            type: 'definition',
            term: 'Annotations (Phase I)',
            content: 'Click a violation row to open a dialog: record the cause as free text and optionally exclude the point from the limit computation. Excluded points appear as a gray ✕ — they stay on the chart but no longer influence UCL/LCL. Limits update live after each exclusion.',
          },
          {
            type: 'definition',
            term: 'Phase II — Freeze limits',
            content: '"Freeze limits" stores the current limits. Subsequent data points are checked against these fixed limits without UCL/LCL changing. "Thaw" returns to the live recompute mode.',
          },
          {
            type: 'paragraph',
            content: 'Phase II is only available without stages — multi-stage charts already have per-stage limits; an additional freeze would be double bookkeeping.',
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
              'Kartentyp anhand Datentyp und Untergruppierung wählen.',
              'Genügend Vorlaufdaten sammeln — typischerweise 20–25 Teilgruppen oder 100+ Einzelwerte.',
              'Mittellinie und Grenzen aus den Vorlaufdaten berechnen (Phase I).',
              'Auf Ausreißer und Muster prüfen — Sonderursachen aus der Phase I ausschließen und Grenzen neu berechnen.',
              'Laufende Überwachung aufnehmen (Phase II) — jeder neue Punkt wird an den festen Grenzen geprüft.',
              'Bei Regelverletzung die Ursache suchen, dokumentieren und abstellen.',
              'Grenzen nur neu berechnen, wenn der Prozess nachweislich und absichtlich verändert wurde.',
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
              'Pick chart type by data type and subgroup structure.',
              'Collect enough baseline data — typically 20–25 subgroups or 100+ individuals.',
              'Compute center line and limits from the baseline (Phase I).',
              'Check for outliers and patterns — exclude special causes from Phase I and recompute limits.',
              'Start ongoing monitoring (Phase II) — each new point is checked against fixed limits.',
              'On a rule violation, find, document, and eliminate the cause.',
              'Recompute limits only when the process was demonstrably and intentionally changed.',
            ],
          },
        ],
      },
    },

    interpretation: {
      de: {
        title: 'Regeln für Sonderursachen',
        blocks: [
          {
            type: 'list',
            items: [
              '1 Punkt außerhalb der 3σ-Grenzen — deutlich außer Kontrolle.',
              '9 Punkte in Folge auf derselben Seite der Mittellinie — Niveauverschiebung.',
              '6 Punkte in Folge steigend oder fallend — Trend.',
              '14 Punkte alternierend — systematisches Wechselmuster.',
              '2 von 3 Punkten in Zone A (>2σ) — Nähe zur Grenze häufiger als erwartet.',
              '4 von 5 Punkten in Zone B oder A (>1σ) — Prozess streut weiter als normal.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Die Regeln sind Hinweise, nicht Urteile. Jede Verletzung sollte zur Ursachenrecherche führen, nicht automatisch zum Alarm. Zu viele aktivierte Regeln erzeugen Fehlalarme.',
          },
        ],
      },
      en: {
        title: 'Rules for Special Causes',
        blocks: [
          {
            type: 'list',
            items: [
              '1 point outside the 3σ limits — clearly out of control.',
              '9 points in a row on the same side of the center line — level shift.',
              '6 points rising or falling in a row — trend.',
              '14 points alternating — systematic zig-zag.',
              '2 of 3 points in zone A (>2σ) — near-limit excursion more often than expected.',
              '4 of 5 points in zone B or beyond (>1σ) — process spreading wider than normal.',
            ],
          },
          {
            type: 'paragraph',
            content: 'The rules are hints, not verdicts. Every violation should trigger a cause search, not an automatic alarm. Too many active rules create false alarms.',
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
            term: 'Spezifikationsgrenzen statt Regelgrenzen',
            content: 'USL/LSL kommen vom Kunden, UCL/LCL aus den Prozessdaten. Beides zu vermischen (Spezgrenzen in die Karte zu zeichnen und als Eingriffsgrenzen zu behandeln) ist einer der häufigsten SPC-Fehler.',
          },
          {
            type: 'definition',
            term: 'Falscher Kartentyp',
            content: 'Einen I-MR-Chart auf Anteilsdaten oder eine p-Karte auf Einzelmessungen anzuwenden liefert unsinnige Grenzen. Datentyp und Teilgruppenstruktur müssen zum Kartentyp passen.',
          },
          {
            type: 'definition',
            term: 'Zu wenige Vorlaufdaten',
            content: 'Mit 5 Teilgruppen werden die Grenzen instabil — und ändern sich ständig. Mindestens 20–25 Teilgruppen sind nötig, um eine tragfähige Baseline zu bekommen.',
          },
          {
            type: 'definition',
            term: 'Zu viele Regeln aktiviert',
            content: 'Jede zusätzliche Regel erhöht die Fehlalarm-Rate. Wer alle Nelson-Regeln aktiviert, hat im Durchschnitt alle paar Datenpunkte einen „Treffer" — und nimmt die Karte dann nicht mehr ernst.',
          },
          {
            type: 'definition',
            term: 'Grenzen nach jeder Änderung neu berechnen',
            content: 'Wer bei jeder Verletzung die Grenzen nachzieht, sieht den Drift nie. Grenzen nur anpassen, wenn es einen dokumentierten Grund gibt (neuer Prozess, neues Equipment).',
          },
          {
            type: 'definition',
            term: 'Karte ohne Reaktion',
            content: 'Eine Regelkarte ohne zugeordnete Reaktionsprozedur ist Dekoration. Pro Regelverletzung muss klar sein: wer schaut hin, wer entscheidet, wer dokumentiert.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Spec limits instead of control limits',
            content: 'USL/LSL come from the customer, UCL/LCL from process data. Mixing them (drawing spec limits on the chart and treating them as control limits) is among the most common SPC mistakes.',
          },
          {
            type: 'definition',
            term: 'Wrong chart type',
            content: 'Applying an I-MR chart to proportion data or a p-chart to individual measurements yields nonsense limits. Data type and subgroup structure must fit the chart type.',
          },
          {
            type: 'definition',
            term: 'Too few baseline data',
            content: 'With 5 subgroups the limits are unstable and keep shifting. At least 20–25 subgroups are needed for a reliable baseline.',
          },
          {
            type: 'definition',
            term: 'Too many rules enabled',
            content: 'Every extra rule increases the false-alarm rate. Enabling all Nelson rules gives a "hit" every few points on average — and the team stops taking the chart seriously.',
          },
          {
            type: 'definition',
            term: 'Recomputing limits after every change',
            content: 'Pulling limits along with every violation hides the drift. Only adjust limits when there is a documented reason (new process, new equipment).',
          },
          {
            type: 'definition',
            term: 'Chart without reaction',
            content: 'A control chart without a defined reaction procedure is decoration. Per violation, it must be clear: who looks, who decides, who documents.',
          },
        ],
      },
    },
  },
};
