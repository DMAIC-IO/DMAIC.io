/**
 * D.Mike — GLM Regression Module Handbook (glm-regression-help.js)
 * Bilingual help content (DE/EN) for the GLM regression module.
 */

export default {
  moduleId: 'glm-regression',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Die {{term:regression|Regression}} für attributive Daten erweitert die klassische ({{term:lineare-regression|OLS}}-)Regression um Verfahren für diskrete, kategoriale und Zähldaten. Sobald die Antwortvariable nicht stetig und normalverteilt ist — z. B. „OK/NOK", „Defektanzahl" oder „Reklamationen pro Charge" — liefern {{term:glm|Generalized Linear Models (GLM)}} zuverlässigere Schätzer als OLS.',
          },
          {
            type: 'definition',
            term: 'Binäre logistische Regression',
            content: '{{term:logistische-regression|Binäre logistische Regression}} für eine binäre Antwort (0/1, OK/NOK). Modelliert die Wahrscheinlichkeit P(Y=1|X) über die Logit-Link-Funktion: logit(p) = β₀ + β₁X₁ + … Koeffizienten werden als {{term:odds-ratio|Odds Ratios}} interpretiert.',
          },
          {
            type: 'definition',
            term: 'Poisson-Regression',
            content: '{{term:poisson-regression|Poisson-Regression}} für Zähldaten (0, 1, 2, 3, …). Modelliert den Erwartungswert E(Y|X) = exp(β₀ + β₁X₁ + …). Koeffizienten werden als {{term:rate-ratio|Rate Ratios}} interpretiert. Voraussetzung: {{term:varianz|Varianz}} ≈ {{term:mittelwert|Mittelwert}}.',
          },
          {
            type: 'definition',
            term: 'Negativ-Binomial-Regression',
            content: '{{term:negbin-regression|Negativ-Binomial-Regression}} — wie Poisson, aber für Zähldaten mit {{term:ueberdispersion|Überdispersion}} (Varianz > Mittelwert). Ein zusätzlicher Dispersionsparameter θ fängt die Extra-Streuung auf.',
          },
          {
            type: 'definition',
            term: 'IRLS',
            content: 'Iteratively Reweighted Least Squares — der universelle Algorithmus hinter allen GLM. Reduziert das Problem in jedem Schritt auf gewichtetes OLS, bis die Koeffizienten konvergieren.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'Regression for attributive data extends classical ({{term:lineare-regression|OLS}}) regression with methods for discrete, categorical, and count data. When the response is not continuous and normally distributed — e.g. "pass/fail", "defect count", or "complaints per batch" — {{term:glm|Generalized Linear Models (GLM)}} provide more reliable estimates than OLS.',
          },
          {
            type: 'definition',
            term: 'Binary logistic regression',
            content: '{{term:logistische-regression|Binary logistic regression}} for a binary response (0/1, OK/NOK). Models the probability P(Y=1|X) via the logit link: logit(p) = β₀ + β₁X₁ + … Coefficients are interpreted as {{term:odds-ratio|odds ratios}}.',
          },
          {
            type: 'definition',
            term: 'Poisson regression',
            content: '{{term:poisson-regression|Poisson regression}} for count data (0, 1, 2, 3, …). Models the expected value E(Y|X) = exp(β₀ + β₁X₁ + …). Coefficients are interpreted as {{term:rate-ratio|rate ratios}}. Assumption: {{term:varianz|variance}} ≈ {{term:mittelwert|mean}}.',
          },
          {
            type: 'definition',
            term: 'Negative binomial regression',
            content: '{{term:negbin-regression|Negative binomial regression}} — like Poisson, but for count data with {{term:ueberdispersion|overdispersion}} (variance > mean). An additional dispersion parameter θ captures the extra variability.',
          },
          {
            type: 'definition',
            term: 'IRLS',
            content: 'Iteratively Reweighted Least Squares — the universal algorithm behind all GLMs. It reduces the problem to weighted OLS at each step until the coefficients converge.',
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
            content: 'Die wichtigsten Kenngrößen auf einen Blick:',
          },
          {
            type: 'definition',
            term: 'Odds Ratio (OR)',
            content: '{{term:odds-ratio|Odds Ratio (OR)}} — logistische Regression: OR > 1 bedeutet, dass eine Einheitssteigerung von X die Chance für Y=1 erhöht. OR = 2,5 heißt: Die Chance steigt um den Faktor 2,5. OR < 1 = sinkende Chance. Das Konfidenzintervall darf die 1 nicht enthalten, damit der Effekt signifikant ist.',
          },
          {
            type: 'definition',
            term: 'Rate Ratio (RR)',
            content: '{{term:rate-ratio|Rate Ratio (RR)}} — Poisson/NegBin: RR > 1 bedeutet, dass eine Einheitssteigerung von X die erwartete Anzahl erhöht. RR = 1,3 heißt: 30 % mehr erwartete Ereignisse. Interpretation analog zu OR.',
          },
          {
            type: 'definition',
            term: 'Pseudo-R²',
            content: '{{term:pseudo-r-quadrat|Pseudo-R²}}: GLM haben kein echtes {{term:r-quadrat|R²}}. Stattdessen gibt es Pseudo-R²-Maße (McFadden, Cox-Snell, Nagelkerke), die die Modellverbesserung gegenüber dem Nullmodell quantifizieren. Werte > 0,2 (McFadden) gelten bereits als gute Anpassung.',
          },
          {
            type: 'definition',
            term: 'AUC / ROC',
            content: 'Für logistische Regression: Die Fläche unter der ROC-Kurve (AUC) misst die Trennfähigkeit des Modells. AUC = 0,5 = Zufall, AUC > 0,8 = gut, AUC > 0,9 = exzellent.',
          },
          {
            type: 'definition',
            term: 'Überdispersion',
            content: '{{term:ueberdispersion|Überdispersion}} — bei Poisson-Daten: Wenn Pearson-χ²/df deutlich über 1 liegt (> 1,5), liegt Überdispersion vor. Lösung: Negativ-Binomial-Regression verwenden statt Poisson.',
          },
        ],
      },
      en: {
        title: 'Interpreting results',
        blocks: [
          {
            type: 'paragraph',
            content: 'Key metrics at a glance:',
          },
          {
            type: 'definition',
            term: 'Odds Ratio (OR)',
            content: '{{term:odds-ratio|Odds Ratio (OR)}} — logistic regression: OR > 1 means a unit increase in X raises the odds of Y=1. OR = 2.5 means odds increase by a factor of 2.5. OR < 1 = decreasing odds. The confidence interval must not contain 1 for the effect to be significant.',
          },
          {
            type: 'definition',
            term: 'Rate Ratio (RR)',
            content: '{{term:rate-ratio|Rate Ratio (RR)}} — Poisson/NegBin: RR > 1 means a unit increase in X raises the expected count. RR = 1.3 means 30% more expected events. Interpretation analogous to OR.',
          },
          {
            type: 'definition',
            term: 'Pseudo-R²',
            content: '{{term:pseudo-r-quadrat|Pseudo-R²}}: GLMs have no true {{term:r-quadrat|R²}}. Instead, pseudo-R² measures (McFadden, Cox-Snell, Nagelkerke) quantify model improvement over the null model. Values > 0.2 (McFadden) are already considered a good fit.',
          },
          {
            type: 'definition',
            term: 'AUC / ROC',
            content: 'For logistic regression: the area under the ROC curve (AUC) measures the model\'s discriminatory power. AUC = 0.5 = random, AUC > 0.8 = good, AUC > 0.9 = excellent.',
          },
          {
            type: 'definition',
            term: 'Overdispersion',
            content: '{{term:ueberdispersion|Overdispersion}} — for Poisson data: if Pearson χ²/df is clearly above 1 (> 1.5), overdispersion is present. Solution: use negative binomial regression instead of Poisson.',
          },
        ],
      },
    },
    advanced: {
      de: {
        title: 'Erweiterte Optionen',
        blocks: [
          {
            type: 'paragraph',
            content: 'Das Modul unterstützt mehrere Spezialfälle, die über den Standard-Pfad hinausgehen.',
          },
          {
            type: 'definition',
            term: 'Trials-Spalte (gruppierte Binomial-Regression)',
            content: 'Liegen Daten als Erfolgsanteile pro Gruppe vor (z. B. 12 von 50 Lötstellen defekt = 0,24 bei 50 Trials), dann wählen Sie Y = Anteil und füllen die Spalte „Trials". Das Modul interpretiert Y als Anteil und gewichtet die Likelihood mit den Trial-Counts. Ohne Trials-Spalte ist nur binäres 0/1-Y zulässig.',
          },
          {
            type: 'definition',
            term: 'Erfolgsklasse umkehren',
            content: 'Bei zwei beobachteten Y-Stufen (z. B. „Pass"/„Fail") modelliert das Modul standardmäßig die höhere Stufe als „Erfolg = 1". Im Ergebnis-Header steht die aktuelle Erfolgsklasse mit einem Tausch-Button — ein Klick kehrt die Codierung um und fitter neu. Hilfreich, wenn Odds Ratios in die andere Richtung gelesen werden sollen.',
          },
          {
            type: 'definition',
            term: 'Kategoriale Prädiktoren',
            content: 'Spalten vom Typ „Text" werden automatisch als kategoriale Prädiktoren behandelt. Die alphabetisch erste Stufe wird zur Referenz; jede weitere Stufe bekommt eine Dummy-Variable mit eigenem Koeffizient. Beispiel: Schicht ∈ {A, B, C} → Terme „Intercept", „Schicht[B]", „Schicht[C]"; A ist die Referenz.',
          },
          {
            type: 'definition',
            term: 'Quasi-Poisson (automatisch)',
            content: 'Wenn das Poisson-Modell überdispergiert ist (χ²/df > 1,5), aktiviert das Modul automatisch die Quasi-Likelihood-Skalierung: Standardfehler und Konfidenzintervalle werden um √φ̂ verbreitert. Eine Warnung „Quasi-Poisson aktiv (φ = …)" erscheint im Ergebnis. Punkt-Schätzer der Koeffizienten bleiben unverändert.',
          },
          {
            type: 'definition',
            term: 'θ-Konvergenz bei Negativ-Binomial',
            content: 'Bei nahezu Poisson-verteilten Daten wandert θ → ∞ und die θ-Schätzung ist instabil. Das Modul erkennt das per Vorzeichen-Check der Score-Gleichung und gibt die Warnung „θ-Schätzung nicht konvergiert" aus. Empfehlung: auf Poisson wechseln oder θ manuell fixieren.',
          },
          {
            type: 'definition',
            term: 'Separation-Erkennung',
            content: 'Eine starke Separation (ein Prädiktor trennt die Klassen fast perfekt) wird über kombinierte Kriterien erkannt: |η| pegelt am Clip, IRLS-Gewichte spreizen über 8 Größenordnungen. Die Warnung „Vollständige oder fast-vollständige Separation" empfiehlt, den separierenden Prädiktor zu entfernen oder Klassen zusammenzufassen.',
          },
        ],
      },
      en: {
        title: 'Advanced options',
        blocks: [
          {
            type: 'paragraph',
            content: 'The module supports several specialized cases beyond the standard workflow.',
          },
          {
            type: 'definition',
            term: 'Trials column (grouped binomial regression)',
            content: 'When data come as success proportions per group (e.g. 12 of 50 solder joints defective = 0.24 with 50 trials), select Y = proportion and fill the "Trials" column. The module reads Y as proportion and weights the likelihood by trial counts. Without a trials column, Y must be binary 0/1.',
          },
          {
            type: 'definition',
            term: 'Swap success class',
            content: 'For two observed Y levels (e.g. "Pass"/"Fail") the module defaults to coding the higher level as "success = 1". The result header shows the current success class with a swap button — one click flips the coding and refits. Useful when odds ratios should be read in the other direction.',
          },
          {
            type: 'definition',
            term: 'Categorical predictors',
            content: '"Text"-typed columns are automatically treated as categorical predictors. The alphabetically first level becomes the reference; each additional level gets a dummy variable with its own coefficient. Example: Shift ∈ {A, B, C} → terms "Intercept", "Shift[B]", "Shift[C]"; A is the reference.',
          },
          {
            type: 'definition',
            term: 'Quasi-Poisson (automatic)',
            content: 'When the Poisson model is overdispersed (χ²/df > 1.5), the module automatically activates quasi-likelihood scaling: standard errors and confidence intervals widen by √φ̂. A "Quasi-Poisson active (φ = …)" warning appears in the result. Point estimates of the coefficients are unchanged.',
          },
          {
            type: 'definition',
            term: 'θ convergence for negative binomial',
            content: 'For near-Poisson data, θ → ∞ and the θ estimation is unstable. The module detects this via a sign check on the score equation and emits the warning "θ estimate did not converge". Recommendation: switch to Poisson, or fix θ manually.',
          },
          {
            type: 'definition',
            term: 'Separation detection',
            content: 'Strong separation (a predictor almost perfectly splits the classes) is flagged via combined criteria: |η| pegs at the clip, IRLS weights span > 8 orders of magnitude. The "Complete or quasi-complete separation" warning recommends dropping the separating predictor or merging classes.',
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
            content: 'Szenario: Ein Lötprozess produziert Leiterplatten, die als OK oder NOK klassifiziert werden (binäre Antwort). Die Einflussgrößen sind Löttemperatur (stetig, 220–255 °C) und Anpressdruck (stetig, 2,0–3,5 bar).',
          },
          {
            type: 'list',
            items: [
              'Y = Defekt (0 = OK, 1 = NOK)',
              'X₁ = Temperatur, X₂ = Druck',
              'Verfahren: Binäre logistische Regression',
              'Modell: logit(P(Defekt)) = β₀ + β₁·Temperatur + β₂·Druck',
              'Ergebnis z. B.: OR(Temperatur) = 1,08 → pro °C Temperaturanstieg steigt die Defektchance um 8 %',
            ],
          },
          {
            type: 'paragraph',
            content: 'Im Reiter „Beispieldaten" finden Sie unter „Lötstellen-Inspektion (logistische GLM)" einen ladefertigen Datensatz, um dieses Beispiel direkt auszuprobieren.',
          },
        ],
      },
      en: {
        title: 'Practical example',
        blocks: [
          {
            type: 'paragraph',
            content: 'Scenario: A soldering process produces PCBs classified as OK or NOK (binary response). The predictors are solder temperature (continuous, 220–255 °C) and pressure (continuous, 2.0–3.5 bar).',
          },
          {
            type: 'list',
            items: [
              'Y = Defect (0 = OK, 1 = NOK)',
              'X₁ = Temperature, X₂ = Pressure',
              'Method: Binary logistic regression',
              'Model: logit(P(Defect)) = β₀ + β₁·Temperature + β₂·Pressure',
              'Result e.g.: OR(Temperature) = 1.08 → each °C increase raises defect odds by 8%',
            ],
          },
          {
            type: 'paragraph',
            content: 'In the "Example data" tab you will find "Solder Inspection (logistic GLM)" — a ready-to-load dataset for trying this example directly.',
          },
        ],
      },
    },
    pitfalls: {
      de: {
        title: 'Häufige Fehler',
        blocks: [
          {
            type: 'list',
            items: [
              'OLS auf binäre Daten anwenden: Liefert Wahrscheinlichkeiten außerhalb [0, 1] und falsche p-Werte. Immer logistische Regression verwenden.',
              'Separation ignorieren: Wenn ein Prädiktor Y perfekt trennt, werden die Koeffizienten unendlich groß. Warnung im Modul beachten.',
              'Überdispersion bei Poisson übersehen: Wenn χ²/df > 1,5, sind die Standardfehler zu klein und p-Werte zu optimistisch. Negativ-Binomial verwenden.',
              'Pseudo-R² wie R² interpretieren: Ein McFadden-R² von 0,3 ist bereits ein gutes Modell. Werte nahe 1 sind bei attributiven Daten selten.',
              'Odds Ratios als Risiko-Ratios lesen: OR ≠ RR. Bei seltenen Ereignissen (< 10 %) sind sie ähnlich, sonst nicht.',
            ],
          },
        ],
      },
      en: {
        title: 'Common pitfalls',
        blocks: [
          {
            type: 'list',
            items: [
              'Applying OLS to binary data: yields probabilities outside [0, 1] and invalid p-values. Always use logistic regression.',
              'Ignoring separation: if a predictor perfectly separates Y, coefficients become infinite. Pay attention to the module warning.',
              'Overlooking overdispersion in Poisson: if χ²/df > 1.5, standard errors are too small and p-values too optimistic. Use negative binomial instead.',
              'Interpreting pseudo-R² like R²: a McFadden R² of 0.3 is already a good model. Values near 1 are rare with attributive data.',
              'Reading odds ratios as risk ratios: OR ≠ RR. For rare events (< 10%), they are similar; otherwise, they are not.',
            ],
          },
        ],
      },
    },
  },
};
