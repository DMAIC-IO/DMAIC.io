/**
 * D.Mike — DoE-Berater Module Handbook (doe-advisor-help.js)
 * Bilingual help content (DE/EN) for the DoE-Berater module.
 */

export default {
  moduleId: 'doe-advisor',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Der DoE-Berater hilft, das passende Versuchsdesign für ein Six-Sigma-Projekt zu finden. Die Wahl des richtigen Designs entscheidet darüber, ob aus einer begrenzten Anzahl Versuche belastbare Erkenntnisse über Haupteffekte, Wechselwirkungen und Optima entstehen — oder Aufwand verpufft.',
          },
          {
            type: 'definition',
            term: 'Übersicht',
            content: 'Tabellarische Gegenüberstellung aller im Six-Sigma-Alltag relevanten Designs (Vollfaktoriell 2^k, Vollfaktoriell allgemein, Teilfaktoriell, Plackett-Burman, Definitive Screening Design, CCD rotatable und face-centered, Box-Behnken, Taguchi, Streuungs-DoE, Mischungspläne, D-optimal, EVOP) mit Faktorbereich, Stufenzahl, Aufwand und Hauptvorteil.',
          },
          {
            type: 'definition',
            term: 'Berater',
            content: 'Geführter Frage-Wizard. Aus DMAIC-Phase, Zielsetzung und Randbedingungen (Faktorgrenzen, erlaubte Eckpunkte, Krümmung, Mischungen, Robustheit) leitet er eine konkrete Designempfehlung mit Begründung ab.',
          },
          {
            type: 'definition',
            term: 'CCD-Vergleich',
            content: 'Direkter Vergleich der beiden gebräuchlichsten Response-Surface-Designs: rotatable (CCC) gegen face-centered (CCF) — Sternpunktlage, α-Wert, Stufenzahl, Rotierbarkeit, Einsatzfälle.',
          },
          {
            type: 'paragraph',
            content: 'Das Modul ersetzt keine Versuchsplanung im DoE-Planer — es hilft davor: bei der Auswahl. Sobald das Design feststeht, wird im DoE-Planer der konkrete Plan generiert und im Worksheet ausgewertet.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'The DoE Advisor helps you choose the right experimental design for a Six Sigma project. The choice of design decides whether a limited number of runs yields robust insight into main effects, interactions and optima — or whether effort is wasted.',
          },
          {
            type: 'definition',
            term: 'Overview',
            content: 'Side-by-side table of all designs relevant in everyday Six Sigma (full factorial 2^k, general full factorial, fractional, Plackett-Burman, Definitive Screening Design, CCD rotatable and face-centered, Box-Behnken, Taguchi, dispersion DoE, mixture designs, D-optimal, EVOP) with factor range, levels, effort and key advantage.',
          },
          {
            type: 'definition',
            term: 'Advisor',
            content: 'Guided question wizard. From DMAIC phase, objective and constraints (factor limits, allowed corner points, curvature, mixtures, robustness) it derives a concrete design recommendation with reasoning.',
          },
          {
            type: 'definition',
            term: 'CCD comparison',
            content: 'Direct comparison of the two most common response-surface designs: rotatable (CCC) versus face-centered (CCF) — star point location, α value, number of levels, rotatability, typical applications.',
          },
          {
            type: 'paragraph',
            content: 'This module does not replace planning in the DoE Planner — it comes before: at the selection step. Once the design is chosen, the DoE Planner generates the concrete plan and the Worksheet evaluates it.',
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
              'DMAIC-Phase klären — in Define/Measure läuft noch kein DoE; in Analyze geht es um Screening, in Improve um Optimierung, in Control um EVOP.',
              'Zielsetzung präzisieren — Screening (welche Faktoren?), Wechselwirkungen verstehen, Optimum finden, Robustheit gegen Störgrößen, oder Mischung formulieren.',
              'Faktoren zählen — wenige (≤4) erlauben Vollfaktorielle, viele (>10) erfordern Plackett-Burman.',
              'Stufen pro Faktor festlegen — bei reinen 2-Stufen-Faktoren reicht 2^k, bei mehrstufigen oder kategorialen Faktoren (Material A/B/C, 3 Druckstufen) braucht es den allgemeinen Vollplan.',
              'Robustheitsweg wählen — bei Streuungsreduktion entscheidet die Frage, ob explizite Störgrößen vorliegen (Taguchi-Inner-Outer-Array) oder die Streuung direkt aus Replikaten modelliert werden soll (Streuungs-DoE / Dual-Response).',
              'Faktorgrenzen prüfen — sind sie erweiterbar (CCD rotatable) oder hart durch Sicherheits-/Spezifikationsgrenzen (CCD face-centered)?',
              'Eckpunkte prüfen — sind extreme Kombinationen aller Faktoren physikalisch zulässig (Vollfaktoriell/CCD)? Falls nicht: Box-Behnken oder D-optimal.',
              'Krümmung berücksichtigen — werden quadratische Effekte vermutet, ist DSD oder ein RSM-Design (CCD/Box-Behnken) sinnvoll.',
              'Empfehlung im DoE-Planer umsetzen, Daten ins Worksheet übernehmen, mit Regression/ANOVA auswerten.',
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
              'Clarify the DMAIC phase — Define/Measure carries no DoE yet; Analyze means screening, Improve means optimization, Control means EVOP.',
              'Sharpen the objective — screening (which factors?), understanding interactions, finding the optimum, robustness against noise, or formulating a mixture.',
              'Count factors — few (≤4) allow full factorial; many (>10) call for Plackett-Burman.',
              'Decide on factor levels — pure 2-level factors fit 2^k; multi-level or categorical factors (material A/B/C, 3 pressure levels) need the general full factorial.',
              'Pick the robustness path — for variance reduction, ask whether explicit noise factors are available (Taguchi inner-outer array) or whether dispersion should be modeled directly from replicates (dispersion DoE / dual response).',
              'Check factor limits — are they expandable (CCD rotatable) or hard due to safety/spec limits (CCD face-centered)?',
              'Check corner points — are extreme combinations of all factors physically allowed (full factorial / CCD)? If not: Box-Behnken or D-optimal.',
              'Account for curvature — if quadratic effects are suspected, choose DSD or an RSM design (CCD / Box-Behnken).',
              'Implement the recommendation in the DoE Planner, transfer data to the Worksheet, analyze via regression / ANOVA.',
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
            term: 'Vollplan bei vielen Faktoren',
            content: 'Ein Vollfaktoriell mit 8 Faktoren bedeutet 256 Versuche — selbst bei reichlich Budget zu viel. Ab 5–6 Faktoren immer Teilfaktoriell, Plackett-Burman oder DSD prüfen.',
          },
          {
            type: 'definition',
            term: 'Auflösung ignoriert',
            content: 'Ein 2^(7-3)-Plan ist nicht automatisch eine gute Wahl — die Auflösung (III, IV, V) entscheidet, welche Effekte mit welchen vermengt werden. Auflösung III nur fürs Screening; bei Wechselwirkungen mindestens IV, besser V.',
          },
          {
            type: 'definition',
            term: 'CCD über die Faktorgrenzen hinaus',
            content: 'Beim rotierbaren CCD liegen Sternpunkte AUSSERHALB des ursprünglichen Faktorbereichs (α > 1). Bei harten Grenzen (Druck, Temperatur, Sicherheit) ist das nicht zulässig — dann face-centered (α = 1) wählen.',
          },
          {
            type: 'definition',
            term: 'Box-Behnken bei zu wenigen Faktoren',
            content: 'Box-Behnken benötigt mindestens 3 Faktoren. Mit zwei Faktoren ist es nicht definiert; dann CCD oder Vollfaktoriell mit Zentrumspunkten.',
          },
          {
            type: 'definition',
            term: 'Taguchi statt Wechselwirkungen',
            content: 'Taguchi-Arrays sind primär auf Robustheit (Signal-Rausch) optimiert; Wechselwirkungen sind dort schwer von Haupteffekten zu trennen. Wer Wechselwirkungen verstehen will, nimmt 2^k oder CCD.',
          },
          {
            type: 'definition',
            term: 'Mischung wie unabhängige Faktoren behandelt',
            content: 'In Mischungen summieren sich die Anteile auf 100 %, sodass die Komponenten nicht unabhängig variieren können. Vollfaktoriell oder CCD sind dann mathematisch falsch — es braucht Simplex-Lattice / Simplex-Centroid.',
          },
          {
            type: 'definition',
            term: 'Mehrstufige Faktoren in einen 2^k-Plan gepresst',
            content: 'Kategoriale Faktoren mit drei oder mehr Ausprägungen (Material A/B/C) lassen sich nicht sinnvoll auf "Hoch/Niedrig" reduzieren. Dann den allgemeinen Vollplan nehmen — der Aufwand entspricht dem Produkt der Stufenzahlen.',
          },
          {
            type: 'definition',
            term: 'Streuungs-DoE ohne echte Replikate',
            content: 'Ein Dispersion-Design braucht echte, unabhängige Replikate je Versuchslauf — nur dann ist log(s²) eine valide Antwort. Mehrfachmessungen am selben Lauf (Pseudo-Replikate) erfassen nur die Messunsicherheit, nicht die Prozessstreuung.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Full factorial with too many factors',
            content: 'A full factorial with 8 factors means 256 runs — too much even with a generous budget. From 5–6 factors onward, always consider fractional, Plackett-Burman or DSD.',
          },
          {
            type: 'definition',
            term: 'Resolution ignored',
            content: 'A 2^(7-3) plan is not automatically a good choice — resolution (III, IV, V) decides which effects are aliased with which. Resolution III for screening only; for interactions at least IV, better V.',
          },
          {
            type: 'definition',
            term: 'CCD outside factor limits',
            content: 'In a rotatable CCD the star points lie OUTSIDE the original factor range (α > 1). With hard limits (pressure, temperature, safety) this is not allowed — pick face-centered (α = 1) instead.',
          },
          {
            type: 'definition',
            term: 'Box-Behnken with too few factors',
            content: 'Box-Behnken needs at least 3 factors. It is undefined for two factors; use CCD or a full factorial with center points instead.',
          },
          {
            type: 'definition',
            term: 'Taguchi instead of interactions',
            content: 'Taguchi arrays are primarily optimized for robustness (signal-to-noise); interactions are hard to separate from main effects. To understand interactions, use 2^k or CCD.',
          },
          {
            type: 'definition',
            term: 'Mixtures treated as independent factors',
            content: 'In mixtures the proportions sum to 100 %, so components cannot vary independently. Full factorial or CCD are mathematically wrong — use Simplex-Lattice / Simplex-Centroid.',
          },
          {
            type: 'definition',
            term: 'Multi-level factors squeezed into a 2^k plan',
            content: 'Categorical factors with three or more levels (material A/B/C) cannot be meaningfully reduced to "high/low". Use the general full factorial instead — effort equals the product of the level counts.',
          },
          {
            type: 'definition',
            term: 'Dispersion DoE without true replicates',
            content: 'A dispersion design requires true, independent replicates per run — only then is log(s²) a valid response. Multiple measurements on the same run (pseudo-replicates) capture only measurement uncertainty, not process variability.',
          },
        ],
      },
    },
  },
};
