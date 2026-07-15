/**
 * D.Mike — FMEA Module Handbook (fmea-help.js)
 * Bilingual help content (DE/EN) for the FMEA module.
 */

export default {
  moduleId: 'fmea',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Die {{term:fmea|FMEA}} (Failure Mode and Effects Analysis, dt. Fehlermöglichkeits- und Einflussanalyse) ist eine systematische Methode zur Identifikation und Bewertung potenzieller Fehler in Produkten oder Prozessen. Ziel ist, Risiken zu erkennen, bevor sie auftreten, und sie nach Priorität anzugehen — sie ist ein zentrales Werkzeug der Improve- und Control-Phase, sollte aber bereits in Define oder Analyze begonnen werden.',
          },
          {
            type: 'definition',
            term: 'Funktion / Schritt',
            content: 'Was soll der Prozess oder das Bauteil leisten? Jede Zeile beginnt mit der erwarteten Funktion oder dem Prozessschritt — aus dieser Sollvorstellung leiten sich die möglichen Abweichungen ab.',
          },
          {
            type: 'definition',
            term: 'Fehlermöglichkeit (Failure Mode)',
            content: 'Die {{term:fehlermoeglichkeit|Fehlermöglichkeit}} ist die mögliche Art der Abweichung von der Funktion — z. B. „nicht eingerastet", „falsch dosiert", „zu spät geliefert". Pro Funktion können mehrere Fehlermöglichkeiten existieren.',
          },
          {
            type: 'definition',
            term: 'Folge (Effect)',
            content: 'Was passiert, wenn der Fehler eintritt — beim nächsten Prozessschritt, am Endprodukt, beim Kunden? Eine Fehlermöglichkeit kann mehrere Folgen unterschiedlicher Schwere haben.',
          },
          {
            type: 'definition',
            term: 'Ursache (Cause)',
            content: 'Was könnte den Fehler auslösen? Mehrere Ursachen pro Fehlermöglichkeit sind die Regel — jede wird einzeln bewertet, weil sich Auftrittswahrscheinlichkeit und Maßnahmen unterscheiden.',
          },
          {
            type: 'definition',
            term: 'B (Bedeutung) / Severity',
            content: '{{term:bedeutung|Bedeutung}}: Wie schwer wäre die Folge für den Kunden? Skala 1–10: 1 = unbedeutend, 10 = sicherheitskritisch. Wird durch das Produkt oder die Anforderung definiert, nicht durch den Prozess.',
          },
          {
            type: 'definition',
            term: 'A (Auftreten) / Occurrence',
            content: '{{term:auftreten|Auftreten}}: Wie häufig tritt die Ursache erfahrungsgemäß auf? Skala 1–10: 1 = sehr selten, 10 = quasi permanent. Idealerweise mit Daten belegt, sonst geschätzt.',
          },
          {
            type: 'definition',
            term: 'E (Entdeckung) / Detection',
            content: '{{term:entdeckung|Entdeckung}}: Wie wahrscheinlich wird der Fehler vor dem Kunden entdeckt? Skala 1–10: 1 = wird sicher gefunden, 10 = wird garantiert übersehen. Achtung: hohe Zahl ist schlecht (umgekehrt zur Intuition).',
          },
          {
            type: 'definition',
            term: 'RPZ (Risikoprioritätszahl) / RPN',
            content: '{{term:rpz|RPZ}} = B × A × E. Werte zwischen 1 und 1000. Die RPZ ist eine grobe Priorisierung — keine absolute Risikomessung. Hohe Bedeutung (B ≥ 9) wird oft unabhängig vom RPZ-Wert bearbeitet.',
          },
          {
            type: 'paragraph',
            content: 'Die FMEA ist ein lebendes Dokument: Sie wird bei jeder relevanten Änderung aktualisiert. Eine einmal abgeheftete FMEA verliert ihren Wert.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: '{{term:fmea|FMEA}} (Failure Mode and Effects Analysis) is a systematic method for identifying and evaluating potential failures in products or processes. The goal is to spot risks before they occur and tackle them by priority — it is a central tool of the Improve and Control phases but should already begin in Define or Analyze.',
          },
          {
            type: 'definition',
            term: 'Function / step',
            content: 'What should the process or part do? Every row starts with the expected function or process step — from this target view the possible deviations are derived.',
          },
          {
            type: 'definition',
            term: 'Failure mode',
            content: 'The {{term:fehlermoeglichkeit|failure mode}} is the possible kind of deviation from the function — e.g. "not snapped in", "wrong dosage", "delivered too late". Several failure modes per function are possible.',
          },
          {
            type: 'definition',
            term: 'Effect',
            content: 'What happens if the failure occurs — at the next step, at the final product, at the customer? A failure mode can have several effects of different severity.',
          },
          {
            type: 'definition',
            term: 'Cause',
            content: 'What might trigger the failure? Several causes per failure mode are the rule — each is rated separately because occurrence and actions differ.',
          },
          {
            type: 'definition',
            term: 'S (Severity)',
            content: '{{term:bedeutung|Severity}}: How serious would the effect be for the customer? Scale 1–10: 1 = negligible, 10 = safety-critical. Defined by the product or requirement, not by the process.',
          },
          {
            type: 'definition',
            term: 'O (Occurrence)',
            content: '{{term:auftreten|Occurrence}}: How often does the cause occur in practice? Scale 1–10: 1 = very rare, 10 = nearly permanent. Ideally backed by data, otherwise estimated.',
          },
          {
            type: 'definition',
            term: 'D (Detection)',
            content: '{{term:entdeckung|Detection}}: How likely is the failure detected before reaching the customer? Scale 1–10: 1 = will surely be found, 10 = guaranteed to slip through. Note: a high number is bad (counterintuitive).',
          },
          {
            type: 'definition',
            term: 'RPN (Risk Priority Number)',
            content: '{{term:rpz|RPN}} = S × O × D. Values from 1 to 1000. The RPN is a rough prioritization — not an absolute risk measure. High severity (S ≥ 9) is often addressed regardless of RPN.',
          },
          {
            type: 'paragraph',
            content: 'FMEA is a living document: updated on every relevant change. An FMEA filed away once loses its value.',
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
              'Umfang abgrenzen — welche Funktion, welcher Prozessabschnitt wird analysiert?',
              'Funktionen bzw. Schritte auflisten — am besten an der Prozesskarte entlang.',
              'Pro Schritt mögliche Fehler brainstormen — im Team, mit Experten und Praktikern.',
              'Pro Fehler die Folgen und Ursachen beschreiben.',
              'B, A, E gemeinsam vergeben — ein einheitlicher Bewertungsrahmen ist Pflicht.',
              'RPZ berechnen und priorisieren.',
              'Maßnahmen ableiten — Ursache reduzieren (A senken) oder Entdeckung verbessern (E senken). B lässt sich nur durch Designänderung senken.',
              'Nach Umsetzung Bewertung erneuern und prüfen, ob die Maßnahme gewirkt hat.',
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
              'Define scope — which function, which process slice is analyzed?',
              'List functions or steps — ideally along the process map.',
              'Brainstorm possible failures per step — with the team, experts, and practitioners.',
              'Describe effects and causes per failure.',
              'Assign S, O, D collectively — a uniform rating frame is mandatory.',
              'Calculate the RPN and prioritize.',
              'Derive actions — reduce occurrence (lower O) or improve detection (lower D). Severity can only be lowered by design change.',
              'After implementation, re-rate and check whether the action worked.',
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
            term: 'Allein gemacht',
            content: 'Eine FMEA von einer Person ist nur ein Brainstorming dieser Person. Im interdisziplinären Team — Konstruktion, Fertigung, Qualität, Service — werden weit mehr Fehler sichtbar.',
          },
          {
            type: 'definition',
            term: 'Inkonsistente Skalen',
            content: 'Wenn jede Bewertung gegen ein anderes mentales Modell von „Bedeutung 7" erfolgt, sind RPZ-Werte unvergleichbar. Vor Beginn die Skala mit Beispielen kalibrieren.',
          },
          {
            type: 'definition',
            term: 'RPZ-Schwellwert als einzige Regel',
            content: '„Alles über 100 wird bearbeitet" übersieht den Fall B = 10, A = 1, E = 1 — RPZ 10, aber sicherheitskritisch. Bei hoher Bedeutung immer Maßnahme prüfen, unabhängig vom RPZ.',
          },
          {
            type: 'definition',
            term: 'Maßnahmen ohne Wirkungsprüfung',
            content: 'Eine Maßnahme „im Plan" ist nicht gleich einer wirksamen Maßnahme. Nach Umsetzung B/A/E neu bewerten — wenn sich nichts ändert, wirkt die Maßnahme nicht.',
          },
          {
            type: 'definition',
            term: 'Symptome bewerten statt Ursachen',
            content: 'Wer „Bauteil bricht" als Ursache einträgt, hat keine FMEA gemacht, sondern eine Symptomliste. Ursache ist „falsche Materialspezifikation" oder „Lastannahme zu niedrig".',
          },
          {
            type: 'definition',
            term: 'FMEA ist Pflichtübung',
            content: 'Wenn die FMEA nur erstellt wird, um eine Audit-Anforderung zu erfüllen, wird sie nicht gelebt. Der Wert entsteht durch echte Diskussion und ableitbare Maßnahmen.',
          },
          {
            type: 'definition',
            term: 'Veraltete FMEA',
            content: 'Prozesse und Produkte ändern sich. Eine FMEA, die seit drei Jahren nicht angefasst wurde, beschreibt einen Zustand, den es vielleicht nicht mehr gibt.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Done alone',
            content: 'An FMEA by one person is just one person\'s brainstorm. In an interdisciplinary team — design, manufacturing, quality, service — far more failures surface.',
          },
          {
            type: 'definition',
            term: 'Inconsistent scales',
            content: 'When every rating runs against a different mental model of "severity 7", RPN values are incomparable. Calibrate the scale with examples before starting.',
          },
          {
            type: 'definition',
            term: 'RPN threshold as only rule',
            content: '"Anything above 100 gets addressed" misses the case S = 10, O = 1, D = 1 — RPN 10, but safety-critical. Always consider action when severity is high, regardless of RPN.',
          },
          {
            type: 'definition',
            term: 'Actions without effectiveness check',
            content: 'An action "on the plan" is not the same as an effective action. After implementation re-rate S/O/D — if nothing changes, the action does not work.',
          },
          {
            type: 'definition',
            term: 'Rating symptoms instead of causes',
            content: 'Listing "part breaks" as cause is not FMEA but a symptom list. The cause is "wrong material spec" or "load assumption too low".',
          },
          {
            type: 'definition',
            term: 'FMEA as compliance exercise',
            content: 'If FMEA is created only to satisfy an audit, it is not lived. Value comes from real discussion and actionable outcomes.',
          },
          {
            type: 'definition',
            term: 'Outdated FMEA',
            content: 'Processes and products change. An FMEA untouched for three years describes a state that may no longer exist.',
          },
        ],
      },
    },
  },
};
