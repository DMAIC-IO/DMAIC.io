/**
 * DMAIC.io — Makigami Matrix Module Handbook (makigami-help.js)
 * Bilingual help content (DE/EN) for the Makigami module.
 */

export default {
  moduleId: 'makigami',
  sections: {
    overview: {
      de: {
        title: 'Was ist Makigami?',
        blocks: [
          {
            type: 'paragraph',
            content: '{{term:makigami|Makigami}} (jap. „aufgerolltes Papier") ist ein Lean-Werkzeug zur Aufnahme administrativer und dienstleistungsorientierter Prozesse. Während eine klassische Prozesskarte den Materialfluss zeigt, macht Makigami sichtbar, wer wann an einem Vorgang arbeitet und wie viel Zeit zwischen den Schritten verloren geht.',
          },
          {
            type: 'paragraph',
            content: 'Aufbau: Zeilen sind beteiligte Rollen (Personen, Abteilungen, Systeme), Spalten sind Prozessschritte in chronologischer Reihenfolge. In jeder Zelle wird markiert, ob eine Rolle an einem Schritt mitwirkt. Pro Schritt wird zusätzlich erfasst: Aktivität, Bearbeitungszeit, Wartezeit, Verschwendungsart und Notizen.',
          },
          {
            type: 'definition',
            term: 'Rolle (Swim-Lane)',
            content: 'Eine handelnde Stelle im Prozess: Kunde, Sachbearbeitung, Vorgesetzte, ein IT-System. Eine Rolle muss nicht eine Person sein, sondern eine Funktion. Übergaben zwischen Rollen sind die größten Verschwendungsquellen in Büro-Prozessen.',
          },
          {
            type: 'definition',
            term: 'Schritt',
            content: 'Eine in sich abgeschlossene Aktivität im Prozess — z.B. „Anfrage erfassen", „Freigabe einholen". Ein Schritt kann mehrere Rollen gleichzeitig betreffen (gemeinsame Bearbeitung, Übergabe).',
          },
          {
            type: 'definition',
            term: 'Bearbeitungszeit vs. Wartezeit',
            content: 'Bearbeitungszeit ist die Zeit, in der tatsächlich gearbeitet wird (wertschöpfend). Wartezeit ist die Liegezeit zwischen Aktivitäten — die Vorgang ruht in der Ablage, im Postkorb, in der Mail-Queue. In Büro-Prozessen sind 95 %+ Wartezeit nicht ungewöhnlich.',
          },
          {
            type: 'definition',
            term: 'Muda (Verschwendung)',
            content: 'Japanischer Begriff für jede Tätigkeit, die Ressourcen verbraucht, ohne Wert für den Kunden zu schaffen. Die acht klassischen Muda-Arten („TIMWOODS+S"): Transport, Bestand, Bewegung, Warten, Überproduktion, Über-Bearbeitung, Defekte, ungenutztes Potenzial.',
          },
        ],
      },
      en: {
        title: 'What is Makigami?',
        blocks: [
          {
            type: 'paragraph',
            content: '{{term:makigami|Makigami}} (Japanese for "rolled paper") is a Lean tool for mapping administrative and service processes. Whereas a classic process map shows material flow, Makigami exposes who works on a case when, and how much time is lost in between steps.',
          },
          {
            type: 'paragraph',
            content: 'Structure: rows are participating roles (people, departments, systems), columns are process steps in chronological order. Each cell marks whether a role contributes to a step. For every step you also capture: activity, processing time, waiting time, waste category, and notes.',
          },
          {
            type: 'definition',
            term: 'Role (Swim Lane)',
            content: 'An acting unit in the process: customer, back office, approver, an IT system. A role is a function, not necessarily a single person. Handovers between roles are the biggest source of waste in office processes.',
          },
          {
            type: 'definition',
            term: 'Step',
            content: 'A self-contained activity in the process — e.g. "Capture request", "Obtain approval". A step may involve several roles at once (joint work, handover).',
          },
          {
            type: 'definition',
            term: 'Processing vs. waiting time',
            content: 'Processing time is the time actual work happens (value-add). Waiting time is the idle time between activities — the case sits in an inbox, mail queue, or pending folder. In office processes 95 %+ waiting share is not unusual.',
          },
          {
            type: 'definition',
            term: 'Muda (waste)',
            content: 'Japanese term for any activity that consumes resources without creating customer value. The eight classic waste types ("TIMWOODS+S"): Transport, Inventory, Motion, Waiting, Overproduction, Over-processing, Defects, unused Skills.',
          },
        ],
      },
    },

    workflow: {
      de: {
        title: 'Vorgehen Schritt für Schritt',
        blocks: [
          {
            type: 'heading',
            content: 'Empfohlene Reihenfolge',
          },
          {
            type: 'list',
            items: [
              '1. Prozess-Titel oben links eintragen — z.B. „Auftragsabwicklung Innendienst".',
              '2. Rollen anlegen über „+ Rolle" am unteren Rand der Matrix. Mit den Hauptakteuren beginnen, weitere kommen erfahrungsgemäß im Gespräch dazu.',
              '3. Schritte chronologisch anlegen über „+ Schritt" am rechten Rand. Jede Tätigkeit, die einen Statuswechsel auslöst, ist ein eigener Schritt — auch reine Warte-/Liege-Schritte sind erlaubt.',
              '4. In der Matrix Beteiligungen setzen: pro Zelle den Punkt anklicken, wenn die Rolle an diesem Schritt mitwirkt. Mehrfach-Markierungen sind erlaubt (Übergabe, gemeinsame Bearbeitung).',
              '5. Pro Schritt die Karte ausfüllen: Aktivitätstext, Bearbeitungszeit, Wartezeit, eine oder mehrere Muda-Kategorien, optional Notizen zu Übergaben oder Engpässen.',
              '6. KPI-Streifen prüfen: Lead Time und PCE zeigen den Hebel — kleine PCE bedeutet viel Verbesserungspotenzial.',
              '7. Workshop-Ergebnis exportieren: XLSX zum Teilen, JSON zum Wiederladen, PNG/SVG für Präsentation.',
            ],
          },
          {
            type: 'heading',
            content: 'Workshop-Tipps',
          },
          {
            type: 'list',
            items: [
              'Mit Beteiligten gemeinsam erstellen — Außenstehende übersehen meist Schatten-Schritte und informelle Übergaben.',
              'Realistische, nicht Soll-Zeiten erfassen. Auch ehrliche Schätzwerte sind besser als Schönrechnerei.',
              'Wartezeiten zuerst grob schätzen, danach mit Beispielfällen kalibrieren.',
              'Drag & Drop nutzen, um Rollen/Schritte umzuordnen, wenn der Workshop neue Reihenfolge ergibt.',
            ],
          },
        ],
      },
      en: {
        title: 'Step-by-step workflow',
        blocks: [
          {
            type: 'heading',
            content: 'Recommended sequence',
          },
          {
            type: 'list',
            items: [
              '1. Enter the process title at the top — e.g. "Internal order processing".',
              '2. Add roles via "+ Role" at the bottom of the matrix. Start with the main actors; more emerge naturally during the discussion.',
              '3. Add steps chronologically via "+ Step" on the right. Anything that triggers a status change is its own step — pure waiting/idle steps are allowed.',
              '4. Set participation in the matrix: click the dot in a cell when the role contributes to that step. Multiple marks are allowed (handover, joint work).',
              '5. Fill each step card: activity text, processing time, waiting time, one or more Muda categories, and notes on handovers or bottlenecks.',
              '6. Check the KPI strip: Lead Time and PCE show the leverage — small PCE means lots of improvement potential.',
              '7. Export the workshop result: XLSX for sharing, JSON to reload later, PNG/SVG for presentations.',
            ],
          },
          {
            type: 'heading',
            content: 'Workshop tips',
          },
          {
            type: 'list',
            items: [
              'Build it together with people doing the work — outsiders typically miss shadow steps and informal handovers.',
              'Capture realistic, not target times. Honest estimates beat polished fiction.',
              'Estimate waiting times roughly first, then calibrate with sample cases.',
              'Use drag & drop to reorder roles/steps when the workshop reveals a new sequence.',
            ],
          },
        ],
      },
    },

    fields: {
      de: {
        title: 'Felder und Eingaben',
        blocks: [
          {
            type: 'heading',
            content: 'Matrix',
          },
          {
            type: 'list',
            items: [
              'Spaltenkopf: editierbarer Schritt-Titel. Der Index Sx ist fest, der Titel optional.',
              'Zeilenkopf: editierbares Rollen-Label.',
              'Zelle: Klick auf den Punkt schaltet die Beteiligung an/aus. Aktive Punkte sind gefüllt.',
              'Grip-Symbol (⋮⋮): Drag-Anker zum Umordnen von Schritten oder Rollen. Erscheint beim Überfahren des Kopfes.',
              'X-Symbol: Spalte/Zeile löschen — mit Bestätigungsdialog.',
            ],
          },
          {
            type: 'heading',
            content: 'Karte pro Schritt',
          },
          {
            type: 'list',
            items: [
              'Aktivität: Was passiert konkret? Auch zwei Sätze sind völlig in Ordnung.',
              'Beteiligte Rollen: gleicher Inhalt wie die Punkte in der Matrix — Chips lassen sich genauso umschalten.',
              'Bearbeitungszeit / Wartezeit: Freitext-Eingabe (siehe unten). Auf Tab/Blur wird kanonisch normalisiert.',
              'Verschwendung (Muda): mehrere Kategorien pro Schritt möglich. Farben und Bezeichnungen sind in den Einstellungen anpassbar.',
              'Notizen: alles, was nicht in andere Felder passt — Übergabewege, Engpässe, IT-Brüche.',
            ],
          },
          {
            type: 'heading',
            content: 'Zeit-Freitext',
          },
          {
            type: 'paragraph',
            content: 'Zeiten werden als freie Texte erfasst und intern in Sekunden umgerechnet. Mehrere Einheiten dürfen kombiniert werden, ein Komma oder Punkt ist als Dezimaltrennzeichen erlaubt.',
          },
          {
            type: 'list',
            items: [
              '„45min" → 45 Minuten',
              '„4h 30min" → 4 Stunden 30 Minuten',
              '„1d 5h" → 1 Arbeitstag (8 h) + 5 Stunden',
              '„1,5h" → 1 Stunde 30 Minuten',
              'Leer = 0; ungültige Eingabe wird rot markiert und im KPI als 0 gerechnet.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Voreingestellt sind s, min, h, d (= 28800 s, also 8-Stunden-Arbeitstag). Eigene Einheiten lassen sich in den Einstellungen ergänzen — z.B. „wk" = 144000 s für eine Arbeitswoche.',
          },
        ],
      },
      en: {
        title: 'Fields and inputs',
        blocks: [
          {
            type: 'heading',
            content: 'Matrix',
          },
          {
            type: 'list',
            items: [
              'Column header: editable step title. The Sx index is fixed, the title optional.',
              'Row header: editable role label.',
              'Cell: clicking the dot toggles participation on/off. Active dots are filled.',
              'Grip icon (⋮⋮): drag anchor for reordering steps or roles. Appears on header hover.',
              'X icon: delete column/row — with confirmation prompt.',
            ],
          },
          {
            type: 'heading',
            content: 'Per-step card',
          },
          {
            type: 'list',
            items: [
              'Activity: what concretely happens? Two sentences are perfectly fine.',
              'Participating roles: same content as the matrix dots — chips toggle the same way.',
              'Processing / waiting time: free-text input (see below). Canonicalized on Tab/blur.',
              'Waste (Muda): multiple categories per step allowed. Colors and labels are customizable in settings.',
              'Notes: anything that does not fit other fields — handover paths, bottlenecks, system breaks.',
            ],
          },
          {
            type: 'heading',
            content: 'Time free-text',
          },
          {
            type: 'paragraph',
            content: 'Times are captured as free text and internally converted to seconds. Several units can be combined, comma or dot work as decimal separator.',
          },
          {
            type: 'list',
            items: [
              '"45min" → 45 minutes',
              '"4h 30min" → 4 hours 30 minutes',
              '"1d 5h" → 1 workday (8 h) + 5 hours',
              '"1.5h" → 1 hour 30 minutes',
              'Empty = 0; invalid input is flagged red and counted as 0 in the KPI.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Defaults are s, min, h, d (= 28800 s, i.e. 8-hour workday). Custom units can be added in settings — e.g. "wk" = 144000 s for a workweek.',
          },
        ],
      },
    },

    interpretation: {
      de: {
        title: 'Kennzahlen interpretieren',
        blocks: [
          {
            type: 'heading',
            content: 'KPI-Streifen',
          },
          {
            type: 'definition',
            term: 'Σ Bearbeitung',
            content: 'Summe aller Bearbeitungszeiten — die tatsächlich wertschöpfende Zeit im Prozess. Reichweite typischerweise Minuten bis wenige Stunden.',
          },
          {
            type: 'definition',
            term: 'Σ Wartezeit',
            content: 'Summe aller Wartezeiten — Liegezeiten zwischen Aktivitäten. In Büro-Prozessen meist der größte Anteil der Lead Time.',
          },
          {
            type: 'definition',
            term: 'Lead Time',
            content: 'Σ Bearbeitung + Σ Wartezeit. Die durchgehende Dauer vom Auslöser des Prozesses bis zum Ergebnis. Aus Kundensicht das einzig relevante Maß.',
          },
          {
            type: 'definition',
            term: 'PCE (Process Cycle Efficiency)',
            content: 'Σ Bearbeitung / Lead Time, in Prozent. Anteil der Lead Time, der wertschöpfend ist. Eine PCE von 5 % bedeutet: für jede Minute Wert werden 19 Minuten verschwendet.',
          },
          {
            type: 'heading',
            content: 'Daumenregeln',
          },
          {
            type: 'list',
            items: [
              'PCE > 25 %: für Büro-Prozesse exzellent.',
              'PCE 5–25 %: typischer Industrie-/Service-Wert mit klarem Optimierungspotenzial.',
              'PCE < 5 %: massives Hebelpotenzial — Wartezeiten dominieren.',
              'Verbesserung beginnt immer beim größten Wartezeit-Block, nicht bei der schnellsten Bearbeitungszeit.',
            ],
          },
          {
            type: 'heading',
            content: 'Muda-Verteilung',
          },
          {
            type: 'paragraph',
            content: 'Welche Muda-Kategorien tauchen am häufigsten auf? Häufige Markierungen für „Warten" zeigen Kapazitätsprobleme oder unklare Verantwortlichkeiten. „Über-Bearbeitung" deutet auf unklare Qualitätsanforderungen, „Defekte" auf Probleme in vorgelagerten Schritten.',
          },
        ],
      },
      en: {
        title: 'Interpreting the metrics',
        blocks: [
          {
            type: 'heading',
            content: 'KPI strip',
          },
          {
            type: 'definition',
            term: 'Σ Processing',
            content: 'Sum of all processing times — the actually value-adding time in the process. Usually minutes to a few hours.',
          },
          {
            type: 'definition',
            term: 'Σ Waiting',
            content: 'Sum of all waiting times — idle periods between activities. In office processes this is typically the dominant share of Lead Time.',
          },
          {
            type: 'definition',
            term: 'Lead Time',
            content: 'Σ Processing + Σ Waiting. The end-to-end duration from process trigger to result. From the customer\'s perspective, the only relevant measure.',
          },
          {
            type: 'definition',
            term: 'PCE (Process Cycle Efficiency)',
            content: 'Σ Processing / Lead Time, in percent. The fraction of Lead Time that is value-adding. A PCE of 5 % means: for every minute of value, 19 minutes are wasted.',
          },
          {
            type: 'heading',
            content: 'Rules of thumb',
          },
          {
            type: 'list',
            items: [
              'PCE > 25 %: excellent for office processes.',
              'PCE 5–25 %: typical industry/service value with clear optimization potential.',
              'PCE < 5 %: massive leverage — waiting times dominate.',
              'Improvement always starts at the largest waiting block, not at the fastest processing time.',
            ],
          },
          {
            type: 'heading',
            content: 'Muda distribution',
          },
          {
            type: 'paragraph',
            content: 'Which Muda categories appear most often? Frequent "Waiting" marks point to capacity issues or unclear ownership. "Over-processing" hints at fuzzy quality requirements, "Defects" at problems in upstream steps.',
          },
        ],
      },
    },

    tips: {
      de: {
        title: 'Tipps & Stolpersteine',
        blocks: [
          {
            type: 'heading',
            content: 'Gute Praxis',
          },
          {
            type: 'list',
            items: [
              'Lieber zu fein als zu grob: Schritte mit mehr als einer Stunde Bearbeitungszeit lassen sich meist sinnvoll aufteilen.',
              'Übergaben sichtbar machen: Wo zwei Rollen denselben Schritt teilen, lohnt eine Notiz über das Medium (E-Mail, Postkorb, System).',
              'Wartezeit ehrlich messen: lieber „1d" eintragen, als die unangenehme Wahrheit zu verstecken — das ist das eigentliche Ziel der Methode.',
              'Mehrere Muda-Kategorien pro Schritt erlaubt — bei tatsächlich gemischten Problemen lieber alle markieren.',
            ],
          },
          {
            type: 'heading',
            content: 'Typische Fehler',
          },
          {
            type: 'list',
            items: [
              'Soll-Prozess statt Ist-Prozess aufnehmen: Makigami zeigt die Realität, nicht das Ideal.',
              'Nur Bearbeitungszeit erfassen, Wartezeit überspringen: Damit fällt das wichtigste Werkzeug der Methode weg.',
              'Zu wenige Rollen: Wenn eine „Sachbearbeitung" mehrere Personen kapselt, gehen Übergaben innerhalb verloren.',
              'Status-/Liege-Schritte vergessen: „Wartet auf Freigabe" ist ein eigenständiger Schritt — auch wenn niemand aktiv arbeitet.',
              'PCE als alleinige Zielmetrik: Eine PCE-Steigerung ohne Reduktion der absoluten Lead Time hilft dem Kunden nicht.',
            ],
          },
          {
            type: 'heading',
            content: 'Wann NICHT einsetzen?',
          },
          {
            type: 'list',
            items: [
              'Reine Produktionsprozesse mit Material- und Maschinenfluss — dafür ist eine Value Stream Map präziser.',
              'Sehr kurze Prozesse (< 5 Schritte): SIPOC oder eine einfache Prozesskarte reichen oft.',
              'Wenn keine zeitlichen Daten vorliegen und auch keine geschätzt werden können — die Methode lebt von Zeitwerten.',
            ],
          },
        ],
      },
      en: {
        title: 'Tips & pitfalls',
        blocks: [
          {
            type: 'heading',
            content: 'Good practice',
          },
          {
            type: 'list',
            items: [
              'Err on the fine side: steps with more than an hour of processing time can usually be meaningfully split.',
              'Make handovers visible: when two roles share the same step, note the medium (email, inbox, system).',
              'Measure waiting honestly: prefer to write "1d" than to hide the inconvenient truth — that is the actual point of the method.',
              'Multiple Muda categories per step are allowed — for genuinely mixed issues, mark them all.',
            ],
          },
          {
            type: 'heading',
            content: 'Typical mistakes',
          },
          {
            type: 'list',
            items: [
              'Capturing the target process instead of the actual one: Makigami shows reality, not the ideal.',
              'Only recording processing time, skipping waiting: this removes the method\'s most important lever.',
              'Too few roles: when "Back office" lumps several people together, internal handovers vanish.',
              'Forgetting status/idle steps: "Waiting for approval" is its own step — even when nobody is actively working.',
              'PCE as the sole target metric: a higher PCE without lower absolute Lead Time does not help the customer.',
            ],
          },
          {
            type: 'heading',
            content: 'When NOT to use?',
          },
          {
            type: 'list',
            items: [
              'Pure production processes with material and machine flow — a Value Stream Map is more precise.',
              'Very short processes (< 5 steps): SIPOC or a simple process map is usually enough.',
              'When neither measured nor estimable time data is available — the method lives on time values.',
            ],
          },
        ],
      },
    },
  },
};
