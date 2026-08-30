/**
 * D.Mike — TRIZ Substance-Field Analysis Module Handbook
 * Bilingual help content (DE/EN).
 */

export default {
  moduleId: 'triz-sufield',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Die **{{term:substanz-feld-analyse|Substanz-Feld-Analyse}}** (russisch: вепольный анализ — Vepol-Analyse) ist das formalste {{term:triz|TRIZ}}-Werkzeug. Sie reduziert jede technische {{term:wechselwirkung|Wechselwirkung}} auf ein **Dreieck aus drei minimalen Elementen**:',
          },
          {
            type: 'definition',
            term: 'S1 — Werkzeug',
            content: 'Die Substanz, die die Arbeit verrichtet (Bohrer, Klinge, Strahl, Hand).',
          },
          {
            type: 'definition',
            term: 'S2 — Werkstück / Objekt',
            content: 'Die Substanz, an der gearbeitet wird (Werkstück, Material, Information).',
          },
          {
            type: 'definition',
            term: 'F — Feld',
            content: 'Das Medium der Wechselwirkung. Sechs kanonische Typen ({{term:matcem|MATCEM}}): **M**echanisch, **A**kustisch, **T**hermisch, **C**hemisch, **E**lektrisch, **M**agnetisch.',
          },
          {
            type: 'paragraph',
            content: 'Jede Kante des Dreiecks bekommt eine **Qualität**: nützlich, unzureichend, exzessiv, schädlich — oder fehlend. Aus dieser Konstellation prescribieren Altschullers **76 Standardlösungen**, was zu tun ist. Sie sind in fünf Klassen organisiert:',
          },
          {
            type: 'list',
            items: [
              '**Klasse 1** — Aufbau / Zerstörung von Su-Field-Modellen (für unvollständige oder schädliche Modelle).',
              '**Klasse 2** — Entwicklung bestehender Modelle (für unzureichende oder exzessive Wirkungen).',
              '**Klasse 3** — Übergang ins Supersystem / zur Mikroebene (wenn das System an seine Grenzen stößt).',
              '**Klasse 4** — Messung und Detektion (für Mess- und Steuerungsprobleme).',
              '**Klasse 5** — Hilfsstandards (Vereinfachung, {{term:idealitaet|Idealität}}).',
            ],
          },
          {
            type: 'paragraph',
            content: 'Das Modul automatisiert den Schritt von der Modellierung zum richtigen Standard: es **diagnostiziert die Situation** aus den Eingaben und blendet zunächst die passenden Standardklassen ein. Ein Wechsel auf „Alle anzeigen" gibt jederzeit den vollen Katalog frei.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'The **Substance-Field analysis** (Russian: вепольный анализ — Vepol analysis, English: Su-Field) is {{term:triz|TRIZ}}\'s most formal tool. It reduces every technical interaction to a **triangle of three minimal elements**:',
          },
          {
            type: 'definition',
            term: 'S1 — Tool',
            content: 'The substance that does the work (drill, blade, beam, hand).',
          },
          {
            type: 'definition',
            term: 'S2 — Object / article',
            content: 'The substance the work is done on (workpiece, material, information).',
          },
          {
            type: 'definition',
            term: 'F — Field',
            content: 'The medium of interaction. Six canonical types ({{term:matcem|MATCEM}}): **M**echanical, **A**coustic, **T**hermal, **C**hemical, **E**lectric, **M**agnetic.',
          },
          {
            type: 'paragraph',
            content: 'Each edge of the triangle carries a **quality**: useful, insufficient, excessive, harmful — or missing. From that configuration Altshuller\'s **76 standard solutions** prescribe what to do. They are organised in five classes:',
          },
          {
            type: 'list',
            items: [
              '**Class 1** — synthesis / destruction of Su-Field models (for incomplete or harmful models).',
              '**Class 2** — developing existing models (for insufficient or excessive actions).',
              '**Class 3** — transition to supersystem / microlevel (when the system reaches its limits).',
              '**Class 4** — detection and measurement (for measurement / control problems).',
              '**Class 5** — helper standards (simplification, ideality).',
            ],
          },
          {
            type: 'paragraph',
            content: 'The module automates the step from model to applicable standard: it **diagnoses the situation** from the inputs and first shows the matching classes. Switching to "show all" exposes the full catalogue at any time.',
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
              'S1 (Werkzeug) und S2 (Werkstück) klar benennen — beide müssen konkrete Substanzen sein, keine Funktionen oder Prozesse.',
              'Feldtyp wählen (MATCEM). Wenn kein Feld vorhanden ist (z.B. weil noch nichts wirkt), bleibt es leer — das Modul diagnostiziert „unvollständig" und schlägt Klasse 1 vor.',
              'Wirkungsqualität wählen: nützlich (alles in Ordnung), unzureichend (zu schwach), exzessiv (zu stark), schädlich (Nebeneffekt), fehlend (sollte da sein, ist es aber nicht).',
              'Diagnose ablesen: Welche Standardklassen sind für die Situation relevant? Diese sind aufgeklappt.',
              'Die einzelnen Standards einer Klasse durchgehen. Jeder hat einen Trigger („wann anwenden") und ein Beispiel. Notizen sammeln pro Standard, „berücksichtigt"-Häkchen für die, die passen.',
              'Ausgewählte Standards in konkrete Lösungsskizzen überführen — gerne in Kombination mit anderen TRIZ-Werkzeugen (IFR, Ressourcen, {{term:widerspruchsmatrix|Widerspruchsmatrix}}).',
            ],
          },
          {
            type: 'paragraph',
            content: 'Wenn die Situation nicht eindeutig ist (z.B. Wirkung ist mal nützlich, mal schädlich), erstelle mehrere Su-Field-Modelle — entweder für die unterschiedlichen Betriebsmodi oder als Variante mit getauschten Rollen.',
          },
        ],
      },
      en: {
        title: 'Approach',
        blocks: [
          {
            type: 'list',
            items: [
              'Name S1 (tool) and S2 (object) clearly — both must be concrete substances, not functions or processes.',
              'Pick the field type (MATCEM). If no field is present yet (nothing acts), leave it empty — the module diagnoses "incomplete" and proposes class 1.',
              'Pick the link quality: useful (works fine), insufficient (too weak), excessive (too strong), harmful (side effect), missing (should exist but doesn\'t).',
              'Read the diagnosis: which standard classes match the situation? Those classes are open by default.',
              'Walk through the standards of each open class. Each has a trigger ("when to apply") and an example. Capture notes per standard and tick "considered" for the ones that fit.',
              'Turn selected standards into concrete solution sketches — gladly combined with other TRIZ tools (IFR, resources, contradiction matrix).',
            ],
          },
          {
            type: 'paragraph',
            content: 'When the situation is not unique (e.g. the action is useful in one mode and harmful in another), build several Su-Field models — either for the different operating modes or as a variant with swapped roles.',
          },
        ],
      },
    },

    diagnosis: {
      de: {
        title: 'Diagnose-Logik',
        blocks: [
          {
            type: 'paragraph',
            content: 'Aus S1, S2, Feld und Wirkungstyp leitet das Modul automatisch eine Situation ab und schlägt passende Standardklassen vor:',
          },
          {
            type: 'list',
            items: [
              '**Unvollständiges Modell** (S1 oder S2 fehlt, oder kein Feld) → Klasse 1.1 (Synthese).',
              '**Vollständig & nützlich** → Klasse 2 (Entwicklung) und Klasse 3 (nächster Sprung).',
              '**Vollständig & unzureichend** → Klasse 2 (Feld verstärken, dynamisieren).',
              '**Vollständig & exzessiv** → Klasse 2 + Klasse 5 (Hilfsstandards, oft Phasenwechsel / selbstgesteuerte Übergänge).',
              '**Vollständig & schädlich** → Klasse 1.2 (Zerstörung des schädlichen Su-Fields) + Klasse 5 (Hilfsstandards).',
            ],
          },
          {
            type: 'paragraph',
            content: 'Die Vorschläge sind nur eine Vorfilterung — der vollständige Katalog ist über „Alle anzeigen" jederzeit zugänglich.',
          },
        ],
      },
      en: {
        title: 'Diagnosis logic',
        blocks: [
          {
            type: 'paragraph',
            content: 'From S1, S2, field and link type the module derives a situation and recommends matching standard classes:',
          },
          {
            type: 'list',
            items: [
              '**Incomplete model** (S1 or S2 missing, or no field) → class 1.1 (synthesis).',
              '**Complete & useful** → class 2 (development) and class 3 (next-generation jump).',
              '**Complete & insufficient** → class 2 (strengthen / dynamise the field).',
              '**Complete & excessive** → class 2 + class 5 (helper standards, often phase change / self-controlled transitions).',
              '**Complete & harmful** → class 1.2 (destruction of the harmful Su-Field) + class 5 (helper standards).',
            ],
          },
          {
            type: 'paragraph',
            content: 'The suggestion is just a pre-filter — the full catalogue is always reachable via "show all".',
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
              '**Widerspruchsmatrix** — wenn die Matrix mehrere Prinzipien vorschlägt, klärt das Su-Field-Modell oft, welches Prinzip konkret umsetzbar ist; jedes Prinzip rendert sich in eine spezifische Klasse von Standards.',
              '**Ressourcen-Checkliste** — viele Klasse-1-Standards verlangen eine neue Substanz oder ein Feld; die {{term:ressourcen-analyse|Ressourcen-Checkliste}} listet Kandidaten systematisch auf.',
              '**Ideales Endresultat (IFR)** — sobald ein Standard ausgewählt ist, lässt sich der IFR konkreter formulieren (Standard sagt *wie*, IFR sagt *dass*).',
              '**Physikalischer Widerspruch** — Klasse-5-Hilfsstandards kombinieren sich oft mit {{term:separationsprinzipien|Separationsprinzipien}} zur räumlichen / zeitlichen Auflösung des Widerspruchs.',
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
              '**Contradiction matrix** — when the matrix recommends several principles, the Su-Field model often clarifies which principle is implementable; each principle resolves into a specific class of standards.',
              '**Resources Checklist** — many class-1 standards require a new substance or field; the resources checklist enumerates candidates systematically.',
              '**Ideal Final Result (IFR)** — once a standard is chosen, the IFR can be re-stated more concretely (the standard says *how*, the IFR says *that*).',
              '**Physical contradiction** — class-5 helper standards often pair with separation principles to realise spatial / temporal resolution.',
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
              'G. S. Altschuller: „Erfinden — Wege zur Lösung technischer Probleme" (1973, dt. 1984) — Originalwerk mit dem Standards-Katalog.',
              'D. Mann: „Hands-On Systematic Innovation" — moderne konsolidierte Liste der 76 Standards.',
              'V. Souchkov: „TRIZ Body of Knowledge" — Definition Substance-Field Analysis + 76 Standards.',
              'oxfordcreativity.co.uk — frei verfügbare Beispiele zu jedem Standard.',
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
              'G. S. Altshuller: "Creativity as an Exact Science" (1984) — original source of the standards catalogue.',
              'D. Mann: "Hands-On Systematic Innovation" — modern consolidated list of the 76 standards.',
              'V. Souchkov: "TRIZ Body of Knowledge" — definition of Substance-Field analysis + 76 standards.',
              'oxfordcreativity.co.uk — open examples for each standard.',
            ],
          },
        ],
      },
    },
  },
};
