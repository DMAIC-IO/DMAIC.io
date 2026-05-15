/**
 * D.Mike — TRIZ Trends of Technical Evolution Module Handbook
 * Bilingual help content (DE/EN).
 */

export default {
  moduleId: 'triz-evolution-trends',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Altschullers Patentanalyse zeigt: technische Systeme entwickeln sich nicht zufällig, sondern entlang einer kleinen Zahl wiederkehrender **Evolutionslinien**. Wer das aktuelle System auf diesen Linien verortet, kann mit hoher Trefferquote vorhersagen, wohin die nächste Generation gehen wird.',
          },
          {
            type: 'paragraph',
            content: 'Das Modul versammelt **acht klassische Trends**. Jede Linie hat klar benannte Stufen — der Sprung zur nächsten Stufe ist eine Innovations-Hypothese, die das Team systematisch prüfen kann.',
          },
          {
            type: 'list',
            items: [
              '**Aggregation:** Mono → Bi → Poly → integriertes System (z.B. ein Scheinwerfer → Doppelscheinwerfer → LED-Matrix → adaptives Beleuchtungssystem).',
              '**Dynamisierung:** starr → gelenkig → elastisch → flüssig → Feld (z.B. Stahlträger → Federelement → Hydraulik → Elektromagnet).',
              '**Skala:** Makro → Meso → Mikro → Nano (z.B. mechanische Pumpe → MEMS-Pumpe → molekularer Transport).',
              '**Automatisierung:** manuell → mechanisiert → automatisch → autonom (z.B. Drehknopf → Stellmotor → Regler → KI-Steuerung).',
              '**Vollständigkeit:** Motor → Übertragung → Werkzeug → Steuerung — das System bekommt nacheinander alle vier Subfunktionen integriert.',
              '**Steuerbarkeit:** offene Steuerung → Messung → Anpassung → smart (z.B. fester Vorschub → Vorschubsensor → adaptive Regelung → lernend).',
              '**Anpassung an die Nische:** Universal → einstellbar → individuell → selbstadaptierend (z.B. Standard-Schuh → orthopädischer Schuh → Maßschuh → selbstanpassende Sohle).',
              '**Ungleichmäßige Entwicklung:** welches Subsystem hinkt nach? Klassisches Bottleneck-Phänomen — eine Komponente bestimmt den Fortschritt des ganzen Systems.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Das achte Element („Ungleichmäßige Entwicklung") ist qualitativ — keine festen Stufen, nur eine Notiz. Es ergänzt die anderen sieben, indem es nach dem **schwächsten Glied** fragt.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'Altshuller\'s patent analysis shows: technical systems do not evolve randomly but along a small number of recurring **evolution trajectories**. Placing the current system on these trajectories predicts with high hit rate where the next product generation will go.',
          },
          {
            type: 'paragraph',
            content: 'The module collects **eight classical trends**. Each line has clearly named stages — the jump to the next stage is an innovation hypothesis the team can systematically check.',
          },
          {
            type: 'list',
            items: [
              '**Aggregation:** mono → bi → poly → integrated system (e.g. single headlight → twin → LED matrix → adaptive lighting system).',
              '**Dynamism:** rigid → jointed → elastic → fluid → field (e.g. steel beam → spring element → hydraulics → electromagnet).',
              '**Scale:** macro → meso → micro → nano (e.g. mechanical pump → MEMS pump → molecular transport).',
              '**Automation:** manual → mechanised → automatic → autonomous (e.g. knob → servo → controller → AI control).',
              '**Completeness:** engine → transmission → tool → control — the system gradually internalises all four sub-functions.',
              '**Controllability:** open loop → measured → adaptive → smart (e.g. fixed feed rate → feed sensor → adaptive control → learning).',
              '**Niche matching:** universal → adjustable → individually fitted → self-adapting (e.g. off-the-shelf shoe → orthotic shoe → custom-made → self-fitting sole).',
              '**Uneven development:** which subsystem lags? The classical bottleneck phenomenon — one component dictates the progress of the whole system.',
            ],
          },
          {
            type: 'paragraph',
            content: 'The eighth element ("uneven development") is qualitative — no fixed stages, only a note. It complements the other seven by asking for the **weakest link**.',
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
              'System benennen — eine konkrete technische Einheit, kein ganzes Produkt-Portfolio.',
              'Jeden Trend durchgehen und das System auf der Stufenleiter verorten. Bei Zweifel die naheliegende Stufe wählen — die Bewertung ist nicht der Punkt, der vollständige Durchgang ist es.',
              'Pro Trend eine Notiz zur **nächsten Stufe** schreiben: was würde der Sprung konkret bedeuten? Welche Komponente / welches Verhalten müsste geändert werden?',
              'Für den achten Trend (ungleichmäßige Entwicklung) das schwächste Subsystem identifizieren — meist die Komponente, die den Sprung in einem der anderen sieben Trends blockiert.',
              'Die so entstandene Liste der „nächste-Stufe-Möglichkeiten" priorisieren (mit anderen TRIZ-Werkzeugen oder schlicht nach Kosten / Wirkung).',
            ],
          },
          {
            type: 'paragraph',
            content: 'Trends können nicht beliebig weit getrieben werden: jede Linie sättigt sich. Ein System auf der höchsten Stufe einer Linie hat in dieser Dimension keine Reserven mehr — der Fortschritt verlagert sich auf andere Trends. Das Erkennen dieser **Sättigung** ist oft wichtiger als der nächste Stufensprung.',
          },
        ],
      },
      en: {
        title: 'Approach',
        blocks: [
          {
            type: 'list',
            items: [
              'Name the system — a concrete technical unit, not a whole product portfolio.',
              'Walk through every trend and place the system on the stage scale. When in doubt, pick the closest stage — the rating is not the point, the complete walk is.',
              'Per trend, write a note on the **next stage**: what would the jump mean concretely? Which component / behaviour would have to change?',
              'For the eighth trend (uneven development), identify the weakest subsystem — usually the component that blocks the jump on one of the other seven trends.',
              'Prioritise the resulting list of "next-stage opportunities" (with other TRIZ tools or simply by cost / impact).',
            ],
          },
          {
            type: 'paragraph',
            content: 'Trends cannot be driven arbitrarily far: each line saturates. A system at the top stage of a line has no further headroom in that dimension — progress moves to other trends. Recognising this **saturation** is often more important than the next stage jump.',
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
              '**9-Fenster-Werkzeug** — die Zukunfts-Spalte der 9-Fenster ist die freitextliche Schwester dieser Checkliste. Die Verortung auf den acht Trends gibt der Zukunfts-Spalte Struktur.',
              '**Ideales Endresultat (IFR)** — der nächste Stufensprung in einem Trend ist oft ein guter Kandidat für einen IFR.',
              '**Ressourcen-Checkliste** — viele Stufensprünge brauchen eine konkrete Ressource (z.B. der Sprung von „mechanisiert" auf „automatisch" braucht ein Sensorsignal).',
              '**Widerspruchsmatrix** — wenn der Stufensprung an einem technischen Widerspruch scheitert, formalisiere ihn dort.',
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
              '**9-Windows** — the future column of the 9-Windows is the free-form sibling of this checklist. Placing the system on the eight trends gives that column structure.',
              '**Ideal Final Result (IFR)** — the next stage jump in a trend is often a good IFR candidate.',
              '**Resources Checklist** — many stage jumps need a concrete resource (e.g. the jump from "mechanised" to "automatic" needs a sensor signal).',
              '**Contradiction Matrix** — when the stage jump fails on a technical contradiction, formalise it there.',
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
              'G. S. Altschuller: „Erfinden — Wege zur Lösung technischer Probleme" (1973, dt. 1984) — Kapitel zu Gesetzmäßigkeiten der Technik-Entwicklung.',
              'D. Mann: „Hands-On Systematic Innovation" — Kapitel „Trends of Evolution" (umfangreichste moderne Aufbereitung).',
              'V. Souchkov: „TRIZ Body of Knowledge" — Definition Patterns of Evolution.',
              'Y. Salamatov: „TRIZ — The Right Solution at the Right Time" — gut illustrierte Industriebeispiele pro Trend.',
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
              'G. S. Altshuller: "Creativity as an Exact Science" (1984) — chapter on laws of technical evolution.',
              'D. Mann: "Hands-On Systematic Innovation" — chapter "Trends of Evolution" (most extensive modern treatment).',
              'V. Souchkov: "TRIZ Body of Knowledge" — definition Patterns of Evolution.',
              'Y. Salamatov: "TRIZ — The Right Solution at the Right Time" — well-illustrated industry examples per trend.',
            ],
          },
        ],
      },
    },
  },
};
