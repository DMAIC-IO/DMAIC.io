/**
 * D.Mike — Attribute Control Chart Module Handbook (attribute-control-chart-help.js)
 * Bilingual help content (DE/EN) for the attribute control chart module.
 */

export default {
  moduleId: 'attribute-control-chart',
  sections: {
    overview: {
      de: {
        title: 'Attributive Regelkarten',
        blocks: [
          {
            type: 'paragraph',
            content: 'Attributive {{term:regelkarte|Regelkarten}} überwachen Prozesse mit gezählten statt gemessenen Daten — Anzahl fehlerhafter Einheiten, Anzahl Fehler pro Einheit. Sie sind das Pendant zu Shewhart-Karten (I-MR, X̄-R) für Variablendaten und unterscheiden zufällige Streuung von systematischen {{term:sonderursache|Sonderursachen}}.',
          },
          {
            type: 'definition',
            term: 'p-Karte (Anteil fehlerhaft) — siehe {{term:p-chart|p-Karte}}',
            content: 'Anteil defekter Einheiten pro Stichprobe. Stichprobengröße darf variieren. Grundlage: Binomialverteilung. Beispiel: Tagesproduktion 1.000–2.000 Stück, Anzahl Ausschuss pro Tag.',
          },
          {
            type: 'definition',
            term: 'np-Karte (Anzahl fehlerhaft)',
            content: 'Absolute Anzahl defekter Einheiten bei konstanter Stichprobengröße n. Einfacher zu interpretieren als die p-Karte, aber nur sinnvoll, wenn n wirklich konstant ist.',
          },
          {
            type: 'definition',
            term: 'c-Karte (Fehler pro Einheit, konstante Gelegenheit) — siehe {{term:c-chart|c-Karte}}',
            content: 'Anzahl der Fehler pro Inspektionseinheit, wobei die „Inspektionsgelegenheit" (Fläche, Länge, Volumen, Zeit) konstant ist. Grundlage: Poisson-Verteilung. Beispiel: Lackfehler pro Karosserie.',
          },
          {
            type: 'definition',
            term: 'u-Karte (Fehler pro Einheit, variable Gelegenheit)',
            content: 'Fehler pro Inspektionseinheit, wenn die Gelegenheit variiert (z. B. unterschiedlich große Stoffrollen). Die Karte plottet Fehler/Einheit; die Eingriffsgrenzen variieren mit der jeweiligen Inspektionsmenge.',
          },
          {
            type: 'paragraph',
            content: 'Variable Eingriffsgrenzen: Bei p- und u-Karten mit unterschiedlichen Stichprobengrößen sind UCL und LCL pro Punkt verschieden — die Karte zeigt eine treppenförmige Grenzlinie. {{term:sigma-zonen|Zonen A/B/C}} werden nicht eingezeichnet, weil σ nicht konstant ist.',
          },
        ],
      },
      en: {
        title: 'Attribute Control Charts',
        blocks: [
          {
            type: 'paragraph',
            content: 'Attribute {{term:regelkarte|control charts}} monitor processes with counted (not measured) data — number of defective units, number of defects per unit. They are the counterpart to Shewhart charts (I-MR, X̄-R) for variables data, separating random variation from systematic {{term:sonderursache|special causes}}.',
          },
          {
            type: 'definition',
            term: 'p chart (fraction defective) — see {{term:p-chart|p chart}}',
            content: 'Proportion of defective units per sample. Sample size may vary. Basis: binomial distribution. Example: daily production 1,000–2,000 pieces, number of rejects per day.',
          },
          {
            type: 'definition',
            term: 'np chart (number defective)',
            content: 'Absolute number of defective units with constant sample size n. Easier to interpret than the p chart, but only meaningful when n really is constant.',
          },
          {
            type: 'definition',
            term: 'c chart (defects per unit, constant area) — see {{term:c-chart|c chart}}',
            content: 'Number of defects per inspection unit when the inspection opportunity (area, length, volume, time) is constant. Basis: Poisson distribution. Example: paint defects per car body.',
          },
          {
            type: 'definition',
            term: 'u chart (defects per unit, variable area)',
            content: 'Defects per inspection unit when the opportunity varies (e.g. fabric rolls of different sizes). The chart plots defects/unit; control limits vary with the actual inspection size per point.',
          },
          {
            type: 'paragraph',
            content: 'Variable control limits: for p and u charts with different sample sizes, UCL and LCL differ per point — the chart shows a stepped limit line. Zones A/B/C are not drawn because σ is not constant.',
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
              'Datentyp prüfen: Zählen wir defekte Einheiten (p, np) oder Fehleranzahl (c, u)?',
              'Untergruppengröße prüfen: konstant (np, c) oder variabel (p, u)?',
              'Mindestens 20–25 Untergruppen Vorlauf für eine stabile Baseline sammeln.',
              'Bei p-/np-Karten: ausreichend großes n, damit n·p̄ ≥ 5 (sonst sind die Grenzen unsymmetrisch und unzuverlässig).',
              'Phase I: {{term:mittellinie|Mittellinie}} und Grenzen aus dem Vorlauf berechnen.',
              'Sonderursachen identifizieren, ausschließen, Grenzen ggf. neu berechnen.',
              'Phase II: Laufender Betrieb mit fixen Grenzen — neue Punkte werden geprüft, nicht in die Berechnung gemischt.',
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
              'Check the data type: are we counting defective units (p, np) or defect counts (c, u)?',
              'Check {{term:subgruppe|subgroup}} size: constant (np, c) or variable (p, u)?',
              'Collect at least 20–25 subgroups of baseline data for stable limits.',
              'For p/np: ensure n is large enough that n·p̄ ≥ 5 (otherwise limits are asymmetric and unreliable).',
              'Phase I: compute center line and limits from the baseline.',
              'Identify and exclude special causes, recompute limits if needed.',
              'Phase II: ongoing monitoring with fixed limits — new points are checked, not mixed back into the computation.',
            ],
          },
        ],
      },
    },

    interpretation: {
      de: {
        title: 'Regeln und Auswertung',
        blocks: [
          {
            type: 'paragraph',
            content: 'Auf attributiven Karten gelten dieselben Grundprinzipien wie auf Shewhart-Karten: Werte außerhalb der Grenzen, Niveauverschiebungen und Trends weisen auf Sonderursachen hin. Wegen der diskreten Zählwerte und (bei p/u) variabler σ ist der Regelsatz eingeschränkt.',
          },
          {
            type: 'list',
            items: [
              'Regel 1: 1 Punkt außerhalb UCL/LCL — eindeutige Sonderursache.',
              'Regel 2: 9 aufeinanderfolgende Punkte auf derselben Seite der Mittellinie — Niveauverschiebung.',
              'Regel 3: 6 aufeinanderfolgende steigende oder fallende Punkte — Trend.',
              'Regel 5/6 (nur konstante Untergruppengröße): Zonen-basierte Frühwarnungen wie bei Shewhart-Karten.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Regel 4 (14 alternierend) wird für attributive Karten nicht empfohlen, weil Zählwerte häufig Gleichstände produzieren. Bei variabler Untergruppengröße sind die zonenbasierten Regeln 5–8 nicht definiert.',
          },
        ],
      },
      en: {
        title: 'Rules and Evaluation',
        blocks: [
          {
            type: 'paragraph',
            content: 'Attribute charts use the same principles as Shewhart charts: out-of-limit points, level shifts, and trends indicate special causes. Because of discrete counts and (for p/u) variable σ, the rule set is reduced.',
          },
          {
            type: 'list',
            items: [
              'Rule 1: 1 point outside UCL/LCL — clear special cause.',
              'Rule 2: 9 consecutive points on the same side of the center line — level shift.',
              'Rule 3: 6 consecutive increasing or decreasing points — trend.',
              'Rules 5/6 (constant subgroup size only): zone-based early warnings, like on Shewhart charts.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Rule 4 (14 alternating) is not recommended for attribute charts because count data frequently produces ties. With variable subgroup size, zone-based rules 5–8 are not defined.',
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
            term: 'Falscher Kartentyp',
            content: 'p- und np-Karten brauchen Anteilsdaten (defekt/nicht defekt pro Einheit). c- und u-Karten brauchen Fehleranzahlen (mehrere Fehler pro Einheit möglich). Verwechslung führt zu falschen Grenzen.',
          },
          {
            type: 'definition',
            term: 'Zu kleines n bei p-/np-Karten',
            content: 'Wenn n·p̄ < 5, wird die Binomialverteilung schlecht durch eine Normalverteilung approximiert. Die 3σ-Grenzen sind dann unsymmetrisch und können den Prozess als "stabiler" zeigen, als er ist.',
          },
          {
            type: 'definition',
            term: 'Konstante Grenzen bei variablem n',
            content: 'Bei p- und u-Karten mit variabler Stichprobengröße müssen die Grenzen pro Punkt berechnet werden. Eine pauschale Mittel-Grenze unterschätzt das Risiko bei kleinen n und überschätzt es bei großen n.',
          },
          {
            type: 'definition',
            term: 'Überdispersion ignorieren',
            content: 'Wenn die tatsächliche Streuung größer ist als von Binomial/Poisson erwartet (z. B. heterogene Stichproben, gemischte Quellen), schlagen Standard-p/u-Karten ständig falsch Alarm. Hier helfen Laney p\'/u\'-Karten — derzeit nicht implementiert.',
          },
          {
            type: 'definition',
            term: 'Fehler-Definition uneinheitlich',
            content: 'Wer „Fehler" pro Einheit zählt, muss vorher festlegen, was als Fehler gilt. Wechselnde Definitionen (oder Inspekteure) erzeugen Streuung, die fälschlich dem Prozess zugeschrieben wird.',
          },
          {
            type: 'definition',
            term: 'Spezifikation und Eingriffsgrenze verwechseln — {{term:spezifikationsgrenzen|USL/LSL}} vs. {{term:regelgrenze|UCL/LCL}}',
            content: 'Auch bei attributiven Karten gilt: UCL/LCL kommen aus den Daten, nicht aus einer Spezifikation. Eine Forderung „weniger als 2% Ausschuss" ist eine Spezifikation, keine Regelgrenze.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Wrong chart type',
            content: 'p and np charts need fraction data (defective/not defective per unit). c and u charts need defect counts (multiple defects per unit possible). Mixing them yields wrong limits.',
          },
          {
            type: 'definition',
            term: 'Too small n for p/np charts',
            content: 'When n·p̄ < 5 the binomial distribution is poorly approximated by a normal. The 3σ limits become asymmetric and can make the process look more stable than it is.',
          },
          {
            type: 'definition',
            term: 'Constant limits on variable n',
            content: 'For p and u charts with varying sample size, limits must be computed per point. A blanket mean limit underestimates risk for small n and overestimates it for large n.',
          },
          {
            type: 'definition',
            term: 'Ignoring overdispersion',
            content: 'When real variation is larger than binomial/Poisson predicts (heterogeneous samples, mixed sources), standard p/u charts trigger constant false alarms. Laney p\'/u\' charts help — not yet implemented.',
          },
          {
            type: 'definition',
            term: 'Inconsistent defect definition',
            content: 'Counting "defects per unit" requires a clear definition of what counts. Shifting definitions (or inspectors) create variation that gets falsely attributed to the process.',
          },
          {
            type: 'definition',
            term: 'Specification vs. control limits — {{term:spezifikationsgrenzen|USL/LSL}} vs. {{term:regelgrenze|UCL/LCL}}',
            content: 'On attribute charts too: UCL/LCL come from the data, not from a specification. "Less than 2% reject" is a spec, not a control limit.',
          },
        ],
      },
    },
  },
};
