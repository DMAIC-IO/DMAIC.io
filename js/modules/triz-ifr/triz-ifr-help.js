/**
 * D.Mike — TRIZ Ideal Final Result Module Handbook
 * Bilingual help content (DE/EN) for the IFR worksheet.
 */

export default {
  moduleId: 'triz-ifr',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Das **Ideale Endresultat** (IFR — Ideal Final Result) ist eines der zentralen {{term:triz|TRIZ}}-Werkzeuge: Bevor man Kompromisse sucht, formuliert das Team den Idealzustand — die nützliche Funktion wird erfüllt, **das System selbst verschwindet**, **es entstehen keine Kosten**, **keine Komplikation**, **keine schädliche Nebenwirkung**. Von diesem Idealzustand aus rückwärts zu arbeiten ist erfahrungsgemäß ergiebiger als inkrementelle Optimierung vom Status quo.',
          },
          {
            type: 'paragraph',
            content: 'Altschuller unterscheidet drei IFR-Stufen — zunehmend radikal:',
          },
          {
            type: 'definition',
            term: 'IFR-1: System löst das Problem selbst',
            content: 'Das System bleibt erhalten, aber die schädliche Wirkung verschwindet ohne neuen Mechanismus. „Der Bandförderer verhindert das Verklemmen von selbst."',
          },
          {
            type: 'definition',
            term: 'IFR-2: Funktion ohne System',
            content: 'Die nützliche Funktion entsteht, ohne dass das System überhaupt existiert. „Das Material verklemmt nicht." Das Problem existiert nicht mehr.',
          },
          {
            type: 'definition',
            term: 'IFR-3: Supersystem-Ressource erfüllt die Funktion',
            content: 'Eine bereits vorhandene Ressource aus dem {{term:supersystem|Supersystem}} (Schwerkraft, Umgebungswärme, Luftströmung …) übernimmt die Aufgabe — kostenfrei, ohne neue Komponente.',
          },
          {
            type: 'paragraph',
            content: 'Das Modul **erzeugt keine Lösungen** — es zwingt zur scharfen Formulierung des Ziels und zur Gap-Analyse: Was hindert das System heute am IFR? Diese Lücke ist die eigentliche Problemstellung.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'The **Ideal Final Result** (IFR) is one of {{term:triz|TRIZ}}\'s central tools: before seeking compromises, the team formulates the ideal state — the useful function is fulfilled, **the system itself disappears**, **for free**, **with no complication**, **and no harmful side-effect**. Working backwards from that ideal is far more productive than incremental improvement from the status quo.',
          },
          {
            type: 'paragraph',
            content: 'Altshuller distinguishes three IFR levels — increasingly radical:',
          },
          {
            type: 'definition',
            term: 'IFR-1: The system solves the problem itself',
            content: 'The system remains, but the harmful effect disappears without a new mechanism. "The conveyor itself prevents jamming."',
          },
          {
            type: 'definition',
            term: 'IFR-2: Function without the system',
            content: 'The useful function exists without the system being present at all. "Parts do not jam." The problem ceases to exist.',
          },
          {
            type: 'definition',
            term: 'IFR-3: A supersystem resource performs the function',
            content: 'A resource already present in the supersystem (gravity, ambient heat, airflow …) takes over the function — for free, with no new component.',
          },
          {
            type: 'paragraph',
            content: 'The module **does not generate solutions** — it forces a sharp goal formulation and a gap analysis: what blocks the IFR today? That gap is the actual problem statement.',
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
              'System klar benennen — eine konkrete technische Einheit, nicht ein ganzes Werk.',
              'Nützliche Funktion festhalten — was soll das System leisten? Eine aktive Verbform, kein Substantiv.',
              'Schädliche Wirkung benennen — was geht heute schief, oder wo wird kompromittiert?',
              'IFR-1 formulieren: System bleibt, aber die schädliche Wirkung wird von selbst beseitigt. Bewusst psychologisch unbequem — das ist das Zeichen für einen guten IFR.',
              'IFR-2 formulieren: Das Problem existiert nicht. Diese Stufe wirkt häufig „zu radikal" — und ist gerade deshalb hilfreich, weil sie versteckte Annahmen entlarvt.',
              'IFR-3 formulieren: Welche Ressource im Supersystem könnte die Funktion übernehmen? Hier hilft die Ressourcen-Checkliste als nächster Schritt.',
              'Gap-Analyse: Welche konkreten Hindernisse stehen zwischen Ist-Zustand und IFR? Diese Liste wird zur eigentlichen Aufgabenliste für das Team.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Bei mehreren konkurrierenden nützlichen Funktionen empfiehlt sich ein eigener IFR pro Funktion. Häufig zeigt sich dabei, dass die Funktionen miteinander im Konflikt stehen — das ist dann ein Fall für die Widerspruchsmatrix oder den physikalischen Widerspruch.',
          },
        ],
      },
      en: {
        title: 'Approach',
        blocks: [
          {
            type: 'list',
            items: [
              'Name the system clearly — a concrete technical unit, not a whole plant.',
              'Capture the useful function — what should the system do? Use an active verb, not a noun.',
              'State the harmful effect — what goes wrong today, or where do you compromise?',
              'Phrase IFR-1: the system remains, but the harmful effect is eliminated by itself. Deliberately psychologically uncomfortable — that is the sign of a good IFR.',
              'Phrase IFR-2: the problem does not exist. This level often feels "too radical" — and that is exactly its value, exposing hidden assumptions.',
              'Phrase IFR-3: which resource in the supersystem could carry the function? The Resources Checklist is the natural next step here.',
              'Gap analysis: which concrete obstacles sit between the current state and the IFR? That list becomes the actual task list for the team.',
            ],
          },
          {
            type: 'paragraph',
            content: 'When the system has several competing useful functions, run one IFR per function. The exercise often reveals that the functions are in conflict — that is then a case for the contradiction matrix or the physical contradiction.',
          },
        ],
      },
    },

    crossLinks: {
      de: {
        title: 'Bezug zu anderen TRIZ-Werkzeugen',
        blocks: [
          {
            type: 'list',
            items: [
              '**Ressourcen-Checkliste** — der natürliche nächste Schritt. IFR-3 fragt nach einer Supersystem-Ressource; die Checkliste inventarisiert systematisch alle 18 Felder (6 Kategorien × 3 Ebenen).',
              '**Widerspruchsmatrix / Physikalischer Widerspruch** — wenn IFR-1 nicht erreichbar ist, weil zwei Anforderungen sich widersprechen, formalisiere den Widerspruch dort.',
              '**9-Fenster-Werkzeug** — weitet zuerst den Systemblick. Der IFR wird dann für ein konkretes System aus dem 9-Fenster-Raster formuliert.',
            ],
          },
        ],
      },
      en: {
        title: 'Relation to other TRIZ tools',
        blocks: [
          {
            type: 'list',
            items: [
              '**Resources Checklist** — the natural next step. IFR-3 asks for a supersystem resource; the checklist systematically inventories all 18 cells (6 categories × 3 levels).',
              '**Contradiction Matrix / Physical Contradiction** — when IFR-1 cannot be reached because two requirements clash, formalise the clash there.',
              '**9-Windows** — broadens the system view first. The IFR is then formulated for a specific system from the 9-Windows grid.',
            ],
          },
        ],
      },
    },

    references: {
      de: {
        title: 'Quellen & Weiterlesen',
        blocks: [
          {
            type: 'list',
            items: [
              'G. S. Altschuller: „Erfinden — Wege zur Lösung technischer Probleme" (1973, dt. 1984), Kapitel ARIZ — Schritt „IFR-Formulierung".',
              'D. Mann: „Hands-On Systematic Innovation" — Kapitel „Ideality and Trends of Evolution".',
              'V. Souchkov: „TRIZ Body of Knowledge" — Definition Ideal Final Result.',
              'oxfordcreativity.co.uk — Praxisbeispiele zur IFR-Formulierung.',
            ],
          },
        ],
      },
      en: {
        title: 'References & further reading',
        blocks: [
          {
            type: 'list',
            items: [
              'G. S. Altshuller: "Creativity as an Exact Science" (1984), ARIZ chapter, step "IFR formulation".',
              'D. Mann: "Hands-On Systematic Innovation" — chapter "Ideality and Trends of Evolution".',
              'V. Souchkov: "TRIZ Body of Knowledge" — definition Ideal Final Result.',
              'oxfordcreativity.co.uk — worked IFR examples.',
            ],
          },
        ],
      },
    },
  },
};
