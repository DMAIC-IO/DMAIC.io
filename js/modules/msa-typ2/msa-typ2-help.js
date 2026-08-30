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
            content: 'Die MSA Typ-2-Studie ({{term:gage-rr|Gage R&R}}, Repeatability & Reproducibility) zerlegt die Streuung eines Messsystems in drei Komponenten: {{term:wiederholbarkeit|Wiederholbarkeit}} (dasselbe Teil, derselbe Bediener), {{term:reproduzierbarkeit|Reproduzierbarkeit}} (dasselbe Teil, verschiedene Bediener) und {{term:teile-variation|Teile-zu-Teile-Streuung}}. Sie ist der Standardtest, bevor Prozessfähigkeit oder Regelkarten belastbar sind.',
          },
          {
            type: 'definition',
            term: 'Wiederholbarkeit (EV, Equipment Variation)',
            content: '{{term:wiederholbarkeit|Wiederholbarkeit}} ist die Streuung, wenn ein Bediener dasselbe Teil mehrfach misst. Sie kommt rein aus dem Gerät und der Messprozedur — nicht vom Menschen, nicht vom Teil.',
          },
          {
            type: 'definition',
            term: 'Reproduzierbarkeit (AV, Appraiser Variation)',
            content: '{{term:reproduzierbarkeit|Reproduzierbarkeit}} ist die Streuung, wenn verschiedene Bediener dasselbe Teil messen. Kommt aus Handhabung, Ablesen, Vorrichtung. Ein hoher AV-Anteil zeigt auf Schulungsbedarf oder unklare Messanweisung.',
          },
          {
            type: 'definition',
            term: 'Teile-zu-Teile (PV, Part Variation)',
            content: '{{term:teile-variation|Teile-zu-Teile-Streuung}} zwischen den ausgewählten Teilen selbst. Sollte dominieren — wenn nicht, misst das Messsystem vor allem sich selbst, nicht den Prozess.',
          },
          {
            type: 'definition',
            term: 'GR&R in % (von Streuung oder Toleranz)',
            content: 'Verhältnis der Messsystem-Streuung zur gesamten Streuung oder zur Toleranz. < 10 % gilt als akzeptabel, 10–30 % bedingt akzeptabel, > 30 % nicht akzeptabel.',
          },
          {
            type: 'definition',
            term: 'Number of Distinct Categories (ndc)',
            content: '{{term:ndc|ndc}} zeigt, wie viele unterschiedliche Stufen das Messsystem in der beobachteten Teilespanne unterscheiden kann. Faustregel: ndc ≥ 5. Unter 5 wird der Prozess nicht feinfühlig genug wahrgenommen.',
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
            content: 'The MSA Type 2 study ({{term:gage-rr|Gage R&R}}, Repeatability & Reproducibility) decomposes measurement-system variation into three components: {{term:wiederholbarkeit|repeatability}} (same part, same operator), {{term:reproduzierbarkeit|reproducibility}} (same part, different operators), and {{term:teile-variation|part-to-part variation}}. It is the standard check before {{term:prozessfaehigkeit|process capability}} or control charts become trustworthy.',
          },
          {
            type: 'definition',
            term: 'Repeatability (EV, Equipment Variation)',
            content: '{{term:wiederholbarkeit|Repeatability}} — variation when one operator measures the same part multiple times. It comes purely from the instrument and the measurement procedure — not from humans or parts.',
          },
          {
            type: 'definition',
            term: 'Reproducibility (AV, Appraiser Variation)',
            content: '{{term:reproduzierbarkeit|Reproducibility}} — variation when different operators measure the same part. Comes from handling, reading, fixturing. A high AV share indicates training needs or an unclear procedure.',
          },
          {
            type: 'definition',
            term: 'Part-to-part (PV, Part Variation)',
            content: '{{term:teile-variation|Part-to-part variation}} between the selected parts themselves. Should dominate — if not, the system is mostly measuring itself, not the process.',
          },
          {
            type: 'definition',
            term: 'GR&R in % (of variation or tolerance)',
            content: 'Ratio of measurement-system variation to total variation or tolerance. < 10% is accepted, 10–30% conditionally accepted, > 30% not accepted.',
          },
          {
            type: 'definition',
            term: 'Number of Distinct Categories (ndc)',
            content: '{{term:ndc|ndc}} counts how many distinct levels the system can tell apart within the observed part range. Rule of thumb: ndc ≥ 5. Below 5 the process is seen too coarsely.',
          },
          {
            type: 'paragraph',
            content: 'Gage R&R is a statistical experiment, not a number game. Part selection, order, operator blinding — all influence the result. A craftsmanlike setup matters more than the software.',
          },
        ],
      },
    },

    typ3: {
      de: {
        title: 'Typ 2 vs. Typ 3',
        blocks: [
          {
            type: 'paragraph',
            content: 'Typ 2 misst mit Prüfern (klassisches Gage R&R). Typ 3 läuft ohne Prüfer — für automatisierte Messsysteme (KMG im Automatikmodus, In-Prozess-Sensoren, Prüfstände), bei denen der Prüfer keinen Einfluss auf das Messergebnis hat.',
          },
          {
            type: 'definition',
            term: 'Wann Typ 3?',
            content: 'Immer dann, wenn der Prüfer physisch entkoppelt vom Messvorgang ist: automatisiertes Handling, festes Aufnahmesystem, Prüfling wird eingelegt und die Maschine misst selbstständig. Kein Ableseeffekt, keine Handhabung.',
          },
          {
            type: 'definition',
            term: 'Prüfer-Spalte leer lassen',
            content: 'Im Modul einfach die Prüfer-Spalte nicht setzen — das Modul erkennt Typ 3 automatisch, blendet Reproduzierbarkeit (AV), die Wechselwirkungssektion sowie die „nach Bediener"-Diagramme aus. %GRR entspricht dann dem reinen Repeatability-Anteil (%EV).',
          },
          {
            type: 'definition',
            term: 'Versuchsplan (Bosch/VDA-Konvention)',
            content: 'Typische Anordnungen: 25 Teile × 2 Wiederholungen oder 10 Teile × 3 Wiederholungen. Ohne Prüfer sind mehr Teile pro Studie realistisch. Mit nur 2 Wiederholungen zeigt das Modul einen Hinweis — mehr Wiederholungen erhöhen die Schätzgenauigkeit der Wiederholstreuung.',
          },
          {
            type: 'definition',
            term: 'Auswertung',
            content: 'One-Way-ANOVA mit Teilen als zufälligem Effekt. σ²_GRR = σ²_Repeat, ndc und %GRR-Grenzen (< 10 % / 10–30 % / > 30 %) bleiben identisch zu Typ 2. Reproduzierbarkeit ist definitionsgemäß 0.',
          },
        ],
      },
      en: {
        title: 'Type 2 vs. Type 3',
        blocks: [
          {
            type: 'paragraph',
            content: 'Type 2 measures with operators (classic Gage R&R). Type 3 runs without operators — for automated measurement systems (CMM in automatic mode, in-process sensors, test rigs) where the operator has no influence on the reading.',
          },
          {
            type: 'definition',
            term: 'When Type 3?',
            content: 'Whenever the operator is physically decoupled from the measurement: automated handling, fixed fixture, the part is placed and the machine measures on its own. No reading effect, no handling variation.',
          },
          {
            type: 'definition',
            term: 'Leave the operator column empty',
            content: 'In the module, simply leave the operator column unset — the module detects Type 3 automatically and hides reproducibility (AV), the interaction section, and the by-operator charts. %GRR then equals the pure repeatability share (%EV).',
          },
          {
            type: 'definition',
            term: 'Study plan (Bosch/VDA convention)',
            content: 'Typical layouts: 25 parts × 2 replicates or 10 parts × 3 replicates. Without operators, more parts per study become realistic. With only 2 replicates the module shows a warning — more replicates improve the estimate of within-part variation.',
          },
          {
            type: 'definition',
            term: 'Analysis',
            content: 'One-way random-effects ANOVA with parts as a random effect. σ²_GRR = σ²_Repeat, and the ndc plus %GRR thresholds (< 10 % / 10–30 % / > 30 %) remain identical to Type 2. Reproducibility is zero by definition.',
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
              'Teile so auswählen, dass sie die Prozessspanne abdecken — nicht alle nahe am {{term:mittelwert|Mittelwert}}.',
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
            content: 'Systematic order (e.g. operator 1 first, then operator 2) confounds drift with operator effect. {{term:randomisierung|Randomization}} is mandatory.',
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
