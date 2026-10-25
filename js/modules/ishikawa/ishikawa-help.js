/**
 * D.Mike — Ishikawa Module Handbook (ishikawa-help.js)
 * Bilingual help content (DE/EN) for the Ishikawa (Fishbone) module.
 */

export default {
  moduleId: 'ishikawa',
  sections: {
    overview: {
      de: {
        title: 'Aufbau eines {{term:ishikawa|Ishikawa}}-Diagramms',
        blocks: [
          {
            type: 'paragraph',
            content: 'Das {{term:ishikawa|Ishikawa-Diagramm}} (auch Fishbone-Diagramm oder Ursache-Wirkungs-Diagramm) sammelt mögliche Ursachen für ein definiertes Problem strukturiert nach Hauptkategorien. Es ist eines der Standard-Werkzeuge der Analyze-Phase und entsteht typischerweise im Team-Workshop.',
          },
          {
            type: 'definition',
            term: 'Wirkung (Kopf des Fisches)',
            content: 'Das Problem oder die Abweichung, deren Ursachen gesucht werden — z. B. „Maßabweichung > 0,1 mm", „Lieferverzug > 2 Tage". Wird ganz rechts als „Kopf" notiert.',
          },
          {
            type: 'definition',
            term: 'Hauptgräten (Kategorien)',
            content: 'Die großen Diagonal-Linien — die klassischen 6M sind: Mensch, Maschine, Methode, Material, Mitwelt (Umfeld), Messung. Im Dienstleistungsbereich werden oft die 6P verwendet (People, Process, Place, Product, Procedures, Policies).',
          },
          {
            type: 'definition',
            term: 'Ursachen (Nebengräten)',
            content: 'Konkrete potenzielle Ursachen, die an die jeweilige Hauptgräte angehängt werden. Eine Ursache kann weiter aufgegliedert werden — daraus ergeben sich Tertiär-Gräten.',
          },
          {
            type: 'definition',
            term: 'Tiefe (Detaillierungsgrad)',
            content: 'Mehrstufige Gräten erlauben es, durch wiederholtes „Warum?" tiefer zu graben. Drei Ebenen reichen meist aus — alles darunter wird unübersichtlich. Für tiefere Wurzelursachen-Analyse das 5-Why-Modul nutzen.',
          },
          {
            type: 'paragraph',
            content: 'Das Ishikawa ist kein Beweis-Werkzeug — es ist eine strukturierte Sammlung von Hypothesen. Welche Ursachen tatsächlich relevant sind, wird anschließend mit Daten geprüft ({{term:ce-matrix|C&E-Matrix}}, Hypothesentests, DOE).',
          },
        ],
      },
      en: {
        title: 'Anatomy of an Ishikawa Diagram',
        blocks: [
          {
            type: 'paragraph',
            content: 'The Ishikawa diagram (also called {{term:ishikawa|fishbone}} or cause-and-effect diagram) collects possible causes of a defined problem, structured by main categories. It is one of the standard tools of the Analyze phase and is typically developed in a team workshop.',
          },
          {
            type: 'definition',
            term: 'Effect (head of the fish)',
            content: 'The problem or deviation whose causes are sought — e.g. "Dimensional deviation > 0.1 mm", "Delivery delay > 2 days". Written on the far right as the "head".',
          },
          {
            type: 'definition',
            term: 'Main bones (categories)',
            content: 'The large diagonal lines — the classic 6M are: Man, Machine, Method, Material, Mother Nature (environment), Measurement. In services, 6P are often used (People, Process, Place, Product, Procedures, Policies).',
          },
          {
            type: 'definition',
            term: 'Causes (sub-bones)',
            content: 'Specific potential causes attached to each main bone. A cause can be broken down further into tertiary bones.',
          },
          {
            type: 'definition',
            term: 'Depth (level of detail)',
            content: 'Multi-level bones allow you to dig deeper by repeated "why?". Three levels are usually enough — anything beyond becomes confusing. For deeper root-cause analysis, use the 5-Why module.',
          },
          {
            type: 'paragraph',
            content: 'The Ishikawa is not a proof tool — it is a structured collection of hypotheses. Which causes are actually relevant is verified afterwards with data (C&E matrix, hypothesis tests, DOE).',
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
            term: 'Problem',
            content: 'Die Problemaussage hält fest, was wo in welchem Ausmaß abweicht. Zwei Bildergalerien grenzen ab, was zum Problem gehört und was nicht.',
          },
          {
            type: 'definition',
            term: 'Fakten',
            content: 'Gesicherte Beobachtungen mit Datum und wer sie gemeldet hat. Sie stützen die Ursachensuche, bevor bewertet wird.',
          },
          {
            type: 'definition',
            term: 'Hypothesen',
            content: 'Der Ursachenbaum: Hauptursachen tragen eine der sechs Kategorien, Unterursachen erben sie. Jedes Mitglied des Expertenteams bewertet jede Ursache von 0 (unwahrscheinlich) bis 9 (sehr wahrscheinlich); der Mittelwert ordnet das Pareto. Ein Snapshot hält den Stand fest, der Vergleich markiert neue und geänderte Ursachen, der Trend zeigt die Mittelwerte über mehrere Snapshots.',
          },
          {
            type: 'definition',
            term: 'Experimente',
            content: 'Jedes Experiment prüft eine oder mehrere Ursachen, mit Verantwortlichem, Zeitraum und Kosten. Gantt-Diagramm und Kostenverlauf zeigen Plan und Aufwand.',
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
            term: 'Problem',
            content: 'The problem statement records what deviates, where, by how much. Two image galleries draw the line between what belongs to the problem and what does not.',
          },
          {
            type: 'definition',
            term: 'Facts',
            content: 'Established observations with a date and who reported them. They support the search for causes before anything is rated.',
          },
          {
            type: 'definition',
            term: 'Hypotheses',
            content: 'The cause tree: main causes carry one of the six categories, sub-causes inherit it. Every member of the expert team rates every cause from 0 (unlikely) to 9 (very likely); the mean orders the Pareto. A snapshot keeps the state, the comparison marks new and changed causes, the trend shows the means across several snapshots.',
          },
          {
            type: 'definition',
            term: 'Experiments',
            content: 'Each experiment tests one or more causes, with a person responsible, a period and cost. The Gantt chart and the cost charts show plan and effort.',
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
              'Wirkung präzise formulieren — eine konkrete, messbare Abweichung, kein vages Ziel.',
              'Hauptkategorien wählen: 6M für Fertigung, 6P für Service, oder eigene passende Kategorien.',
              'Im Workshop alle Beteiligten zu Wort kommen lassen — Brainstorming ohne Bewertung.',
              'Ursachen pro Kategorie sammeln — erst quantitativ, dann ordnen.',
              'Bei wichtigen Ursachen mit „Warum?" weiter aufgliedern, bis eine konkrete Wurzel sichtbar wird.',
              'Die priorisierten Ursachen in die C&E-Matrix übertragen oder direkt mit Hypothesentests prüfen.',
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
              'Phrase the effect precisely — a concrete, measurable deviation, not a vague goal.',
              'Pick main categories: 6M for manufacturing, 6P for services, or your own fitting categories.',
              'In the workshop, give everyone a voice — brainstorming without judgment.',
              'Collect causes per category — first volume, then order.',
              'For important causes, drill down with "why?" until a concrete root becomes visible.',
              'Move the prioritized causes into the C&E matrix or directly into hypothesis tests.',
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
            term: 'Wirkung zu vage',
            content: '„Qualität schlecht" lässt sich nicht analysieren. Eine messbare, abgrenzbare Wirkung formulieren — dann werden auch die Ursachen konkret.',
          },
          {
            type: 'definition',
            term: 'Symptome statt Ursachen',
            content: '„Maschine fällt aus" ist eine Wirkung, keine Ursache. Mit „Warum fällt sie aus?" weiter graben — bis eine technisch oder organisatorisch beeinflussbare Ursache sichtbar wird.',
          },
          {
            type: 'definition',
            term: 'Kategorie 6M wird zur Pflichtübung',
            content: 'Wenn jede Kategorie zwanghaft mit Ursachen befüllt wird, entstehen sinnlose Einträge. Lieber bewusst leer lassen, als künstlich Material für „Mensch" zu erfinden.',
          },
          {
            type: 'definition',
            term: 'Hypothesen werden zu Fakten',
            content: 'Was im Ishikawa steht, ist eine Vermutung. Bevor Verbesserungsmaßnahmen abgeleitet werden, mit Daten prüfen — sonst werden viel Geld und Zeit für Scheinursachen ausgegeben.',
          },
          {
            type: 'definition',
            term: 'Allein erstellt',
            content: 'Ishikawa lebt von verschiedenen Perspektiven. Operatoren, Instandhaltung, Qualität und Engineering im selben Workshop bringen oft Ursachen ans Licht, an die niemand allein gedacht hätte.',
          },
          {
            type: 'definition',
            term: 'Übermäßige Tiefe',
            content: 'Mehr als drei Ebenen werden unübersichtlich. Wer tiefer graben will, sollte für die wichtigen Stränge ein eigenes 5-Why-Modul aufmachen.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Effect too vague',
            content: '"Quality is bad" cannot be analyzed. Formulate a measurable, bounded effect — then the causes also become concrete.',
          },
          {
            type: 'definition',
            term: 'Symptoms instead of causes',
            content: '"Machine fails" is an effect, not a cause. Drill down with "why does it fail?" until a technically or organizationally actionable cause becomes visible.',
          },
          {
            type: 'definition',
            term: '6M as compulsory exercise',
            content: 'If every category is forced full of causes, meaningless entries appear. Leave categories empty deliberately rather than inventing artificial "Man" material.',
          },
          {
            type: 'definition',
            term: 'Hypotheses become facts',
            content: 'Whatever sits in the Ishikawa is a guess. Before deriving improvement actions, verify with data — otherwise lots of money and time go into phantom causes.',
          },
          {
            type: 'definition',
            term: 'Built alone',
            content: 'Ishikawa lives from different perspectives. Operators, maintenance, quality, and engineering in the same workshop often surface causes nobody would have thought of alone.',
          },
          {
            type: 'definition',
            term: 'Excessive depth',
            content: 'More than three levels become confusing. Anyone who wants to drill deeper should open a dedicated 5-Why module for the important branches.',
          },
        ],
      },
    },
  },
};
