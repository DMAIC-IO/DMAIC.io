/**
 * D.Mike — DoE Planner Module Handbook (doe-planner-help.js)
 * Bilingual help content (DE/EN) for the DoE planner module.
 */

export default {
  moduleId: 'doe-planner',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: '{{term:doe|Design of Experiments}} (DoE, Statistische Versuchsplanung) plant Experimente so, dass mit möglichst wenigen Versuchen maximale Erkenntnis über den Einfluss mehrerer Faktoren entsteht. Während man bei der klassischen „ein Faktor nach dem anderen"-Methode viele Versuche braucht und Wechselwirkungen verpasst, liefert DoE strukturierte Designs, die {{term:haupteffekt|Haupt-}} und {{term:wechselwirkung|Wechselwirkungen}} effizient trennen.',
          },
          {
            type: 'definition',
            term: 'Faktor',
            content: 'Ein {{term:faktor|Faktor}} ist eine Einflussgröße, die bewusst variiert wird — z. B. Temperatur, Druck, Zeit, Materialtyp. Faktoren können stetig (Temperatur in °C) oder kategorial (Lieferant A/B) sein.',
          },
          {
            type: 'definition',
            term: 'Stufe (Level)',
            content: 'Die {{term:stufe|Stufen}} sind die konkreten Werte, auf die ein Faktor im Experiment gesetzt wird. 2 Stufen (−1 / +1) sind Standard für {{term:screening-design|Screening}}, 3+ Stufen für Optimierung (z. B. Response Surface).',
          },
          {
            type: 'definition',
            term: 'Zielgröße (Response)',
            content: 'Die {{term:zielgroesse|Zielgröße}} ist die zu optimierende oder zu verstehende Ausgangsgröße — z. B. Ausbeute, Festigkeit, Zykluszeit. Pro Versuch wird sie gemessen.',
          },
          {
            type: 'definition',
            term: 'Vollfaktoriell',
            content: 'Im {{term:vollfaktoriell|Vollplan}} werden alle Kombinationen aller Stufen untersucht. Bei k Faktoren mit 2 Stufen: 2ᵏ Versuche. Genau, aber schnell teuer (6 Faktoren = 64 Versuche).',
          },
          {
            type: 'definition',
            term: 'Teilfaktoriell (Fractional)',
            content: 'Ein {{term:teilfaktoriell|teilfaktorieller Plan}} ist ein bewusst gewählter Anteil des vollfaktoriellen Plans — z. B. ein Halber (2ᵏ⁻¹) oder Viertel. Effizient fürs Screening vieler Faktoren, aber bestimmte Wechselwirkungen werden verwechselt ({{term:konfundierung|Konfundierung}}).',
          },
          {
            type: 'definition',
            term: 'Wechselwirkung',
            content: 'Bei einer {{term:wechselwirkung|Wechselwirkung}} wirken zwei Faktoren nicht unabhängig — der Effekt von A hängt vom Stand von B ab. Wechselwirkungen zu erkennen ist einer der Hauptnutzen von DoE; sie werden in der „ein Faktor nach dem anderen"-Welt komplett übersehen.',
          },
          {
            type: 'definition',
            term: 'Zentralpunkt',
            content: '{{term:zentralpunkt|Zentralpunkte}} sind Versuch(e) in der Mitte des Designbereichs (alle Faktoren auf 0). Dient zur Prüfung von Krümmung und zur Schätzung der reinen Streuung.',
          },
          {
            type: 'definition',
            term: 'Streuungs-DoE (Dual Response)',
            content: 'Beim {{term:streuungs-doe|Streuungs-DoE}} — Designs mit mindestens zwei Replikaten pro Versuchspunkt — schätzt der Planner zusätzlich ein Modell für ln(s²). Damit lassen sich Faktoreinstellungen identifizieren, die die Prozessstreuung unabhängig vom {{term:mittelwert|Mittelwert}} reduzieren — sichtbar im Auswertebereich unterhalb der Designqualität.',
          },
          {
            type: 'paragraph',
            content: 'DoE ist die härteste Waffe der Improve-Phase — wenn man nicht weiß, welche Faktoren wichtig sind, liefert ein Screening-Plan in wenigen Versuchen die Antwort. Wer dagegen seine Faktoren schon kennt und optimieren will, greift zu Response-Surface-Designs.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: '{{term:doe|Design of Experiments}} (DoE) plans experiments so that maximum insight about several factors is gained from as few runs as possible. While the classical "one factor at a time" approach needs many runs and misses interactions, DoE delivers structured designs that efficiently separate {{term:haupteffekt|main effects}} and {{term:wechselwirkung|interactions}}.',
          },
          {
            type: 'definition',
            term: 'Factor',
            content: 'A {{term:faktor|factor}} is an input deliberately varied — e.g. temperature, pressure, time, material type. Factors can be continuous (temperature in °C) or categorical (supplier A/B).',
          },
          {
            type: 'definition',
            term: 'Level',
            content: '{{term:stufe|Levels}} are the concrete values a factor is set to in the experiment. 2 levels (−1 / +1) are standard for {{term:screening-design|screening}}, 3+ levels for optimization (e.g. response surface).',
          },
          {
            type: 'definition',
            term: 'Response',
            content: 'The {{term:zielgroesse|response}} is the output to optimize or understand — e.g. yield, strength, cycle time. Measured once per run.',
          },
          {
            type: 'definition',
            term: 'Full factorial',
            content: 'A {{term:vollfaktoriell|full factorial}} tests all combinations of all levels. With k factors at 2 levels: 2ᵏ runs. Exact but quickly expensive (6 factors = 64 runs).',
          },
          {
            type: 'definition',
            term: 'Fractional factorial',
            content: 'A {{term:teilfaktoriell|fractional factorial}} is a deliberately chosen fraction of the full design — e.g. a half (2ᵏ⁻¹) or quarter. Efficient for screening many factors, but specific interactions become {{term:konfundierung|confounded (aliased)}}.',
          },
          {
            type: 'definition',
            term: 'Interaction',
            content: 'In an {{term:wechselwirkung|interaction}}, two factors do not act independently — the effect of A depends on the level of B. Detecting interactions is one of DoE\'s main benefits; they are entirely missed in the "one factor at a time" world.',
          },
          {
            type: 'definition',
            term: 'Center point',
            content: '{{term:zentralpunkt|Center points}} are run(s) at the center of the design region (all factors at 0). Checks for curvature and estimates pure variation.',
          },
          {
            type: 'definition',
            term: 'Dispersion DoE (dual response)',
            content: 'In {{term:streuungs-doe|dispersion DoE}} — designs with at least two replicates per point — the planner additionally fits a model for ln(s²). This identifies factor settings that reduce process variability independently of the {{term:mittelwert|mean}} — shown in the analysis section below the design quality summary.',
          },
          {
            type: 'paragraph',
            content: 'DoE is the hardest weapon of the Improve phase — if you don\'t know which factors matter, a screening design answers in a few runs. If you already know your factors and want to optimize, use response-surface designs.',
          },
        ],
      },
    },

    workflow: {
      de: {
        title: 'Arbeiten mit dem Modul',
        blocks: [
          {
            type: 'definition',
            term: 'Faktoren und Zielgrößen',
            content: 'Links stehen die Faktoren mit Einheit, Art und Stufen und darunter die Zielgrößen. Stetige Faktoren haben Zahlen als Stufen, kategoriale Namen. Sobald Faktoren, Zielgrößen und Plantyp vollständig sind, entsteht der Plan nach etwa einer Sekunde von selbst.',
          },
          {
            type: 'definition',
            term: 'Plantyp',
            content: 'Die Empfehlung schlägt einen Typ nach Faktorzahl und Stufen vor. Teilfaktorielle Pläne wählen eine Zelle der Auflösungstabelle, Plackett-Burman einen Plan, Taguchi ein Array; optimale Pläne (D, A, G) wählen Modellterme und Laufzahl und können Faktorkombinationen verbieten oder auf schon gemessenen Läufen eines Worksheets aufbauen.',
          },
          {
            type: 'definition',
            term: 'Lauftabelle und Datenblatt',
            content: 'Rechts steht die Vorschau des Plans; Werte darin gehen beim Erstellen ins Datenblatt. Danach werden die Ergebnisse im Datenblatt eingetragen, der Planer zeigt den Füllstand. Ändert sich der Plan, ist das Datenblatt veraltet und lässt sich neu erstellen. Nur echte Konfigurationsänderungen verwerfen den Plan; erneutes Anklicken des aktiven Plantyps oder dieselbe Laufzahl ändert nichts.',
          },
          {
            type: 'definition',
            term: 'Auswertung',
            content: 'Effizienz, VIF, Aliasstruktur und Trennschärfe bewerten den Plan vor dem Versuch. Mit Wiederholungen zeigt die Dispersionsanalyse, welche Faktoren die Streuung beeinflussen; sind alle Ergebnisse da, übergibt ein Knopf das Datenblatt an eine Regression.',
          },
          {
            type: 'definition',
            term: 'EVOP-Projekt',
            content: 'Im Projektmodus wird der Plan zur ersten Phase. Sind ihre Ergebnisse da, entscheidet man: neu zentrieren (um den besten Versuchspunkt), wiederholen oder beenden. Die Zeitleiste zeigt alle Phasen; ein Klick holt eine Phase mit Plan und Datenblatt zurück.',
          },
          {
            type: 'paragraph',
            content: 'Mit gedrückter Alt-Taste erscheinen an Überschriften, Spaltenköpfen und Knöpfen Fragezeichen; ein Klick erklärt das Element.',
          },
        ],
      },
      en: {
        title: 'Working with the module',
        blocks: [
          {
            type: 'definition',
            term: 'Factors and responses',
            content: 'The left side lists the factors with unit, kind and levels, and the responses below. Continuous factors have numbers as levels, categorical ones names. Once factors, responses and design type are complete, the design is built by itself after about a second.',
          },
          {
            type: 'definition',
            term: 'Design type',
            content: 'The recommendation suggests a type by factor count and levels. Fractional factorials choose a cell of the resolution table, Plackett-Burman a design, Taguchi an array; optimal designs (D, A, G) choose model terms and run count and can forbid factor combinations or build on runs already measured in a worksheet.',
          },
          {
            type: 'definition',
            term: 'Run table and datasheet',
            content: 'The right side shows the preview of the design; values entered there go into the datasheet when it is created. Afterwards the results are entered in the datasheet, and the planner shows how far it is filled. When the design changes, the datasheet is outdated and can be recreated. Only actual configuration changes discard the design; clicking the active design type again or entering the same run count changes nothing.',
          },
          {
            type: 'definition',
            term: 'Evaluation',
            content: 'Efficiency, VIF, alias structure and power rate the design before the experiment. With replicates the dispersion analysis shows which factors affect the spread; once all results are in, a button hands the datasheet to a regression.',
          },
          {
            type: 'definition',
            term: 'EVOP project',
            content: 'In project mode the design becomes the first phase. Once its results are in, you decide: recenter (around the best run), repeat or stop. The timeline shows all phases; a click brings a phase back with its design and datasheet.',
          },
          {
            type: 'paragraph',
            content: 'Hold Alt to show question marks at headings, column heads and buttons; a click explains the element.',
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
              'Zielgröße eindeutig festlegen — was soll optimiert oder verstanden werden?',
              'Faktoren und sinnvolle Stufen bestimmen — mit Prozessfachleuten, nicht am Schreibtisch.',
              'Störgrößen identifizieren, die konstant gehalten oder randomisiert werden müssen.',
              'Designtyp wählen: Screening ({{term:plackett-burman|Plackett-Burman}}, fractional 2ᵏ⁻ᵖ), Optimierung (Response Surface, Central Composite), Mischungen (Mixture Designs).',
              'Plan randomisieren — Reihenfolge der Versuche zufällig, nicht systematisch.',
              'Versuche durchführen, Zielgröße messen, Daten sorgfältig aufzeichnen.',
              'Modell anpassen, Hauptwirkungen und Wechselwirkungen bewerten.',
              'Bestätigungsversuche auf den vorhergesagten besten Einstellungen.',
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
              'Clearly define the response — what should be optimized or understood?',
              'Pick factors and sensible levels — with process experts, not at the desk.',
              'Identify noise variables to be held constant or randomized.',
              'Choose a design type: screening (Plackett-Burman, fractional 2ᵏ⁻ᵖ), optimization (response surface, central composite), mixtures.',
              'Randomize — run order random, not systematic.',
              'Run the experiments, measure the response, record data carefully.',
              'Fit the model, assess main effects and interactions.',
              'Confirm with runs at the predicted best settings.',
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
            term: 'Ohne Randomisierung',
            content: 'Wer die Versuche in der Reihenfolge der Standardtabelle fährt, vermischt Faktoreffekte mit Drift über die Zeit (Werkzeugverschleiß, Temperaturänderung). {{term:randomisierung|Randomisierung}} ist Pflicht, nicht optional.',
          },
          {
            type: 'definition',
            term: 'Zu enge Stufenwahl',
            content: 'Wenn die Stufen nah beieinander liegen, ist der Effekt im Rauschen versteckt. Lieber mutig breite Stufen wählen — sie müssen nur noch sinnvoll bleiben, nicht „sicher".',
          },
          {
            type: 'definition',
            term: 'Zu viele Faktoren, zu wenig Wissen',
            content: 'Wer 10 Faktoren gleichzeitig untersucht, bekommt ein riesiges Design und wenig Zeit für jeden Effekt. Faustregel: erst Vorwissen und Priorisierung, dann DoE — nicht umgekehrt.',
          },
          {
            type: 'definition',
            term: 'Wechselwirkungen ignoriert',
            content: 'Ein Halbfaktorieller Plan verwechselt bestimmte Hauptwirkungen mit Wechselwirkungen. Vor der Auswertung die {{term:konfundierung|Konfundierungsstruktur}} und {{term:aufloesung|Auflösung}} anschauen, sonst werden falsche Schlüsse gezogen.',
          },
          {
            type: 'definition',
            term: 'Ein Datenpunkt statt mehrerer',
            content: 'Ein einzelner Wert pro Versuchsbedingung liefert keinen Rausch-Schätzer. Entweder mindestens zwei {{term:replikat|Replikate}} oder Zentralpunkte, sonst bleibt die reine Streuung unbekannt.',
          },
          {
            type: 'definition',
            term: 'Modell ohne Bestätigung',
            content: 'Das gefundene Optimum ist eine Vorhersage — bis es am echten Prozess gefahren wurde, ist es nur eine Gleichung. Bestätigungsversuche sind der entscheidende letzte Schritt.',
          },
          {
            type: 'definition',
            term: 'Extrapolation',
            content: 'Das Modell gilt innerhalb des untersuchten Bereichs. Vorhersagen außerhalb (z. B. noch höhere Temperatur als je getestet) sind reine Spekulation.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'No randomization',
            content: 'Running experiments in the standard-table order confounds factor effects with drift over time (tool wear, temperature change). {{term:randomisierung|Randomization}} is mandatory, not optional.',
          },
          {
            type: 'definition',
            term: 'Levels too narrow',
            content: 'When levels sit close together, the effect hides in the noise. Be bold with wide levels — they need only stay meaningful, not "safe".',
          },
          {
            type: 'definition',
            term: 'Too many factors, too little knowledge',
            content: 'Studying 10 factors at once yields a huge design and little time per effect. Rule of thumb: prior knowledge and prioritization first, DoE second — not the other way around.',
          },
          {
            type: 'definition',
            term: 'Interactions ignored',
            content: 'A half-fractional design confounds certain main effects with interactions. Before analyzing, inspect the {{term:konfundierung|alias structure}} and {{term:aufloesung|resolution}}, otherwise conclusions will be wrong.',
          },
          {
            type: 'definition',
            term: 'One data point per run',
            content: 'A single value per condition provides no noise estimate. Use at least two {{term:replikat|replicates}} or center points, otherwise pure variation remains unknown.',
          },
          {
            type: 'definition',
            term: 'Model without confirmation',
            content: 'The found optimum is a prediction — until it is run on the real process, it is just an equation. Confirmation runs are the decisive final step.',
          },
          {
            type: 'definition',
            term: 'Extrapolation',
            content: 'The model applies inside the studied region. Predictions outside (e.g. even higher temperature than ever tested) are pure speculation.',
          },
        ],
      },
    },
  },
};
