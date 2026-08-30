/**
 * D.Mike — TRIZ 9-Windows / System Operator Module Handbook
 * Bilingual help content (DE/EN) for the System Operator (9 Windows) tool.
 */

export default {
  moduleId: 'triz-9-windows',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Der {{term:systemoperator|Systemoperator}} — auch „9 Fenster" oder „Multi-Screen Tool" genannt — ist ein {{term:triz|TRIZ}}-Werkzeug, das ein System gleichzeitig auf zwei Achsen betrachtet: in der Zeit (Vergangenheit, Gegenwart, Zukunft) und in der Hierarchie ({{term:supersystem|Subsystem, System, Supersystem}}). Das ergibt ein 3×3-Raster aus neun Perspektiven auf denselben Sachverhalt.',
          },
          {
            type: 'paragraph',
            content: 'Der Trick: anstatt nur den aktuellen Zustand des Systems zu denken, springt man bewusst in die Nachbarzellen. Wie funktionierte ein Vorgängersystem? Welche Bestandteile (Subsystem) werden sich in Zukunft ändern? In welcher Umgebung (Supersystem) wird das System dann arbeiten? Aus den Antworten entstehen erfinderische Ideen, die sich aus reiner Gegenwartsbetrachtung nie ergeben würden.',
          },
          {
            type: 'definition',
            term: 'System',
            content: 'Das Untersuchungsobjekt — z.B. „Pkw mit Verbrennungsmotor", „Spannvorrichtung", „Fertigungslinie".',
          },
          {
            type: 'definition',
            term: 'Subsystem',
            content: 'Die Bestandteile, aus denen das System aufgebaut ist (eine Hierarchieebene tiefer).',
          },
          {
            type: 'definition',
            term: 'Supersystem',
            content: 'Die übergeordnete Struktur, in die das System eingebettet ist (eine Hierarchieebene höher).',
          },
          {
            type: 'paragraph',
            content: 'Genrich Altschuller selbst hat dieses Werkzeug propagiert. Es ist kein algorithmisches Verfahren wie die {{term:widerspruchsmatrix|Widerspruchsmatrix}}, sondern eine Denkstruktur, die Tunnelblick gegen Systemdenken eintauscht.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'The {{term:systemoperator|System Operator}} — also called "9 Windows" or "Multi-Screen Tool" — is a {{term:triz|TRIZ}} tool that analyses a system on two axes simultaneously: time (past, present, future) and hierarchy ({{term:supersystem|subsystem, system, supersystem}}). The result is a 3×3 grid of nine perspectives on the same subject.',
          },
          {
            type: 'paragraph',
            content: 'The point: instead of only considering the current state of the system, you deliberately jump into the neighbouring cells. How did a predecessor system work? Which components (subsystem) will change in the future? In which environment (supersystem) will the system then operate? Inventive ideas emerge from these answers that pure present-state thinking would never surface.',
          },
          {
            type: 'definition',
            term: 'System',
            content: 'The object of analysis — e.g. "passenger car with combustion engine", "fixture", "production line".',
          },
          {
            type: 'definition',
            term: 'Subsystem',
            content: 'The components that make up the system (one level deeper in the hierarchy).',
          },
          {
            type: 'definition',
            term: 'Supersystem',
            content: 'The structure within which the system is embedded (one level higher).',
          },
          {
            type: 'paragraph',
            content: 'Genrich Altshuller himself promoted this tool. It is not an algorithmic procedure like the contradiction matrix but a thinking structure that trades tunnel vision for systems thinking.',
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
              'System klar benennen (Titel-Feld). Ein präziser Name verhindert Verwechslungen mit Sub- oder Supersystem.',
              'Die mittlere Zelle „System / Gegenwart" ausfüllen — das ist der Ist-Zustand.',
              'Spaltenweise weiter: Vergangenheit (wie war das früher gelöst?) und Zukunft (wie könnte es zukünftig aussehen?).',
              'Zeilenweise nach unten / oben: Subsystem (Bauteile, Stoffe, Felder) und Supersystem (Umgebung, Schnittstellen, Stakeholder).',
              'Die Eckzellen (Subsystem-Vergangenheit, Supersystem-Zukunft, …) bewusst ausfüllen — gerade dort entstehen oft die Aha-Momente.',
              'Skizzen, Fotos oder Diagramme als Bild pro Zelle hinzufügen, wenn Text nicht ausreicht.',
              'Aus dem Gesamtbild Ideen ableiten: Welche Eigenschaften aus der Vergangenheit lassen sich wiederbeleben? Welche Trends im Supersystem erzwingen Änderungen am System?',
            ],
          },
          {
            type: 'paragraph',
            content: 'Die Achsenbeschriftungen lassen sich ändern. Üblich sind auch die Begriffspaare „Mikro / Makro / Meta", „Komponente / Produkt / Markt" oder „Modul / Anlage / Werk". Wichtig ist, dass die Hierarchieabstände gleich bleiben.',
          },
        ],
      },
      en: {
        title: 'Approach',
        blocks: [
          {
            type: 'list',
            items: [
              'Name the system clearly (title field). A precise name avoids confusion with sub- or supersystem.',
              'Fill the centre cell "System / Present" first — the current state.',
              'Move along the columns: past (how was it solved before?) and future (how might it look ahead?).',
              'Move along the rows: subsystem (parts, substances, fields) and supersystem (environment, interfaces, stakeholders).',
              'Deliberately fill the corner cells (subsystem-past, supersystem-future, …). The strongest insights often live there.',
              'Add sketches, photos or diagrams per cell when text alone falls short.',
              'Derive ideas from the full picture: which properties from the past could be revived? Which trends in the supersystem force changes to the system?',
            ],
          },
          {
            type: 'paragraph',
            content: 'Axis labels are editable. Other common pairings are "micro / macro / meta", "component / product / market", or "module / plant / site". What matters is that the hierarchy spacing stays consistent.',
          },
        ],
      },
    },

    interpretation: {
      de: {
        title: 'Ergebnis interpretieren',
        blocks: [
          {
            type: 'paragraph',
            content: 'Das Ergebnis sind keine fertigen Lösungen, sondern ein Denk-Inventar. Lesen Sie das ausgefüllte Raster horizontal und vertikal: Welche Komponente (Subsystem) ist heute kritisch, war es aber früher nicht? Welche Veränderung im Supersystem (z.B. neue Vorschrift, neue Nachbartechnologie) wird die Anforderungen an das System verschieben?',
          },
          {
            type: 'paragraph',
            content: 'Häufige Muster:',
          },
          {
            type: 'list',
            items: [
              'Die Vergangenheits-Spalte zeigt oft, dass aktuelle Probleme durch eine Detail-Optimierung entstanden sind, die im Vorgängersystem nicht nötig war.',
              'Die Zukunfts-Spalte legt offen, ob der heutige Konstruktionsweg überhaupt zukunftsfähig ist oder ob ein Sprung nötig wird.',
              'Die Subsystem-Zeile entlarvt versteckte Annahmen über die Bauteile — TRIZ nennt das „psychologische Trägheit".',
              'Die Supersystem-Zeile holt Stakeholder, Vorschriften, Marktbedingungen ins Bild.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Wenn Zellen leer bleiben: nicht erzwingen. Eine leere Zelle ist eine ehrliche Aussage — „dazu fehlt mir Wissen". Das ist ein konkreter Auftrag für die Recherche.',
          },
        ],
      },
      en: {
        title: 'Interpreting the result',
        blocks: [
          {
            type: 'paragraph',
            content: 'The output is not a list of finished solutions but a thinking inventory. Read the filled grid both horizontally and vertically: which component (subsystem) is critical today but wasn\'t before? Which change in the supersystem (e.g. new regulation, new neighbouring technology) will shift the requirements on the system?',
          },
          {
            type: 'paragraph',
            content: 'Common patterns:',
          },
          {
            type: 'list',
            items: [
              'The past column often reveals that current problems came from a detail optimisation the predecessor never needed.',
              'The future column shows whether today\'s design path is actually viable long-term or whether a leap is required.',
              'The subsystem row exposes hidden assumptions about the parts — TRIZ calls this "psychological inertia".',
              'The supersystem row brings stakeholders, regulations, and market conditions into the picture.',
            ],
          },
          {
            type: 'paragraph',
            content: 'If cells stay empty, don\'t force it. An empty cell is an honest statement — "I lack knowledge here". That is a concrete research task.',
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
              'G. S. Altschuller: „Erfinden — Wege zur Lösung technischer Probleme" (1973, dt. 1984).',
              'D. Mann: „Hands-On Systematic Innovation" — Kapitel zum Multi-Screen Tool.',
              'V. Souchkov: „TRIZ Body of Knowledge" — Kurzdefinition System Operator.',
              'oxfordcreativity.co.uk — frei verfügbare Materialien zum Werkzeug.',
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
              'G. S. Altshuller: "Creativity as an Exact Science" (1984).',
              'D. Mann: "Hands-On Systematic Innovation" — chapter on the Multi-Screen Tool.',
              'V. Souchkov: "TRIZ Body of Knowledge" — short definition of the System Operator.',
              'oxfordcreativity.co.uk — open resources on the tool.',
            ],
          },
        ],
      },
    },
  },
};
