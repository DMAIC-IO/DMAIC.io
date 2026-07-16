/**
 * D.Mike — SIPOC Module Handbook (sipoc-help.js)
 * Bilingual help content (DE/EN) for the SIPOC module.
 */

export default {
  moduleId: 'sipoc',
  sections: {
    overview: {
      de: {
        title: 'Aufbau eines {{term:sipoc|SIPOC}}',
        blocks: [
          {
            type: 'paragraph',
            content: 'Ein SIPOC-Diagramm fasst einen Prozess auf einer Seite zusammen und beantwortet die Frage: Wer liefert was, damit welcher Prozess welche Ergebnisse an welche Kunden liefert? Es besteht aus genau fünf Spalten, die von links nach rechts dem Materialfluss folgen.',
          },
          {
            type: 'definition',
            term: 'S — Suppliers (Lieferanten)',
            content: 'Personen, Abteilungen, Systeme oder Unternehmen, die Eingaben für den Prozess bereitstellen. Können extern (Materiallieferant) oder intern (Vorgelagerte Abteilung, IT-System) sein. Frage: Woher kommt das, was wir verarbeiten?',
          },
          {
            type: 'definition',
            term: 'I — Inputs (Eingaben)',
            content: 'Alles, was IN den Prozess fließt: Material, Halbzeuge, Daten, Aufträge, Informationen, Energie, Werkzeuge. Inputs sind die Voraussetzungen, ohne die der Prozess nicht starten kann.',
          },
          {
            type: 'definition',
            term: 'P — Process (Prozess)',
            content: 'Der eigentliche Ablauf — auf hoher Ebene als 5 bis 8 Hauptschritte. SIPOC ist bewusst grob: Es zeigt das „Was", nicht das „Wie". Detaillierte Abläufe gehören in ein Flowchart oder eine Value Stream Map.',
          },
          {
            type: 'definition',
            term: 'O — Outputs (Ausgaben)',
            content: 'Alles, was der Prozess LIEFERT: fertige Produkte, Dokumente, Daten, Entscheidungen, Dienstleistungen — auch unerwünschte Outputs wie Ausschuss, Abfall oder Nacharbeit gehören dazu.',
          },
          {
            type: 'definition',
            term: 'C — Customers (Kunden)',
            content: 'Empfänger der Outputs — extern (Endkunde, OEM) oder intern (Folgeprozess, QS, Lager, Buchhaltung). Jeder Output braucht mindestens einen Kunden, sonst ist er überflüssig.',
          },
          {
            type: 'paragraph',
            content: 'Kurz gesagt: SIPOC ist ein „One-Page-Process" — der schnellste Weg, um ein Team auf einen gemeinsamen Stand zu bringen, bevor detaillierte Analysen beginnen. Es wird in der Define-Phase eingesetzt, typischerweise direkt nach dem Project Charter.',
          },
        ],
      },
      en: {
        title: 'Anatomy of a SIPOC',
        blocks: [
          {
            type: 'paragraph',
            content: 'A SIPOC diagram summarizes a process on a single page and answers the question: who supplies what, so that which process delivers which results to which customers? It consists of exactly five columns that follow the material flow from left to right.',
          },
          {
            type: 'definition',
            term: 'S — Suppliers',
            content: 'People, departments, systems, or companies that provide inputs to the process. Can be external (material supplier) or internal (upstream department, IT system). Ask: where does what we process come from?',
          },
          {
            type: 'definition',
            term: 'I — Inputs',
            content: 'Everything that flows INTO the process: material, semi-finished goods, data, orders, information, energy, tools. Inputs are the prerequisites without which the process cannot start.',
          },
          {
            type: 'definition',
            term: 'P — Process',
            content: 'The actual workflow — at a high level, as 5 to 8 main steps. SIPOC is deliberately coarse: it shows the "what", not the "how". Detailed flows belong in a flowchart or a value stream map.',
          },
          {
            type: 'definition',
            term: 'O — Outputs',
            content: 'Everything the process DELIVERS: finished products, documents, data, decisions, services — including unwanted outputs such as scrap, waste, or rework.',
          },
          {
            type: 'definition',
            term: 'C — Customers',
            content: 'Recipients of the outputs — external (end customer, OEM) or internal (downstream process, QA, warehouse, accounting). Every output needs at least one customer; otherwise it is superfluous.',
          },
          {
            type: 'paragraph',
            content: 'In short: SIPOC is a "one-page process" — the fastest way to align a team on a shared picture before detailed analysis begins. It is used in the Define phase, typically right after the Project Charter.',
          },
        ],
      },
    },

    methodology: {
      de: {
        title: 'Methodik',
        blocks: [
          {
            type: 'paragraph',
            content: 'Ein SIPOC wird nicht von links nach rechts ausgefüllt, sondern in einer bewährten Reihenfolge, die hilft, den Prozess sauber abzugrenzen und Lücken zu vermeiden.',
          },
          {
            type: 'heading',
            content: 'Empfohlene Reihenfolge',
          },
          {
            type: 'list',
            items: [
              '1. Process zuerst: 5–8 Hauptschritte in der mittleren Spalte. Damit ist der Umfang („Scope") fixiert.',
              '2. Outputs: Was liefert der Prozess am Ende? Was geht aus dem letzten Schritt heraus?',
              '3. Customers: Wer empfängt jeden Output? Pro Output mindestens einen Kunden nennen.',
              '4. Inputs: Was wird in den ersten Schritt hineingegeben, damit er starten kann?',
              '5. Suppliers: Wer oder was liefert jeden Input?',
            ],
          },
          {
            type: 'heading',
            content: 'Wann einsetzen?',
          },
          {
            type: 'list',
            items: [
              'Zu Beginn eines Verbesserungsprojekts, um den Prozessumfang abzustecken.',
              'Wenn das Team noch kein gemeinsames Bild des Prozesses hat.',
              'Als Grundlage für detaillierte Prozessabbildungen (Value Stream Map, Swim Lane).',
              'Im Tollgate-Review der Define-Phase als Referenzdokument.',
              'Wenn Stakeholder schnell einen Überblick über den Prozess benötigen.',
            ],
          },
          {
            type: 'heading',
            content: 'Wann NICHT einsetzen?',
          },
          {
            type: 'list',
            items: [
              'Wenn ein detaillierter Prozessflussplan mit Entscheidungen und Schleifen benötigt wird — dafür ist ein Flowchart das richtige Werkzeug.',
              'Für Prozesse, die bereits gut dokumentiert und verstanden sind — SIPOC bringt hier wenig Mehrwert.',
            ],
          },
          {
            type: 'paragraph',
            content: 'SIPOC folgt auf den Project Charter und liefert Eingaben für die C&E-Matrix (welche Inputs beeinflussen die Outputs?) sowie die Stakeholder-Analyse (wer sind Lieferanten und Kunden?).',
          },
        ],
      },
      en: {
        title: 'Methodology',
        blocks: [
          {
            type: 'paragraph',
            content: 'A SIPOC is not filled in left to right, but in a proven order that helps define the scope cleanly and avoid gaps.',
          },
          {
            type: 'heading',
            content: 'Recommended order',
          },
          {
            type: 'list',
            items: [
              '1. Process first: 5–8 main steps in the middle column. This fixes the scope.',
              '2. Outputs: what does the process deliver at the end? What comes out of the last step?',
              '3. Customers: who receives each output? At least one customer per output.',
              '4. Inputs: what is fed into the first step so that it can start?',
              '5. Suppliers: who or what provides each input?',
            ],
          },
          {
            type: 'heading',
            content: 'When to use',
          },
          {
            type: 'list',
            items: [
              'At the start of an improvement project to define process scope.',
              'When the team does not yet share a common picture of the process.',
              'As a foundation for detailed process maps (value stream map, swim lane).',
              'In the Define-phase tollgate review as a reference document.',
              'When stakeholders need a quick overview of the process.',
            ],
          },
          {
            type: 'heading',
            content: 'When NOT to use',
          },
          {
            type: 'list',
            items: [
              'When a detailed process flowchart with decisions and loops is needed — use a flowchart instead.',
              'For processes that are already well documented and understood — SIPOC adds little value here.',
            ],
          },
          {
            type: 'paragraph',
            content: 'SIPOC follows the Project Charter and provides input for the C&E Matrix (which inputs influence the outputs?) and the Stakeholder Analysis (who are the suppliers and customers?).',
          },
        ],
      },
    },

    example: {
      de: {
        title: 'Praxisbeispiel',
        blocks: [
          {
            type: 'paragraph',
            content: 'Ein Hersteller von Automobil-Dichtringen stellt fest, dass die Ausschussrate in der Endkontrolle bei 4,2 % liegt. Das Six-Sigma-Team erstellt zunächst ein SIPOC, um den Fertigungsprozess auf oberster Ebene zu erfassen.',
          },
          {
            type: 'heading',
            content: 'Vorgehen',
          },
          {
            type: 'list',
            items: [
              'Process: „Rohmaterial einlagern" → „Compound mischen" → „Extrudieren" → „Vulkanisieren" → „Endkontrolle" → „Verpacken".',
              'Outputs: fertige Dichtringe, Prüfprotokolle, Ausschussware.',
              'Customers: Automobil-OEM, interne Qualitätsabteilung, Lager/Logistik.',
              'Inputs: Rohgummi-Granulat, Additive/Füllstoffe, Formwerkzeuge, Prozessparameter (Temperatur, Druck).',
              'Suppliers: Gummi-Lieferant A, Chemie-Lieferant B, interner Werkzeugbau.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Ergebnis: Das Team hat in 20 Minuten einen gemeinsamen Überblick über den Prozess. Die identifizierten Inputs können direkt als Startpunkt für die C&E-Matrix verwendet werden.',
          },
        ],
      },
      en: {
        title: 'Practical Example',
        blocks: [
          {
            type: 'paragraph',
            content: 'A manufacturer of automotive sealing rings finds that the defect rate at final inspection is 4.2 %. The Six Sigma team first creates a SIPOC to capture the manufacturing process at the highest level.',
          },
          {
            type: 'heading',
            content: 'Approach',
          },
          {
            type: 'list',
            items: [
              'Process: "Receive raw material" → "Mix compound" → "Extrude" → "Vulcanize" → "Final inspection" → "Package".',
              'Outputs: finished sealing rings, inspection reports, scrap.',
              'Customers: automotive OEM, internal quality department, warehouse/logistics.',
              'Inputs: raw rubber granulate, additives/fillers, mold tools, process parameters (temperature, pressure).',
              'Suppliers: rubber supplier A, chemical supplier B, internal tooling shop.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Result: the team has a shared overview of the process in 20 minutes. The identified inputs can be used directly as the starting point for the C&E Matrix.',
          },
        ],
      },
    },

    interpretation: {
      de: {
        title: 'Ergebnisse interpretieren',
        blocks: [
          {
            type: 'paragraph',
            content: 'Ein SIPOC hat keine statistische Ausgabe — es ist ein qualitatives Werkzeug. Die „Ergebnisse" zeigen sich in der Vollständigkeit und Konsistenz der fünf Spalten.',
          },
          {
            type: 'heading',
            content: 'Qualitätsprüfung',
          },
          {
            type: 'definition',
            term: 'Alle 5 Spalten gefüllt',
            content: 'Der Prozess ist auf hoher Ebene vollständig beschrieben. Weiter zur C&E-Matrix oder einer detaillierten Prozessanalyse.',
          },
          {
            type: 'definition',
            term: 'Process-Spalte hat mehr als 10 Schritte',
            content: 'Der Detaillierungsgrad ist zu hoch für ein SIPOC. Schritte zusammenfassen — ein SIPOC zeigt 5–8 Hauptschritte.',
          },
          {
            type: 'definition',
            term: 'Suppliers oder Customers leer',
            content: 'Wesentliche Beteiligte fehlen. Frage: Wer liefert die Inputs? Wer empfängt die Outputs?',
          },
          {
            type: 'definition',
            term: 'Outputs passen nicht zu Kundenerwartungen',
            content: 'Mögliche Lücke im Prozessverständnis. Mit einem VoC-CTx-Baum prüfen, was Kunden tatsächlich erwarten.',
          },
          {
            type: 'heading',
            content: 'Typische Muster',
          },
          {
            type: 'list',
            items: [
              'Mehr Inputs als Outputs → Der Prozess transformiert und verdichtet — normal in Fertigungsprozessen.',
              'Viele Suppliers für wenige Inputs → Lieferantenkonsolidierung könnte ein Verbesserungshebel sein.',
              'Ein Output, viele Customers → Potenzial für widersprüchliche Anforderungen — VOC prüfen.',
            ],
          },
        ],
      },
      en: {
        title: 'Interpreting Results',
        blocks: [
          {
            type: 'paragraph',
            content: 'A SIPOC has no statistical output — it is a qualitative tool. The "results" show in the completeness and consistency of the five columns.',
          },
          {
            type: 'heading',
            content: 'Quality check',
          },
          {
            type: 'definition',
            term: 'All 5 columns filled',
            content: 'The process is fully described at a high level. Proceed to the C&E Matrix or a detailed process analysis.',
          },
          {
            type: 'definition',
            term: 'Process column has more than 10 steps',
            content: 'The level of detail is too high for a SIPOC. Consolidate steps — a SIPOC shows 5–8 main steps.',
          },
          {
            type: 'definition',
            term: 'Suppliers or Customers empty',
            content: 'Key stakeholders are missing. Ask: who provides the inputs? Who receives the outputs?',
          },
          {
            type: 'definition',
            term: 'Outputs do not match customer expectations',
            content: 'Potential gap in process understanding. Use a VoC-CTx tree to check what customers actually expect.',
          },
          {
            type: 'heading',
            content: 'Common patterns',
          },
          {
            type: 'list',
            items: [
              'More inputs than outputs → the process transforms and consolidates — normal in manufacturing.',
              'Many suppliers for few inputs → supplier consolidation could be an improvement lever.',
              'One output, many customers → potential for conflicting requirements — check VOC.',
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
            term: 'Zu viele Prozessschritte',
            content: 'Ein SIPOC soll den Prozess auf 5–8 Hauptschritte abstrahieren. Wer 15+ Schritte einträgt, erstellt ein Flowchart, kein SIPOC. Schritte zusammenfassen und Details in eine nachgelagerte Prozessanalyse verlagern.',
          },
          {
            type: 'definition',
            term: 'Inputs und Outputs verwechselt',
            content: 'Inputs sind das, was IN den Prozess einfließt (Material, Informationen, Ressourcen). Outputs sind das, was der Prozess LIEFERT. Faustregel: „Brauche ich das, um den Prozess zu starten?" → Input. „Entsteht das durch den Prozess?" → Output.',
          },
          {
            type: 'definition',
            term: 'Interne Kunden vergessen',
            content: 'Customers sind nicht nur externe Endkunden. Auch interne Abteilungen (QS, Lager, Buchhaltung) empfangen Prozessergebnisse. Alle Empfänger auflisten — das macht die spätere Anforderungsanalyse vollständiger.',
          },
          {
            type: 'definition',
            term: 'SIPOC allein im Büro erstellt',
            content: 'Ein SIPOC sollte im Team erarbeitet werden — idealerweise mit Personen, die den Prozess täglich ausführen. Ein einsam erstelltes SIPOC spiegelt oft nur eine Perspektive wider und lässt blinde Flecken.',
          },
          {
            type: 'definition',
            term: 'Keine Verbindung zu nachfolgenden Tools',
            content: 'Ein SIPOC ist kein Selbstzweck. Die identifizierten Inputs als Zeilen in der C&E-Matrix nutzen und die Customers als Grundlage für die Stakeholder-Analyse.',
          },
          {
            type: 'definition',
            term: 'Prozessgrenzen unklar',
            content: 'Ohne klar definierten Start- und Endpunkt wird das SIPOC entweder zu groß oder zu vage. Vor dem Befüllen festlegen: Wo beginnt der Prozess (erstes Ereignis)? Wo endet er (letztes Ereignis)?',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Too many process steps',
            content: 'A SIPOC should abstract the process to 5–8 main steps. Entering 15+ steps creates a flowchart, not a SIPOC. Consolidate steps and move details to a downstream process analysis.',
          },
          {
            type: 'definition',
            term: 'Inputs and outputs confused',
            content: 'Inputs are what flows INTO the process (material, information, resources). Outputs are what the process DELIVERS. Rule of thumb: "Do I need this to start the process?" → input. "Does this result from the process?" → output.',
          },
          {
            type: 'definition',
            term: 'Internal customers forgotten',
            content: 'Customers are not only external end-users. Internal departments (QA, warehouse, accounting) also receive process outputs. List all recipients — this makes the later requirements analysis more complete.',
          },
          {
            type: 'definition',
            term: 'SIPOC created alone at the desk',
            content: 'A SIPOC should be developed as a team — ideally with people who execute the process daily. A SIPOC built in isolation often reflects only one perspective and leaves blind spots.',
          },
          {
            type: 'definition',
            term: 'No connection to downstream tools',
            content: 'A SIPOC is not an end in itself. Use the identified inputs as rows in the C&E Matrix and the customers as the basis for the Stakeholder Analysis.',
          },
          {
            type: 'definition',
            term: 'Unclear process boundaries',
            content: 'Without a clearly defined start and end point, the SIPOC becomes either too large or too vague. Before filling it in, decide: where does the process begin (first event)? Where does it end (last event)?',
          },
        ],
      },
    },
  },
};
