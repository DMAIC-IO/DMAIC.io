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
            content: 'Der DoE-Berater hilft, das passende Versuchsdesign für ein Six-Sigma-Projekt zu finden. Die Wahl des richtigen {{term:doe|DoE}}-Designs entscheidet darüber, ob aus einer begrenzten Anzahl Versuche belastbare Erkenntnisse über {{term:haupteffekt|Haupteffekte}}, {{term:wechselwirkung|Wechselwirkungen}} und Optima entstehen — oder Aufwand verpufft.',
          },
          {
            type: 'definition',
            term: 'Übersicht',
            content: 'Tabellarische Gegenüberstellung aller im Six-Sigma-Alltag relevanten Designs ({{term:vollfaktoriell|Vollfaktoriell}} 2^k, Vollfaktoriell allgemein, {{term:teilfaktoriell|Teilfaktoriell}}, {{term:plackett-burman|Plackett-Burman}}, {{term:dsd|Definitive Screening Design}}, {{term:ccd|CCD}} rotatable und face-centered, {{term:box-behnken|Box-Behnken}}, {{term:taguchi|Taguchi}}, {{term:streuungs-doe|Streuungs-DoE}}, {{term:mischungsplan|Mischungspläne}}, {{term:d-optimal|D-optimal}}, {{term:evop|EVOP}}) mit Faktorbereich, Stufenzahl, Aufwand und Hauptvorteil.',
          },
          {
            type: 'definition',
            term: 'Berater',
            content: 'Geführter Frage-Wizard. Aus DMAIC-Phase, Zielsetzung und Randbedingungen (Faktorgrenzen, erlaubte Eckpunkte, Krümmung, Mischungen, Robustheit) leitet er eine konkrete Designempfehlung mit Begründung ab.',
          },
          {
            type: 'definition',
            term: 'CCD-Vergleich',
            content: 'Direkter Vergleich der beiden gebräuchlichsten {{term:response-surface|Response-Surface}}-Designs: {{term:ccd|CCD}} rotatable (CCC) gegen face-centered (CCF) — Sternpunktlage, α-Wert, Stufenzahl, Rotierbarkeit, Einsatzfälle.',
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
            content: 'The DoE Advisor helps you choose the right {{term:doe|experimental design}} for a Six Sigma project. The choice of design decides whether a limited number of runs yields robust insight into {{term:haupteffekt|main effects}}, {{term:wechselwirkung|interactions}} and optima — or whether effort is wasted.',
          },
          {
            type: 'definition',
            term: 'Overview',
            content: 'Side-by-side table of all designs relevant in everyday Six Sigma ({{term:vollfaktoriell|full factorial}} 2^k, general full factorial, {{term:teilfaktoriell|fractional}}, {{term:plackett-burman|Plackett-Burman}}, {{term:dsd|Definitive Screening Design}}, {{term:ccd|CCD}} rotatable and face-centered, {{term:box-behnken|Box-Behnken}}, {{term:taguchi|Taguchi}}, {{term:streuungs-doe|dispersion DoE}}, {{term:mischungsplan|mixture designs}}, {{term:d-optimal|D-optimal}}, {{term:evop|EVOP}}) with factor range, levels, effort and key advantage.',
          },
          {
            type: 'definition',
            term: 'Advisor',
            content: 'Guided question wizard. From DMAIC phase, objective and constraints (factor limits, allowed corner points, curvature, mixtures, robustness) it derives a concrete design recommendation with reasoning.',
          },
          {
            type: 'definition',
            term: 'CCD comparison',
            content: 'Direct comparison of the two most common {{term:response-surface|response-surface}} designs: {{term:ccd|CCD}} rotatable (CCC) versus face-centered (CCF) — star point location, α value, number of levels, rotatability, typical applications.',
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
              'DMAIC-Phase klären — in Define/Measure läuft noch kein DoE; in Analyze geht es um {{term:screening-design|Screening}}, in Improve um Optimierung, in Control um {{term:evop|EVOP}}.',
              'Zielsetzung präzisieren — Screening (welche Faktoren?), Wechselwirkungen verstehen, Optimum finden, Robustheit gegen Störgrößen, oder {{term:mischungsplan|Mischung}} formulieren.',
              '{{term:faktor|Faktoren}} zählen — wenige (≤4) erlauben Vollfaktorielle, viele (>10) erfordern Plackett-Burman.',
              '{{term:stufe|Stufen}} pro Faktor festlegen — bei reinen 2-Stufen-Faktoren reicht 2^k, bei mehrstufigen oder kategorialen Faktoren (Material A/B/C, 3 Druckstufen) braucht es den allgemeinen Vollplan.',
              'Robustheitsweg wählen — bei Streuungsreduktion entscheidet die Frage, ob explizite Störgrößen vorliegen ({{term:taguchi|Taguchi}}-Inner-Outer-Array) oder die Streuung direkt aus Replikaten modelliert werden soll ({{term:streuungs-doe|Streuungs-DoE / Dual-Response}}).',
              'Faktorgrenzen prüfen — sind sie erweiterbar ({{term:ccd|CCD rotatable}}) oder hart durch Sicherheits-/Spezifikationsgrenzen (CCD face-centered)?',
              'Eckpunkte prüfen — sind extreme Kombinationen aller Faktoren physikalisch zulässig ({{term:vollfaktoriell|Vollfaktoriell}}/CCD)? Falls nicht: {{term:box-behnken|Box-Behnken}} oder {{term:d-optimal|D-optimal}}.',
              'Krümmung berücksichtigen — werden quadratische Effekte vermutet, ist {{term:dsd|DSD}} oder ein {{term:response-surface|RSM}}-Design (CCD/Box-Behnken) sinnvoll.',
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
              'Clarify the DMAIC phase — Define/Measure carries no DoE yet; Analyze means {{term:screening-design|screening}}, Improve means optimization, Control means {{term:evop|EVOP}}.',
              'Sharpen the objective — screening (which factors?), understanding interactions, finding the optimum, robustness against noise, or formulating a {{term:mischungsplan|mixture}}.',
              'Count {{term:faktor|factors}} — few (≤4) allow full factorial; many (>10) call for Plackett-Burman.',
              'Decide on {{term:stufe|factor levels}} — pure 2-level factors fit 2^k; multi-level or categorical factors (material A/B/C, 3 pressure levels) need the general full factorial.',
              'Pick the robustness path — for variance reduction, ask whether explicit noise factors are available ({{term:taguchi|Taguchi}} inner-outer array) or whether dispersion should be modeled directly from replicates ({{term:streuungs-doe|dispersion DoE / dual response}}).',
              'Check factor limits — are they expandable ({{term:ccd|CCD rotatable}}) or hard due to safety/spec limits (CCD face-centered)?',
              'Check corner points — are extreme combinations of all factors physically allowed ({{term:vollfaktoriell|full factorial}} / CCD)? If not: {{term:box-behnken|Box-Behnken}} or {{term:d-optimal|D-optimal}}.',
              'Account for curvature — if quadratic effects are suspected, choose {{term:dsd|DSD}} or an {{term:response-surface|RSM}} design (CCD / Box-Behnken).',
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
            content: 'Ein 2^(7-3)-Plan ist nicht automatisch eine gute Wahl — die {{term:aufloesung|Auflösung}} (III, IV, V) entscheidet, welche Effekte {{term:konfundierung|mit welchen vermengt}} werden. Auflösung III nur fürs {{term:screening-design|Screening}}; bei Wechselwirkungen mindestens IV, besser V.',
          },
          {
            type: 'definition',
            term: 'CCD über die Faktorgrenzen hinaus',
            content: 'Beim rotierbaren {{term:ccd|CCD}} liegen Sternpunkte AUSSERHALB des ursprünglichen Faktorbereichs (α > 1). Bei harten Grenzen (Druck, Temperatur, Sicherheit) ist das nicht zulässig — dann face-centered (α = 1) wählen.',
          },
          {
            type: 'definition',
            term: 'Box-Behnken bei zu wenigen Faktoren',
            content: '{{term:box-behnken|Box-Behnken}} benötigt mindestens 3 Faktoren. Mit zwei Faktoren ist es nicht definiert; dann CCD oder Vollfaktoriell mit Zentrumspunkten.',
          },
          {
            type: 'definition',
            term: 'Taguchi statt Wechselwirkungen',
            content: '{{term:taguchi|Taguchi}}-Arrays sind primär auf Robustheit (Signal-Rausch) optimiert; Wechselwirkungen sind dort schwer von Haupteffekten zu trennen. Wer Wechselwirkungen verstehen will, nimmt 2^k oder CCD.',
          },
          {
            type: 'definition',
            term: 'Mischung wie unabhängige Faktoren behandelt',
            content: 'In {{term:mischungsplan|Mischungen}} summieren sich die Anteile auf 100 %, sodass die Komponenten nicht unabhängig variieren können. Vollfaktoriell oder CCD sind dann mathematisch falsch — es braucht Simplex-Lattice / Simplex-Centroid.',
          },
          {
            type: 'definition',
            term: 'Mehrstufige Faktoren in einen 2^k-Plan gepresst',
            content: 'Kategoriale Faktoren mit drei oder mehr Ausprägungen (Material A/B/C) lassen sich nicht sinnvoll auf "Hoch/Niedrig" reduzieren. Dann den allgemeinen Vollplan nehmen — der Aufwand entspricht dem Produkt der Stufenzahlen.',
          },
          {
            type: 'definition',
            term: 'Streuungs-DoE ohne echte Replikate',
            content: 'Ein Dispersion-Design braucht echte, unabhängige {{term:replikat|Replikate}} je Versuchslauf — nur dann ist log(s²) eine valide Antwort. Mehrfachmessungen am selben Lauf (Pseudo-Replikate) erfassen nur die Messunsicherheit, nicht die Prozessstreuung.',
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
            content: 'In a rotatable {{term:ccd|CCD}} the star points lie OUTSIDE the original factor range (α > 1). With hard limits (pressure, temperature, safety) this is not allowed — pick face-centered (α = 1) instead.',
          },
          {
            type: 'definition',
            term: 'Box-Behnken with too few factors',
            content: '{{term:box-behnken|Box-Behnken}} needs at least 3 factors. It is undefined for two factors; use CCD or a full factorial with center points instead.',
          },
          {
            type: 'definition',
            term: 'Taguchi instead of interactions',
            content: '{{term:taguchi|Taguchi}} arrays are primarily optimized for robustness (signal-to-noise); interactions are hard to separate from main effects. To understand interactions, use 2^k or CCD.',
          },
          {
            type: 'definition',
            term: 'Mixtures treated as independent factors',
            content: 'In {{term:mischungsplan|mixtures}} the proportions sum to 100 %, so components cannot vary independently. Full factorial or CCD are mathematically wrong — use Simplex-Lattice / Simplex-Centroid.',
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
