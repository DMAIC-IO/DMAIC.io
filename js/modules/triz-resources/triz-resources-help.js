/**
 * D.Mike — TRIZ Resources Checklist Module Handbook
 * Bilingual help content (DE/EN) for the Resources inventory.
 */

export default {
  moduleId: 'triz-resources',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Die **Ressourcen-Checkliste** ist ein zentrales TRIZ-Werkzeug: bevor man neue Komponenten erfindet, inventarisiert das Team systematisch alles, was bereits **im System, an seinen Grenzen oder im Supersystem** vorhanden ist. Erfahrungsgemäß findet sich die Lösung in den allermeisten Fällen bereits unter den existierenden Ressourcen — sie war nur ungenutzt.',
          },
          {
            type: 'paragraph',
            content: 'Das Modul spannt ein 6×3-Raster auf: **sechs Ressourcen-Kategorien** (Stoffe, Felder, Raum, Zeit, Information, Funktion/Energie) × **drei Systemebenen** (Subsystem, System, Supersystem). Pro Zelle: Freitext-Notizen und ein Nutzungsstatus (unbekannt / ungenutzt / teilweise / voll).',
          },
          {
            type: 'definition',
            term: 'Stoffe',
            content: 'Materialien, Bauteile, Abfall, Nebenprodukte, Atmosphäre, Verunreinigungen — alles, was körperlich vorhanden ist.',
          },
          {
            type: 'definition',
            term: 'Felder',
            content: 'Mechanisch, thermisch, chemisch, elektrisch, magnetisch, akustisch, optisch, gravitativ — Kräfte und Energieformen, die wirken.',
          },
          {
            type: 'definition',
            term: 'Raum',
            content: 'Ungenutzte Volumina, Oberflächen, Spalte, Hohlräume, Kontaktflächen.',
          },
          {
            type: 'definition',
            term: 'Zeit',
            content: 'Leerlaufphasen, Übergänge, Pausen zwischen Zyklen, Vor-/Nachlaufzeiten.',
          },
          {
            type: 'definition',
            term: 'Information',
            content: 'Sensorsignale, Indikatoren, natürlich anfallende Daten, Nebenprodukt-Informationen.',
          },
          {
            type: 'definition',
            term: 'Funktion / Energie',
            content: 'Bestehende Funktionen, die zusätzlich genutzt werden können (Doppelnutzung); Energie, die ohnehin durch das System fließt.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'The **Resources Checklist** is a central TRIZ tool: before inventing new components, the team systematically inventories everything that is already **in the system, at its boundaries, or in the supersystem**. Experience shows that the solution almost always lives among the existing resources — it was just unused.',
          },
          {
            type: 'paragraph',
            content: 'The module spans a 6×3 grid: **six resource categories** (substances, fields, space, time, information, function/energy) × **three system levels** (subsystem, system, supersystem). Each cell carries free-text notes and a utilisation status (unknown / unused / partial / full).',
          },
          {
            type: 'definition',
            term: 'Substances',
            content: 'Materials, parts, waste, by-products, atmosphere, contaminants — anything physically present.',
          },
          {
            type: 'definition',
            term: 'Fields',
            content: 'Mechanical, thermal, chemical, electrical, magnetic, acoustic, optical, gravitational — forces and forms of energy at play.',
          },
          {
            type: 'definition',
            term: 'Space',
            content: 'Unused volumes, surfaces, gaps, cavities, contact regions.',
          },
          {
            type: 'definition',
            term: 'Time',
            content: 'Idle phases, transitions, pauses between cycles, lead/lag windows.',
          },
          {
            type: 'definition',
            term: 'Information',
            content: 'Sensor signals, indicators, naturally occurring data, by-product information.',
          },
          {
            type: 'definition',
            term: 'Function / energy',
            content: 'Existing functions usable for double duty; energy already flowing through the system.',
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
              'System klar benennen (Titelzeile) — das ist die mittlere Zeile der Hierarchie.',
              'Zeilenweise vorgehen: erst alle Stoffe inventarisieren (Sub-/System-/Supersystem), dann Felder, dann Raum, …',
              'Auch „triviale" Ressourcen aufnehmen — Schwerkraft, Umgebungsluft, Abwärme, Eigenrauschen eines Sensors. Genau dort liegen oft die elegantesten Lösungen.',
              'Status setzen: jede Zelle bekommt am Ende des Durchgangs eine Bewertung. Ungenutzte oder unbekannte Zellen sind die wertvollsten — dort steckt Lösungspotenzial.',
              'Mit der IFR-Aufgabe abgleichen: welche der inventarisierten Ressourcen könnte die nützliche Funktion oder Beseitigung der schädlichen Wirkung übernehmen?',
            ],
          },
          {
            type: 'paragraph',
            content: 'Leere Zellen sind Forschungsaufträge — sie zeigen Bereiche, die das Team noch nicht durchdrungen hat. Den Status bewusst auf „unbekannt" stehen lassen ist ehrlicher als eine vorschnelle Bewertung.',
          },
        ],
      },
      en: {
        title: 'Approach',
        blocks: [
          {
            type: 'list',
            items: [
              'Name the system clearly (top row) — that is the middle row of the hierarchy.',
              'Work row by row: inventory all substances first (sub / system / supersystem), then fields, then space, …',
              'Include "trivial" resources — gravity, ambient air, waste heat, sensor self-noise. The most elegant solutions often live there.',
              'Set the status: each cell gets a rating at the end of the pass. Unused or unknown cells are the most valuable — that is where solution potential sits.',
              'Cross-check with the IFR task: which of the inventoried resources could carry the useful function or eliminate the harmful effect?',
            ],
          },
          {
            type: 'paragraph',
            content: 'Empty cells are research tasks — they show areas the team has not yet thought through. Leaving the status at "unknown" is more honest than a premature rating.',
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
              '**Ideales Endresultat (IFR)** — sitzt direkt vorgelagert. IFR-3 fragt explizit nach einer Supersystem-Ressource; dieses Modul listet sie systematisch auf.',
              '**9-Fenster-Werkzeug** — dieselbe Hierarchie-Achse (sub / system / super). Ressourcen, die im 9-Fenster-Raster auftauchen, lassen sich hier systematisch bewerten.',
              '**Widerspruchsmatrix / Physikalischer Widerspruch** — Separationsprinzipien brauchen oft eine Ressource zur Umsetzung (räumliche Separation braucht ungenutztes Volumen; Bedingungs-Separation ein Sensorsignal — beides Einträge dieser Checkliste).',
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
              '**Ideal Final Result (IFR)** — sits directly upstream. IFR-3 explicitly asks for a supersystem resource; this module enumerates them systematically.',
              '**9-Windows** — same hierarchy axis (sub / system / super). Resources spotted in the 9-Windows grid can be transferred here for systematic rating.',
              '**Contradiction Matrix / Physical Contradiction** — separation principles often need a resource to implement (spatial separation needs unused volume; conditional separation needs a sensor signal — both are entries on this checklist).',
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
              'G. S. Altschuller: „Erfinden — Wege zur Lösung technischer Probleme" (1973, dt. 1984) — Kapitel zur Ressourcen-Analyse innerhalb ARIZ.',
              'D. Mann: „Hands-On Systematic Innovation" — Kapitel „Resources" mit der vollständigen Kategorisierung.',
              'V. Souchkov: „TRIZ Body of Knowledge" — Resource Analysis.',
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
              'G. S. Altshuller: "Creativity as an Exact Science" (1984) — chapter on resource analysis inside ARIZ.',
              'D. Mann: "Hands-On Systematic Innovation" — chapter "Resources" with the full categorisation.',
              'V. Souchkov: "TRIZ Body of Knowledge" — resource analysis.',
            ],
          },
        ],
      },
    },
  },
};
