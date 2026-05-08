/**
 * D.Mike — MSA Type 2 Module Handbook (msa-typ2-help.js)
 * Bilingual help content (DE/EN) for the MSA Type 2 (Gage R&R) module.
 */

export default {
  moduleId: 'msa-typ2',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Die MSA Typ-2-Studie (Gage R&R, Repeatability & Reproducibility) zerlegt die Streuung eines Messsystems in drei Komponenten: Wiederholbarkeit (dasselbe Teil, derselbe Bediener), Reproduzierbarkeit (dasselbe Teil, verschiedene Bediener) und Teile-zu-Teile-Streuung. Sie ist der Standardtest, bevor Prozessfähigkeit oder Regelkarten belastbar sind.',
          },
          {
            type: 'definition',
            term: 'Wiederholbarkeit (EV, Equipment Variation)',
            content: 'Streuung, wenn ein Bediener dasselbe Teil mehrfach misst. Sie kommt rein aus dem Gerät und der Messprozedur — nicht vom Menschen, nicht vom Teil.',
          },
          {
            type: 'definition',
            term: 'Reproduzierbarkeit (AV, Appraiser Variation)',
            content: 'Streuung, wenn verschiedene Bediener dasselbe Teil messen. Kommt aus Handhabung, Ablesen, Vorrichtung. Ein hoher AV-Anteil zeigt auf Schulungsbedarf oder unklare Messanweisung.',
          },
          {
            type: 'definition',
            term: 'Teile-zu-Teile (PV, Part Variation)',
            content: 'Streuung zwischen den ausgewählten Teilen selbst. Sollte dominieren — wenn nicht, misst das Messsystem vor allem sich selbst, nicht den Prozess.',
          },
          {
            type: 'definition',
            term: 'GR&R in % (von Streuung oder Toleranz)',
            content: 'Verhältnis der Messsystem-Streuung zur gesamten Streuung oder zur Toleranz. < 10 % gilt als akzeptabel, 10–30 % bedingt akzeptabel, > 30 % nicht akzeptabel.',
          },
          {
            type: 'definition',
            term: 'Number of Distinct Categories (ndc)',
            content: 'Wie viele unterschiedliche Stufen das Messsystem in der beobachteten Teilespanne unterscheiden kann. Faustregel: ndc ≥ 5. Unter 5 wird der Prozess nicht feinfühlig genug wahrgenommen.',
          },
          {
            type: 'paragraph',
            content: 'Gage R&R ist ein statistisches Experiment, kein Zahlenspiel. Die Teileauswahl, die Reihenfolge, die Blindheit der Bediener — all das beeinflusst das Ergebnis. Ein handwerklich sauberes Setup ist wichtiger als die Software.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'The MSA Type 2 study (Gage R&R, Repeatability & Reproducibility) decomposes measurement-system variation into three components: repeatability (same part, same operator), reproducibility (same part, different operators), and part-to-part variation. It is the standard check before process capability or control charts become trustworthy.',
          },
          {
            type: 'definition',
            term: 'Repeatability (EV, Equipment Variation)',
            content: 'Variation when one operator measures the same part multiple times. It comes purely from the instrument and the measurement procedure — not from humans or parts.',
          },
          {
            type: 'definition',
            term: 'Reproducibility (AV, Appraiser Variation)',
            content: 'Variation when different operators measure the same part. Comes from handling, reading, fixturing. A high AV share indicates training needs or an unclear procedure.',
          },
          {
            type: 'definition',
            term: 'Part-to-part (PV, Part Variation)',
            content: 'Variation between the selected parts themselves. Should dominate — if not, the system is mostly measuring itself, not the process.',
          },
          {
            type: 'definition',
            term: 'GR&R in % (of variation or tolerance)',
            content: 'Ratio of measurement-system variation to total variation or tolerance. < 10% is accepted, 10–30% conditionally accepted, > 30% not accepted.',
          },
          {
            type: 'definition',
            term: 'Number of Distinct Categories (ndc)',
            content: 'How many distinct levels the system can tell apart within the observed part range. Rule of thumb: ndc ≥ 5. Below 5 the process is seen too coarsely.',
          },
          {
            type: 'paragraph',
            content: 'Gage R&R is a statistical experiment, not a number game. Part selection, order, operator blinding — all influence the result. A craftsmanlike setup matters more than the software.',
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
              'Typischer Aufbau: 10 Teile × 3 Bediener × 2–3 Wiederholungen = 60–90 Messungen.',
              'Teile so auswählen, dass sie die Prozessspanne abdecken — nicht alle nahe am Mittelwert.',
              'Bediener sind in der Produktion tätig, nicht speziell trainiert für den Test.',
              'Reihenfolge zufallsverteilt, Bediener blind gegenüber dem wahren Teil.',
              'Gleiche Messprozedur, gleiches Gerät, gleiche Vorrichtung.',
              'Ergebnisse mit der ANOVA-Methode auswerten (nicht Range-Methode für moderne Studien).',
              'GR&R-Prozent, ndc und Komponentenanteile bewerten.',
              'Bei Scheitern Ursache klären (Gerät, Bediener, Vorrichtung, Messverfahren) und nachbessern.',
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
              'Typical setup: 10 parts × 3 operators × 2–3 repeats = 60–90 measurements.',
              'Pick parts spanning the process range — not all near the mean.',
              'Use operators who run the process, not specially trained testers.',
              'Randomize order, blind operators to which part is which.',
              'Same procedure, same instrument, same fixture.',
              'Analyze with the ANOVA method (not the range method for modern studies).',
              'Assess GR&R percent, ndc, and component shares.',
              'On failure, identify the cause (instrument, operator, fixture, procedure) and fix it.',
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
            term: 'Teile zu ähnlich',
            content: 'Wenn alle 10 Teile nah beieinander liegen, scheitert die Studie oft an zu wenig Teile-Streuung — GR&R wirkt groß, weil PV klein ist. Die Teile müssen den relevanten Prozessbereich abdecken.',
          },
          {
            type: 'definition',
            term: 'Bediener wissen, welches Teil sie haben',
            content: 'Ohne Blindheit erinnern sie sich an vorherige Messwerte und „korrigieren" unbewusst. Ergebnis: Wiederholbarkeit zu gut, echte Streuung versteckt.',
          },
          {
            type: 'definition',
            term: 'Reihenfolge nicht randomisiert',
            content: 'Systematische Abfolgen (z. B. Bediener 1 zuerst alles, dann Bediener 2) vermischen Drift mit Bedienereinfluss. Zufallsreihenfolge ist Pflicht.',
          },
          {
            type: 'definition',
            term: 'Nur die beste Bedienermannschaft getestet',
            content: 'Wer die ausgewählten Bediener für den Test vorher extra schult, misst das Potenzial — nicht die Alltagsrealität. Im Ergebnis sieht es gut aus, bis der echte Schichtbetrieb kommt.',
          },
          {
            type: 'definition',
            term: 'ndc ignoriert',
            content: 'GR&R 20 % kann mit ndc 3 einhergehen — dann sieht das System den Prozess nur in drei Stufen. Beide Kennzahlen gemeinsam lesen.',
          },
          {
            type: 'definition',
            term: 'Range-Methode statt ANOVA',
            content: 'Die klassische Range-Methode unterschätzt Interaktionen. Moderne Studien verwenden ANOVA — sie gibt Repeatability, Reproducibility und die Bediener×Teil-Interaktion separat an.',
          },
          {
            type: 'definition',
            term: 'Interpretation „10 % ist gut"',
            content: 'Ob 10 % GR&R ausreichen, hängt von der Anwendung ab. Bei sicherheitskritischen Toleranzen kann 10 % schon zu viel sein, bei grober Fertigung sind 20 % in Ordnung. Kontext schlägt Tabelle.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Parts too similar',
            content: 'If all 10 parts sit close together, the study fails from too little part variation — GR&R looks big because PV is small. Parts must span the relevant process range.',
          },
          {
            type: 'definition',
            term: 'Operators know which part they have',
            content: 'Without blinding, they remember prior readings and "correct" unconsciously. Repeatability looks too good, real variation hides.',
          },
          {
            type: 'definition',
            term: 'Order not randomized',
            content: 'Systematic order (e.g. operator 1 first, then operator 2) confounds drift with operator effect. Randomization is mandatory.',
          },
          {
            type: 'definition',
            term: 'Only best operators tested',
            content: 'Pre-training the selected operators measures potential — not everyday reality. Results look great until real shifts run.',
          },
          {
            type: 'definition',
            term: 'ndc ignored',
            content: 'GR&R 20% can come with ndc 3 — the system sees only three levels of the process. Read both indices together.',
          },
          {
            type: 'definition',
            term: 'Range method instead of ANOVA',
            content: 'The classic range method underestimates interactions. Modern studies use ANOVA — it reports repeatability, reproducibility, and the operator×part interaction separately.',
          },
          {
            type: 'definition',
            term: 'Interpreting "10% is good"',
            content: 'Whether 10% GR&R is enough depends on the use. For safety-critical tolerances even 10% may be too much; for rough manufacturing 20% is fine. Context beats table.',
          },
        ],
      },
    },
  },
};
