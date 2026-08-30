/**
 * DMAIC.io — MSA Type 5 Module Handbook (msa-typ5-help.js)
 * Bilingual help content (DE/EN) for the MSA Type 5 module.
 *
 * Sections (both languages, symmetric):
 *   - goal:     Was macht dieses Modul?
 *   - data:     Datenanforderungen
 *   - formulas: Formeln (Cohen κ, Fleiss κ, Weighted κ, Effektivität + Wilson, SDT)
 *   - verdict:  Bewertung & Ampeln (AIAG MSA 4th Ed. Kap. III-B)
 *
 * Glossar-Marker {{term:slug|Anzeige}} werden zentral von
 * core/glossary-inline.js zu Hover-Chips promoted.
 */

export default {
  moduleId: 'msa-typ5',
  sections: {
    goal: {
      de: {
        title: 'Ziel des Verfahrens',
        blocks: [
          {
            type: 'paragraph',
            content: 'MSA Verfahren 5 (Attribute Measurement System Analysis) prüft Prüfprozesse, die keine stetigen Messwerte liefern, sondern eine <em>kategoriale Entscheidung</em> treffen — binär (i.O./n.i.O.), nominal (Fehlerklassen A/B/C ohne Rangordnung) oder ordinal (Note 1–5, geordnet). Das Modul bewertet {{term:kappa|Kappa}}-basiert, wie zuverlässig und reproduzierbar mehrere Prüfer die Teile derselben Kategorie zuordnen.',
          },
          {
            type: 'definition',
            term: 'Übereinstimmung (Agreement)',
            content: 'Anteil der Bewertungen, bei denen zwei oder mehr Prüfer dieselbe Kategorie vergeben. Roher Agreement-Anteil überschätzt die Zuverlässigkeit, weil er zufällige Übereinstimmungen mitzählt — deshalb korrigieren die {{term:kappa|Kappa}}-Statistiken um den Zufallsanteil.',
          },
          {
            type: 'definition',
            term: 'Wiederholbarkeit',
            content: 'Fähigkeit eines Prüfers, dasselbe Teil bei mehrfacher Bewertung immer wieder in dieselbe Kategorie einzuordnen. Wird als Anteil der (Teil × Prüfer)-Kombinationen berechnet, in denen alle Wiederholungen exakt übereinstimmen.',
          },
          {
            type: 'definition',
            term: 'Effektivität (mit Referenz)',
            content: 'Anteil der Einzel-Bewertungen eines Prüfers, die mit der Referenz übereinstimmen. Braucht rückführbare Referenzurteile — fehlt die Referenz-Spalte, greift der {{term:konsens-fallback|Konsens-Fallback}} und nur die Prüfer-untereinander-Kennzahlen bleiben aussagekräftig.',
          },
          {
            type: 'paragraph',
            content: 'Abgrenzung: MSA Typ 1/2/4 arbeiten mit variablen Messwerten (mm, N, °C) und liefern Cg/Cgk, {{term:gage-rr|Gage R&R}} oder {{term:linearitaet|Linearität}}. Typ 5 dagegen bewertet <em>attributive</em> Prüfprozesse — visuelle Sichtprüfungen, Klassifikationsentscheidungen, Sortierungen — und liefert {{term:kappa|κ}}, {{term:effektivitaet|Effektivität}} sowie — bei binären Merkmalen mit Referenz — {{term:signal-detection|Signal-Detection}}-Kennzahlen.',
          },
        ],
      },
      en: {
        title: 'Purpose of the Study',
        blocks: [
          {
            type: 'paragraph',
            content: 'MSA Type 5 (Attribute Measurement System Analysis) evaluates inspection processes that do not produce continuous readings but a <em>categorical decision</em> — binary (OK/NOK), nominal (defect classes A/B/C without order) or ordinal (grades 1–5, ordered). The module uses {{term:kappa|kappa}}-based statistics to assess how reliably and reproducibly multiple appraisers assign the same category to the same parts.',
          },
          {
            type: 'definition',
            term: 'Agreement',
            content: 'Fraction of ratings where two or more appraisers assign the same category. Raw agreement overstates reliability because it counts chance-level agreement — hence the {{term:kappa|kappa}} statistics correct for the chance component.',
          },
          {
            type: 'definition',
            term: 'Repeatability',
            content: 'Ability of a single appraiser to assign the same part to the same category on repeated ratings. Computed as the fraction of (part × appraiser) combinations in which all replicates match exactly.',
          },
          {
            type: 'definition',
            term: 'Effectiveness (with reference)',
            content: 'Fraction of an appraiser’s individual ratings that agree with the reference. Requires traceable reference calls — without a reference column the {{term:konsens-fallback|consensus fallback}} kicks in and only the between-appraiser metrics remain fully informative.',
          },
          {
            type: 'paragraph',
            content: 'Boundary: MSA Type 1/2/4 handle variable measurements (mm, N, °C) and yield Cg/Cgk, Gage R&R or linearity metrics. Type 5 in contrast evaluates <em>attribute</em> inspection processes — visual checks, classification, sorting — and delivers {{term:kappa|κ}}, {{term:effektivitaet|effectiveness}} and — for binary characteristics with a reference — {{term:signal-detection|signal-detection}} metrics.',
          },
        ],
      },
    },

    data: {
      de: {
        title: 'Datenanforderungen',
        blocks: [
          {
            type: 'list',
            items: [
              'Long/tidy-Format mit drei Pflicht-Spalten: <strong>Teil-ID</strong>, <strong>Prüfer-ID</strong>, <strong>Bewertung</strong>. Jede Zeile ist eine Einzel-Bewertung.',
              'Optionale <strong>Referenz-Spalte</strong> mit dem wahren Kategoriewert je Teil. Fehlt sie, greift der {{term:konsens-fallback|Konsens-Fallback}}.',
              'Optionale <strong>Wiederholungs-Spalte</strong>. Fehlt sie, nummeriert die Engine je (Teil × Prüfer) automatisch von 1 an.',
              'Mindestens 2 unterschiedliche Teile, 2 unterschiedliche Prüfer und 2 vorkommende Bewertungs-Klassen.',
              'Für {{term:wiederholbarkeit|Wiederholbarkeit}}: mindestens 2 Wiederholungen je (Teil × Prüfer) — sonst warnt die Engine mit <code>W_LOW_REP_COUNT</code>.',
              'AIAG-Empfehlung für Freigabestudien: 50 Teile · 3 Prüfer · 3 Wiederholungen, mit ~50 % Grenzfällen im Datensatz.',
            ],
          },
          {
            type: 'definition',
            term: 'Long/tidy statt wide',
            content: 'Nicht eine Spalte je Prüfer/Wiederholung anlegen, sondern vier lange Spalten (Teil, Prüfer, Bewertung, ggf. Wiederholung). Dieses Format ist das einzige, das die Engine verarbeitet, und entspricht dem Vorgehen von Minitab und JMP.',
          },
          {
            type: 'definition',
            term: 'Merkmalstyp',
            content: 'Binär (2 Klassen, positiv zuerst) → Cohen κ + Miss-/False-Alarm-Rate + Signal Detection. Nominal (≥ 3 Klassen, ungeordnet) → Cohen κ + Fleiss κ. Ordinal (geordnete Stufen) → zusätzlich {{term:weighted-kappa|Weighted κ}} (linear oder quadratisch), das kleine Fehlklassifikationen milder gewichtet als große.',
          },
          {
            type: 'definition',
            term: 'Referenz vs. Konsens',
            content: 'Rückführbare Referenzurteile (Experten-Set, Master-Sample) liefern die belastbarste {{term:effektivitaet|Effektivität}}. Ohne Referenz leitet der {{term:konsens-fallback|Konsens-Fallback}} je Teil ein Mehrheitsvotum ab; bei Gleichstand landet das Teil in <code>meta.ambiguousParts</code> und wird aus allen Vs-Referenz-Kennzahlen ausgeschlossen. κ unter Prüfern bleibt davon unberührt.',
          },
        ],
      },
      en: {
        title: 'Data Requirements',
        blocks: [
          {
            type: 'list',
            items: [
              'Long/tidy layout with three required columns: <strong>Part ID</strong>, <strong>Appraiser ID</strong>, <strong>Rating</strong>. Each row is one individual rating.',
              'Optional <strong>reference column</strong> with the true category for each part. If missing, the {{term:konsens-fallback|consensus fallback}} kicks in.',
              'Optional <strong>replicate column</strong>. If missing, the engine auto-numbers replicates per (part × appraiser) starting at 1.',
              'At least 2 distinct parts, 2 distinct appraisers and 2 distinct rating classes present in the data.',
              'For repeatability: at least 2 replicates per (part × appraiser) — otherwise the engine emits <code>W_LOW_REP_COUNT</code>.',
              'AIAG recommendation for release studies: 50 parts · 3 appraisers · 3 replicates, with roughly 50 % borderline parts in the sample.',
            ],
          },
          {
            type: 'definition',
            term: 'Long/tidy layout instead of wide',
            content: 'Do not create one column per appraiser/replicate. Instead use four long columns (part, appraiser, rating, optionally replicate). This is the only layout the engine accepts and matches how Minitab and JMP handle Type 5 data.',
          },
          {
            type: 'definition',
            term: 'Characteristic type',
            content: 'Binary (2 classes, positive first) → Cohen κ + miss/false-alarm rate + signal detection. Nominal (≥ 3 classes, unordered) → Cohen κ + Fleiss κ. Ordinal (ordered grades) → additionally {{term:weighted-kappa|weighted κ}} (linear or quadratic) so that small misclassifications weigh less than large ones.',
          },
          {
            type: 'definition',
            term: 'Reference vs. consensus',
            content: 'Traceable reference calls (expert set, master sample) give the most reliable {{term:effektivitaet|effectiveness}}. Without a reference the {{term:konsens-fallback|consensus fallback}} derives a majority vote per part; ties push the part into <code>meta.ambiguousParts</code> and exclude it from all vs-reference metrics. κ between appraisers is not affected.',
          },
        ],
      },
    },

    formulas: {
      de: {
        title: 'Formeln',
        blocks: [
          {
            type: 'paragraph',
            content: 'Kern von Typ 5 sind die {{term:kappa|Kappa}}-Statistiken. Sie messen den Anteil der Übereinstimmung, der über die zufällige hinausgeht — von 1 (perfekt) über 0 (Zufallsniveau) bis negativ (systematische Uneinigkeit).',
          },
          {
            type: 'heading',
            content: 'Cohen κ (zwei Prüfer)',
          },
          {
            type: 'definition',
            term: 'Beobachtete Übereinstimmung',
            content: 'p<sub>o</sub> = Σ<sub>i</sub> n<sub>ii</sub> / N — Diagonalsumme der {{term:kontingenztafel|Kreuztabelle}} geteilt durch Gesamtzahl der Bewertungspaare.',
          },
          {
            type: 'definition',
            term: 'Zufällige Übereinstimmung',
            content: 'p<sub>e</sub> = Σ<sub>i</sub> (n<sub>i·</sub> · n<sub>·i</sub>) / N² — erwartete Übereinstimmung aus den Randverteilungen der beiden Prüfer.',
          },
          {
            type: 'definition',
            term: '{{term:cohen-kappa|Cohen κ}}',
            content: 'κ = (p<sub>o</sub> − p<sub>e</sub>) / (1 − p<sub>e</sub>). SE(κ) nach Fleiss/Cohen/Everitt (1969); 95 %-KI = κ ± z<sub>1−α/2</sub> · SE(κ).',
          },
          {
            type: 'heading',
            content: 'Fleiss κ (≥ 2 Prüfer)',
          },
          {
            type: 'definition',
            term: '{{term:fleiss-kappa|Fleiss κ}}',
            content: 'P<sub>i</sub> = (Σ<sub>j</sub> n<sub>ij</sub>² − n<sub>i·</sub>) / (n<sub>i·</sub>(n<sub>i·</sub> − 1)) je Teil i, P̄ = {{term:mittelwert|Mittelwert}}. p̄<sub>j</sub> = Klassen-Randanteil. κ = (P̄ − P<sub>e</sub>) / (1 − P<sub>e</sub>) mit P<sub>e</sub> = Σ<sub>j</sub> p̄<sub>j</sub>². Bei ungleichen Rater-Zahlen wechselt die Engine auf die Randolph-Variante und vermerkt dies im Feld <code>method</code>.',
          },
          {
            type: 'heading',
            content: 'Weighted κ (ordinal)',
          },
          {
            type: 'definition',
            term: '{{term:weighted-kappa|Weighted κ}}',
            content: 'Gewichts-Matrix W: linear w<sub>ij</sub> = 1 − |i − j|/(k − 1) oder quadratisch w<sub>ij</sub> = 1 − ((i − j)/(k − 1))². Damit werden nahe Fehlklassifikationen (Note 3 ⟷ 4) milder gestraft als weite (1 ⟷ 5). κ<sub>w</sub> = (p<sub>o</sub><sup>w</sup> − p<sub>e</sub><sup>w</sup>) / (1 − p<sub>e</sub><sup>w</sup>).',
          },
          {
            type: 'heading',
            content: 'Effektivität + Wilson-Score-KI',
          },
          {
            type: 'definition',
            term: '{{term:effektivitaet|Effektivität}}',
            content: 'eff = #{(Teil, Wdh) mit Bewertung = Referenz} / #{(Teil, Wdh) : Teil ∉ ambig}. Anteil der Einzel-Bewertungen, die mit der Referenz übereinstimmen — je Prüfer.',
          },
          {
            type: 'definition',
            term: '{{term:wilson-konfidenzintervall|Wilson-Score-KI}}',
            content: 'Für einen Anteil p̂ = x/n gilt (p̂ + z²/(2n) ± z·√(p̂(1−p̂)/n + z²/(4n²))) / (1 + z²/n). Bessere Abdeckung bei kleinen n und Anteilen nahe 0 oder 1 als das Wald-KI.',
          },
          {
            type: 'heading',
            content: 'Miss-Rate, False-Alarm-Rate, Bias (nur binär mit Referenz)',
          },
          {
            type: 'definition',
            term: '{{term:miss-rate|Miss-Rate}}',
            content: 'miss = P(Bewertung = positiv | Referenz = negativ). Falsche Annahme — ein tatsächlich n.i.O.-Teil wurde als i.O. eingestuft.',
          },
          {
            type: 'definition',
            term: '{{term:false-alarm-rate|False-Alarm-Rate}}',
            content: 'fa = P(Bewertung = negativ | Referenz = positiv). Falscher Alarm — ein tatsächlich i.O.-Teil wurde als n.i.O. eingestuft.',
          },
          {
            type: 'definition',
            term: 'Bias-Rate',
            content: 'bias = miss − fa. Größer 0: der Prüfer ist zu tolerant; kleiner 0: zu streng.',
          },
          {
            type: 'heading',
            content: 'Signal Detection (nur binär mit Referenz)',
          },
          {
            type: 'definition',
            term: '{{term:d-prime|d′}} (Sensitivität)',
            content: 'd′ = z(hit) − z(fa) mit hit = P(Bewertung=pos | Referenz=pos) und fa wie oben. Trennschärfe des Prüfers zwischen i.O. und n.i.O.; höher = besser.',
          },
          {
            type: 'definition',
            term: '{{term:criterion-c|Kriterium c}} (Entscheidungsschwelle)',
            content: 'c = −½ · (z(hit) + z(fa)). c > 0: Prüfer ist konservativ (neigt zu „n.i.O."), c < 0: liberal (neigt zu „i.O."). c ≈ 0: neutrale Schwelle.',
          },
          {
            type: 'paragraph',
            content: 'Randkorrektur nach Hautus (1995): bei hit ∈ {0, 1} oder fa ∈ {0, 1} wird ± 0,5/N adjustiert (Log-Linear-Korrektur), damit z(·) nicht ins Unendliche läuft.',
          },
        ],
      },
      en: {
        title: 'Formulas',
        blocks: [
          {
            type: 'paragraph',
            content: 'The core of Type 5 are the {{term:kappa|kappa}} statistics. They measure the share of agreement that exceeds chance — from 1 (perfect) through 0 (chance level) to negative (systematic disagreement).',
          },
          {
            type: 'heading',
            content: 'Cohen κ (two appraisers)',
          },
          {
            type: 'definition',
            term: 'Observed agreement',
            content: 'p<sub>o</sub> = Σ<sub>i</sub> n<sub>ii</sub> / N — diagonal sum of the cross tab divided by the total number of rating pairs.',
          },
          {
            type: 'definition',
            term: 'Chance agreement',
            content: 'p<sub>e</sub> = Σ<sub>i</sub> (n<sub>i·</sub> · n<sub>·i</sub>) / N² — expected agreement from the marginal distributions of both appraisers.',
          },
          {
            type: 'definition',
            term: '{{term:cohen-kappa|Cohen κ}}',
            content: 'κ = (p<sub>o</sub> − p<sub>e</sub>) / (1 − p<sub>e</sub>). SE(κ) after Fleiss/Cohen/Everitt (1969); 95 % CI = κ ± z<sub>1−α/2</sub> · SE(κ).',
          },
          {
            type: 'heading',
            content: 'Fleiss κ (≥ 2 appraisers)',
          },
          {
            type: 'definition',
            term: '{{term:fleiss-kappa|Fleiss κ}}',
            content: 'P<sub>i</sub> = (Σ<sub>j</sub> n<sub>ij</sub>² − n<sub>i·</sub>) / (n<sub>i·</sub>(n<sub>i·</sub> − 1)) per part i, P̄ = mean. p̄<sub>j</sub> = class marginal. κ = (P̄ − P<sub>e</sub>) / (1 − P<sub>e</sub>) with P<sub>e</sub> = Σ<sub>j</sub> p̄<sub>j</sub>². Under unbalanced rater counts the engine switches to the Randolph variant and records this in the <code>method</code> field.',
          },
          {
            type: 'heading',
            content: 'Weighted κ (ordinal)',
          },
          {
            type: 'definition',
            term: '{{term:weighted-kappa|Weighted κ}}',
            content: 'Weight matrix W: linear w<sub>ij</sub> = 1 − |i − j|/(k − 1) or quadratic w<sub>ij</sub> = 1 − ((i − j)/(k − 1))². Near misclassifications (grade 3 ⟷ 4) are penalised more mildly than distant ones (1 ⟷ 5). κ<sub>w</sub> = (p<sub>o</sub><sup>w</sup> − p<sub>e</sub><sup>w</sup>) / (1 − p<sub>e</sub><sup>w</sup>).',
          },
          {
            type: 'heading',
            content: 'Effectiveness + Wilson score CI',
          },
          {
            type: 'definition',
            term: '{{term:effektivitaet|Effectiveness}}',
            content: 'eff = #{(part, rep) with rating = reference} / #{(part, rep) : part ∉ ambiguous}. Fraction of individual ratings that agree with the reference — per appraiser.',
          },
          {
            type: 'definition',
            term: '{{term:wilson-konfidenzintervall|Wilson score CI}}',
            content: 'For a proportion p̂ = x/n: (p̂ + z²/(2n) ± z·√(p̂(1−p̂)/n + z²/(4n²))) / (1 + z²/n). Better coverage than the Wald interval for small n and proportions near 0 or 1.',
          },
          {
            type: 'heading',
            content: 'Miss rate, false-alarm rate, bias (binary with reference only)',
          },
          {
            type: 'definition',
            term: '{{term:miss-rate|Miss rate}}',
            content: 'miss = P(rating = positive | reference = negative). Escape — a truly NOK part was rated OK.',
          },
          {
            type: 'definition',
            term: '{{term:false-alarm-rate|False-alarm rate}}',
            content: 'fa = P(rating = negative | reference = positive). False alarm — a truly OK part was rated NOK.',
          },
          {
            type: 'definition',
            term: 'Bias rate',
            content: 'bias = miss − fa. Greater than 0: the appraiser is too lenient; less than 0: too strict.',
          },
          {
            type: 'heading',
            content: 'Signal detection (binary with reference only)',
          },
          {
            type: 'definition',
            term: '{{term:d-prime|d′}} (sensitivity)',
            content: 'd′ = z(hit) − z(fa) with hit = P(rating=pos | reference=pos) and fa as above. Discrimination between OK and NOK; higher = better.',
          },
          {
            type: 'definition',
            term: '{{term:criterion-c|Criterion c}} (decision threshold)',
            content: 'c = −½ · (z(hit) + z(fa)). c > 0: appraiser is conservative (tends to "NOK"), c < 0: liberal (tends to "OK"). c ≈ 0: neutral threshold.',
          },
          {
            type: 'paragraph',
            content: 'Hautus (1995) edge correction: at hit ∈ {0, 1} or fa ∈ {0, 1} the values are adjusted by ± 0.5/N (log-linear correction) so that z(·) does not diverge.',
          },
        ],
      },
    },

    verdict: {
      de: {
        title: 'Bewertung & Ampeln',
        blocks: [
          {
            type: 'paragraph',
            content: 'Die Gesamt-Ampel folgt AIAG MSA 4th Ed. Kap. III-B. Sie kombiniert die {{term:fleiss-kappa|Fleiss-κ}}-Bedingung (Prüfer-untereinander) mit der {{term:effektivitaet|Effektivitäts}}-Bedingung (jeder Prüfer vs. Referenz). Ohne Referenz greift nur die κ-Bedingung.',
          },
          {
            type: 'definition',
            term: 'Grün — freigegeben',
            content: 'Fleiss κ ≥ 0,75 <strong>und</strong> alle Effektivitäten ≥ 0,90. Das Prüfsystem misst reproduzierbar und trifft die Referenz zuverlässig.',
          },
          {
            type: 'definition',
            term: 'Gelb — bedingt tauglich',
            content: 'Weder grüne noch rote Bedingung erfüllt. Das Prüfsystem ist einsetzbar, aber die Ursache (welcher Prüfer, welche Klassen?) sollte vor einer Serien-Freigabe geklärt werden.',
          },
          {
            type: 'definition',
            term: 'Rot — nicht tauglich',
            content: 'Fleiss κ &lt; 0,40 <strong>oder</strong> mindestens eine Effektivität &lt; 0,80. Das Prüfsystem ist nicht freigebbar — Schulung, Prüfanweisung überarbeiten oder Grenzmuster ergänzen.',
          },
          {
            type: 'definition',
            term: 'Ambige Teile ohne Referenz',
            content: 'Wenn der {{term:konsens-fallback|Konsens-Fallback}} für ein Teil kein Mehrheitsvotum findet (Gleichstand bei binär/nominal, kein eindeutiger Median bei ordinal), landet das Teil in <code>meta.ambiguousParts</code> und wird nur aus Effektivität, Miss-/False-Alarm und {{term:signal-detection|SDT}} ausgeschlossen. Kappa unter Prüfern bleibt erhalten.',
          },
          {
            type: 'definition',
            term: 'Interpretation-Textbaustein',
            content: 'Der Interpretations-Absatz benennt zusätzlich den Ampelfarben-<em>Treiber</em> (Fleiss κ, Effektivität, Miss-Rate oder False-Alarm-Rate) sowie ggf. die Warnungen <code>W_UNBALANCED_REPS</code>, <code>W_AMBIGUOUS_CONSENSUS</code> und <code>W_LOW_REP_COUNT</code>.',
          },
        ],
      },
      en: {
        title: 'Verdict & Traffic Lights',
        blocks: [
          {
            type: 'paragraph',
            content: 'The overall verdict follows AIAG MSA 4th Ed. Ch. III-B. It combines the {{term:fleiss-kappa|Fleiss κ}} condition (between-appraiser) with the {{term:effektivitaet|effectiveness}} condition (each appraiser vs. reference). Without a reference only the κ condition applies.',
          },
          {
            type: 'definition',
            term: 'Green — release',
            content: 'Fleiss κ ≥ 0.75 <strong>and</strong> all effectiveness ≥ 0.90. The inspection system is reproducible and reliably hits the reference.',
          },
          {
            type: 'definition',
            term: 'Yellow — conditionally usable',
            content: 'Neither the green nor the red condition met. The system may be used, but the {{term:ursachenanalyse|root cause}} (which appraiser, which classes?) should be understood before a series release.',
          },
          {
            type: 'definition',
            term: 'Red — not usable',
            content: 'Fleiss κ &lt; 0.40 <strong>or</strong> at least one effectiveness &lt; 0.80. Do not release — retrain appraisers, update the inspection instruction or add borderline reference samples.',
          },
          {
            type: 'definition',
            term: 'Ambiguous parts without reference',
            content: 'When the {{term:konsens-fallback|consensus fallback}} finds no majority vote for a part (tie for binary/nominal, no unique median for ordinal), the part lands in <code>meta.ambiguousParts</code> and is excluded only from effectiveness, miss/false-alarm and {{term:signal-detection|SDT}}. Kappa between appraisers is retained.',
          },
          {
            type: 'definition',
            term: 'Interpretation text',
            content: 'The interpretation paragraph additionally names the traffic-light <em>driver</em> (Fleiss κ, effectiveness, miss rate or false-alarm rate) and, where applicable, the warnings <code>W_UNBALANCED_REPS</code>, <code>W_AMBIGUOUS_CONSENSUS</code> and <code>W_LOW_REP_COUNT</code>.',
          },
        ],
      },
    },
  },
};
