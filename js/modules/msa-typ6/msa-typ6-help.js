/**
 * DMAIC.io — MSA Type 6 Module Handbook (msa-typ6-help.js)
 * Bilingual help content (DE/EN) for the MSA Type 6 module.
 *
 * Sections (both languages, symmetric):
 *   - goal:           Was ist eine Stabilitäts-Studie, welche Frage beantwortet sie?
 *   - prerequisites:  Referenzteil, Mindest-Zeitpunkte, konstante Bedingungen.
 *   - parameters:     Kartentyp, Grenzen-Modus, Nelson-Regeln, α.
 *   - verdict:        Ampel-Regeln (stabil/marginal/instabil).
 *   - interpretation: Handlungsempfehlungen bei Drift vs. Nelson-Verletzung.
 *   - examples:       Verweis auf die vier Beispieldatensätze.
 *
 * Glossar-Marker {{term:slug|Anzeige}} werden zentral von
 * core/glossary-inline.js zu Hover-Chips promoted.
 *
 * Spec: docs/superpowers/specs/2026-07-16-msa-typ6-design.md
 */

export default {
  moduleId: 'msa-typ6',
  sections: {
    goal: {
      de: {
        title: 'Ziel des Verfahrens',
        blocks: [
          {
            type: 'paragraph',
            content: 'MSA Verfahren 6 prüft die <em>Stabilität eines Messsystems über die Zeit</em>. Anders als Typ 1 (ein Zeitpunkt, viele Wiederholungen) misst eine {{term:stabilitaets-studie|Stabilitäts-Studie}} regelmäßig — täglich, wöchentlich, monatlich — dasselbe {{term:referenzteil|Referenzteil}} und zieht die Werte über Wochen oder Monate zu einer {{term:regelkarte|Regelkarte}} zusammen. Die Frage lautet nicht „Wie präzise misst das System heute?", sondern „Verändert sich das System schleichend oder sprunghaft?"',
          },
          {
            type: 'definition',
            term: 'Referenzteil-Konzept',
            content: 'Ein {{term:referenzteil|Referenzteil}} ist ein Normal oder Master-Sample mit einem stabilen, bekannten oder zumindest reproduzierbaren wahren Wert. Wird es über Monate hinweg immer wieder mit demselben Prüfmittel gemessen, zeigt jede Veränderung in der Messreihe eine Veränderung des Messsystems — Verschleiß, Rekalibrierung, Temperaturdrift, Bediener-Wechsel — und nicht eine Veränderung des Teils.',
          },
          {
            type: 'paragraph',
            content: 'Das Modul zieht je nach Datenlage eine {{term:i-mr-chart|I-MR-Karte}} (ein Wert je Zeitpunkt) oder eine {{term:xbar-r-chart|x̄-R-Karte}} (mehrere Wiederholungen je Zeitpunkt, zu Untergruppen zusammengefasst) und wertet zwei unabhängige Signale aus: {{term:nelson-regeln|Nelson-Regeln}} 1–8 auf Muster-Verletzungen innerhalb der Karte, und einen linearen {{term:drift-test|Drift-Test}} auf einen systematischen Trend über die gesamte Studiendauer.',
          },
          {
            type: 'paragraph',
            content: 'Abgrenzung: MSA Typ 1 prüft Wiederholpräzision und Bias an <em>einem</em> Zeitpunkt (Cg/Cgk). Typ 2 prüft Wiederhol- und Vergleichspräzision mit Bediener-Einfluss ({{term:gage-rr|Gage R&R}}). Typ 4 prüft {{term:linearitaet|Linearität}} über den Messbereich. Typ 5 prüft attributive Prüfprozesse (Kappa). Typ 6 dagegen prüft <em>ein</em> Referenzteil über <em>viele Zeitpunkte</em> — die einzige der sechs MSA-Studien, die eine echte Zeitachse hat.',
          },
        ],
      },
      en: {
        title: 'Purpose of the Study',
        blocks: [
          {
            type: 'paragraph',
            content: 'MSA Type 6 assesses the <em>stability of a measurement system over time</em>. Unlike Type 1 (one point in time, many replicates), a {{term:stabilitaets-studie|stability study}} measures the same {{term:referenzteil|reference part}} at regular intervals — daily, weekly, monthly — and combines the readings across weeks or months into a {{term:regelkarte|control chart}}. The question is not "how precise is the system today?" but "is the system drifting gradually or shifting abruptly?"',
          },
          {
            type: 'definition',
            term: 'Reference part concept',
            content: 'A {{term:referenzteil|reference part}} is a master sample with a stable, known — or at least reproducible — true value. Measured repeatedly with the same gage over months, any change in the reading series reflects a change in the measurement system — wear, recalibration, thermal drift, operator change — not a change in the part itself.',
          },
          {
            type: 'paragraph',
            content: 'Depending on the data layout, the module draws an {{term:i-mr-chart|I-MR chart}} (one reading per time point) or an {{term:xbar-r-chart|x̄-R chart}} (several replicates per time point, combined into subgroups) and evaluates two independent signals: {{term:nelson-regeln|Nelson rules}} 1–8 for pattern violations within the chart, and a linear {{term:drift-test|drift test}} for a systematic trend across the whole study duration.',
          },
          {
            type: 'paragraph',
            content: 'Boundary: MSA Type 1 checks repeatability and bias at <em>one</em> point in time (Cg/Cgk). Type 2 checks repeatability and reproducibility with operator effects (Gage R&R). Type 4 checks linearity across the measurement range. Type 5 checks attribute inspection processes (kappa). Type 6, in contrast, tracks <em>one</em> reference part across <em>many time points</em> — the only one of the six MSA studies with a genuine time axis.',
          },
        ],
      },
    },

    prerequisites: {
      de: {
        title: 'Voraussetzungen',
        blocks: [
          {
            type: 'list',
            items: [
              'Genau ein {{term:referenzteil|Referenzteil}} (Normal, Master-Sample) mit stabilem, reproduzierbarem Merkmal — dasselbe physische Teil wird bei jedem Messzeitpunkt erneut gemessen.',
              'Mindestens 10 Messzeitpunkte bei I-MR (einzeln), mindestens 5 Untergruppen bei x̄-R (mehrere Wiederholungen je Zeitpunkt). Empfohlen: 20 oder mehr Basis-Zeitpunkte, damit die Grenzen aus der Studie belastbar sind.',
              'Konstante Prüfbedingungen über die gesamte Studiendauer — dasselbe Prüfmittel, möglichst derselbe Prüfer oder eine dokumentierte Rotation, gleichbleibende Umgebungsbedingungen. Wechsel während der Studie erschweren die Interpretation von Nelson-Verletzungen.',
              'Eine Zeitstempel- oder Reihenfolge-Spalte (Datum oder ganzzahliger Index) und eine Messwert-Spalte im Worksheet. Bei x̄-R zusätzlich eine Untergruppen-Spalte (z. B. Tag, Charge, Kalibrierintervall).',
              'Für den Grenzen-Modus <em>aus Studien-Daten</em>: die Basis-Untergruppen selbst sollten weitgehend frei von {{term:nelson-regeln|Nelson-Verletzungen}} sein — sonst sind die daraus abgeleiteten Grenzen kontaminiert.',
              'Alternativ für den Grenzen-Modus <em>manuell</em>: bekannte oder aus einer Typ-1-Studie übernommene Werte für µ₀ (Sollwert des Referenzteils) und σ₀ (bekannte {{term:wiederholbarkeit|Wiederholstreuung}}).',
            ],
          },
          {
            type: 'definition',
            term: 'Warum nicht einfach eine normale Regelkarte?',
            content: 'Eine Prozess-Regelkarte in der Control-Phase überwacht das <em>Produkt</em> — Streuung des Fertigungsprozesses. Die Stabilitäts-Studie in Typ 6 überwacht dagegen das <em>Messsystem selbst</em>, indem sie ein konstantes Referenzteil misst. Jede Streuung, die hier auftritt, kommt ausschließlich vom Messsystem — nicht vom Teil.',
          },
        ],
      },
      en: {
        title: 'Prerequisites',
        blocks: [
          {
            type: 'list',
            items: [
              'Exactly one {{term:referenzteil|reference part}} (master sample) with a stable, reproducible characteristic — the same physical part is remeasured at every time point.',
              'At least 10 time points for I-MR (single readings), at least 5 subgroups for x̄-R (several replicates per time point). Recommended: 20 or more baseline points so the study-derived limits are trustworthy.',
              'Constant measurement conditions across the whole study — the same gage, ideally the same appraiser or a documented rotation, stable environmental conditions. Mid-study changes make Nelson-rule violations harder to interpret.',
              'A timestamp or sequence column (date or integer index) and a value column in the worksheet. For x̄-R, additionally a {{term:subgruppe|subgroup}} column (e.g. day, batch, calibration interval).',
              'For the <em>from-study</em> limits mode: the baseline subgroups themselves should be largely free of {{term:nelson-regeln|Nelson-rule violations}} — otherwise the derived limits are contaminated.',
              'Alternatively, for the <em>given</em> limits mode: known values, or values imported from a Type 1 study, for µ₀ (target value of the reference part) and σ₀ (known repeatability spread).',
            ],
          },
          {
            type: 'definition',
            term: 'Why not just use a regular control chart?',
            content: 'A process control chart in the Control phase monitors the <em>product</em> — variation of the manufacturing process. The stability study in Type 6 instead monitors the <em>measurement system itself</em> by measuring a constant reference part. Any variation observed here comes exclusively from the measurement system — not from the part.',
          },
        ],
      },
    },

    parameters: {
      de: {
        title: 'Parameter',
        blocks: [
          {
            type: 'definition',
            term: 'Kartentyp — I-MR vs. x̄-R',
            content: 'Bei genau einer Messung je Zeitpunkt zieht das Modul eine {{term:i-mr-chart|I-MR-Karte}} (Individualwerte + gleitende {{term:spannweite|Spannweite}}). Sobald eine Untergruppen-Spalte gewählt wird (mehrere Wiederholungen je Zeitpunkt, z. B. drei Messungen pro Tag), wechselt der Kartentyp automatisch auf {{term:xbar-r-chart|x̄-R}} (Untergruppen-Mittelwert + Spannweite). Der Nutzer kann jederzeit zurück auf I-MR schalten; dann wird die Untergruppen-Referenz ignoriert und die Werte flach durchgezählt.',
          },
          {
            type: 'definition',
            term: 'Grenzen-Modus — aus Studien-Daten vs. manuell',
            content: '<em>Aus Studien-Daten</em> (Default) berechnet {{term:regelkarte|Regelkarten}}-Grenzen aus den ersten <code>k</code> Untergruppen/Punkten der Studie selbst (Default k = 20, Minimum 5) — dieselbe Logik wie eine neu aufgesetzte {{term:regelkarte|Regelkarte}}. <em>Manuell / aus Typ 1</em> übernimmt stattdessen feste Werte µ₀ (Sollwert) und σ₀ (Streuung), z. B. direkt aus einer bereits abgeschlossenen MSA-Typ-1-Studie desselben Referenzteils — dann prüft Typ 6, ob das System bei den <em>bekannten</em> Sollgrenzen bleibt, statt sich neue Grenzen aus den aktuellen Daten selbst zu ziehen.',
          },
          {
            type: 'definition',
            term: '{{term:nelson-regeln|Nelson-Regeln}} 1–8',
            content: 'Acht Muster-Tests auf der {{term:regelkarte|Regelkarte}} (Punkt außerhalb ±3σ, sieben Punkte in Folge auf einer Seite der {{term:mittellinie|Mittellinie}}, Trend über sechs Punkte, Punkte in den {{term:sigma-zonen|Sigma-Zonen}} B/C usw.). Default aktiviert sind Regel 1–6; Regel 7 und 8 (Stratifikation) sind optional zuschaltbar. Jede Verletzung zählt in die Ampel-Bewertung.',
          },
          {
            type: 'definition',
            term: 'Signifikanzniveau α für den Drift-Test',
            content: 'Steuert, ab welchem p-Wert der lineare {{term:drift-test|Drift-Test}} einen Trend als signifikant einstuft (0,01 · 0,05 Default · 0,10). Ein <em>starker</em> Trend (p &lt; α/10) wiegt in der Ampel-Bewertung schwerer als ein nur knapp signifikanter.',
          },
          {
            type: 'definition',
            term: 'Basis-Untergruppen k',
            content: 'Nur im Grenzen-Modus <em>aus Studien-Daten</em>. Anzahl der ersten Untergruppen bzw. Einzelwerte, aus denen die {{term:regelkarte|Regelkarten}}-Grenzen berechnet werden. Unter 20 erscheint die Warnung, dass die Grenzen noch instabil sein können.',
          },
        ],
      },
      en: {
        title: 'Parameters',
        blocks: [
          {
            type: 'definition',
            term: 'Chart type — I-MR vs. x̄-R',
            content: 'With exactly one reading per time point the module draws an {{term:i-mr-chart|I-MR chart}} (individual values + moving range). As soon as a subgroup column is chosen (several replicates per time point, e.g. three readings per day), the chart type automatically switches to {{term:xbar-r-chart|x̄-R}} (subgroup mean + range). The user can switch back to I-MR at any time; the subgroup reference is then ignored and values are counted flat.',
          },
          {
            type: 'definition',
            term: 'Limits mode — from study data vs. given',
            content: '<em>From study data</em> (default) computes {{term:regelkarte|control chart}} limits from the first <code>k</code> subgroups/points of the study itself (default k = 20, minimum 5) — the same logic as setting up a fresh {{term:regelkarte|control chart}}. <em>Given / from Type 1</em> instead uses fixed values µ₀ (target) and σ₀ (spread), e.g. taken directly from an already-completed MSA Type 1 study of the same reference part — Type 6 then checks whether the system stays within the <em>known</em> target limits instead of deriving new limits from the current data itself.',
          },
          {
            type: 'definition',
            term: '{{term:nelson-regeln|Nelson rules}} 1–8',
            content: 'Eight pattern tests on the {{term:regelkarte|control chart}} (point outside ±3σ, seven points in a row on one side of the centerline, six-point trend, points in {{term:sigma-zonen|sigma zones}} B/C etc.). Rules 1–6 are enabled by default; rules 7 and 8 (stratification) are optional. Every violation counts toward the traffic-light verdict.',
          },
          {
            type: 'definition',
            term: 'Significance level α for the drift test',
            content: 'Controls the p-value threshold at which the linear {{term:drift-test|drift test}} classifies a trend as significant (0.01 · 0.05 default · 0.10). A <em>strong</em> trend (p &lt; α/10) weighs more heavily in the verdict than one that is only barely significant.',
          },
          {
            type: 'definition',
            term: 'Baseline subgroups k',
            content: 'Only in the <em>from study data</em> limits mode. Number of leading subgroups or individual values used to compute the {{term:regelkarte|control chart}} limits. Below 20 a warning is shown that the limits may still be unstable.',
          },
        ],
      },
    },

    verdict: {
      de: {
        title: 'Ampel-Regeln',
        blocks: [
          {
            type: 'paragraph',
            content: 'Die Ampel kombiniert zwei unabhängige Signale: die Zahl der {{term:nelson-regeln|Nelson-Verletzungen}} auf der {{term:regelkarte|Regelkarte}} und den p-Wert des linearen {{term:drift-test|Drift-Tests}}.',
          },
          {
            type: 'definition',
            term: 'Stabil (grün)',
            content: '0 Nelson-Verletzungen <strong>und</strong> p<sub>drift</sub> ≥ α. Das Messsystem zeigt weder Muster-Ausreißer noch einen signifikanten Trend — die {{term:regelkarte|Regelkarte}} ist unauffällig.',
          },
          {
            type: 'definition',
            term: 'Instabil (rot)',
            content: '≥ 3 Nelson-Verletzungen <strong>oder</strong> p<sub>drift</sub> &lt; α/10 (starker Trend). Mindestens eines der beiden Signale ist deutlich — entweder wiederholte Muster-Verletzungen oder ein klarer, statistisch belastbarer Trend. Das Messsystem ist in diesem Zustand nicht freigebbar.',
          },
          {
            type: 'definition',
            term: 'Bedingt / marginal (gelb)',
            content: 'Weder die grüne noch die rote Bedingung ist erfüllt — z. B. 1–2 Nelson-Verletzungen ohne signifikanten Trend, oder ein knapp signifikanter Trend (α ≤ p<sub>drift</sub> &lt; α/10) ohne Muster-Verletzungen. Beobachten und Ursache klären, bevor die nächste Studie ansteht.',
          },
          {
            type: 'definition',
            term: 'Ausschlag-Treiber (driver)',
            content: 'Das Feld <code>verdict.driver</code> benennt, welches Signal die Ampel bestimmt hat: <code>nelson</code> (Muster-Verletzungen dominieren), <code>drift</code> (der Trend dominiert), <code>both</code> (beide Bedingungen gemeinsam bei Instabil) oder <code>none</code> (stabil). Der Interpretationstext greift dieses Feld auf, um konkret zu benennen, worauf reagiert werden sollte.',
          },
        ],
      },
      en: {
        title: 'Verdict Rules',
        blocks: [
          {
            type: 'paragraph',
            content: 'The traffic light combines two independent signals: the number of {{term:nelson-regeln|Nelson-rule violations}} on the {{term:regelkarte|control chart}} and the p-value of the linear {{term:drift-test|drift test}}.',
          },
          {
            type: 'definition',
            term: 'Stable (green)',
            content: '0 Nelson violations <strong>and</strong> p<sub>drift</sub> ≥ α. The measurement system shows neither pattern outliers nor a significant trend — the {{term:regelkarte|control chart}} is unremarkable.',
          },
          {
            type: 'definition',
            term: 'Unstable (red)',
            content: '≥ 3 Nelson violations <strong>or</strong> p<sub>drift</sub> &lt; α/10 (strong trend). At least one of the two signals is pronounced — either repeated pattern violations or a clear, statistically robust trend. The measurement system cannot be released in this state.',
          },
          {
            type: 'definition',
            term: 'Conditional / marginal (yellow)',
            content: 'Neither the green nor the red condition is met — e.g. 1–2 Nelson violations without a significant trend, or a barely significant trend (α ≤ p<sub>drift</sub> &lt; α/10) without pattern violations. Watch closely and clarify the {{term:ursachenanalyse|root cause}} before the next study.',
          },
          {
            type: 'definition',
            term: 'Verdict driver',
            content: 'The <code>verdict.driver</code> field names which signal determined the verdict: <code>nelson</code> (pattern violations dominate), <code>drift</code> (the trend dominates), <code>both</code> (both conditions together for unstable) or <code>none</code> (stable). The interpretation text uses this field to name concretely what needs a response.',
          },
        ],
      },
    },

    interpretation: {
      de: {
        title: 'Interpretation',
        blocks: [
          {
            type: 'paragraph',
            content: 'Instabil heißt nicht automatisch „Messmittel kaputt" — es heißt „das Messsystem verhält sich anders als zu Beginn der Studie, und das muss verstanden werden, bevor man ihm weiter vertraut".',
          },
          {
            type: 'definition',
            term: 'Bei dominierendem Drift',
            content: 'Ein signifikanter, anhaltender Trend (Steigung β₁ deutlich von 0 verschieden) deutet auf eine schleichende Ursache: Verschleiß von Prüfmittel-Komponenten, allmähliche Verschmutzung, Sensor-Alterung, saisonale Temperaturänderung. Maßnahme: Rekalibrierung planen, Kalibrierintervall überprüfen, ggf. den Trend gegen bekannte Wartungs-/Kalibrierdaten abgleichen, um die Ursache zu bestätigen.',
          },
          {
            type: 'definition',
            term: 'Bei dominierenden Nelson-Verletzungen',
            content: 'Wiederholte oder auffällige Muster (z. B. Regel 2 — mehrere Punkte auf einer Seite der Mittellinie in Folge) deuten eher auf eine abrupte oder wiederkehrende Ursache: ein einmaliges Ereignis (Stoß, Fall, Reparatur), ein Bediener- oder Schichtwechsel, ein Chargenwechsel des Referenzteils, oder eine fehlerhafte Rekalibrierung. Maßnahme: Zeitpunkt der ersten Verletzung mit dem Wartungs-/Ereignisprotokoll abgleichen; ggf. Verantwortlichkeit (Prüfer, Schicht) prüfen.',
          },
          {
            type: 'definition',
            term: 'Bei beiden Signalen gemeinsam',
            content: 'Kombiniert deuten Drift <strong>und</strong> Nelson-Verletzungen häufig auf eine sich beschleunigende Verschlechterung hin (z. B. fortschreitender Verschleiß, der erst als Trend beginnt und später zu Ausreißern führt). Priorität: Prüfmittel kurzfristig aus dem Einsatz nehmen, bis die Ursache geklärt und eine neue Stabilitäts-Studie die Freigabe bestätigt.',
          },
          {
            type: 'definition',
            term: 'Basis-Warnung beachten',
            content: 'Wenn die Warnung erscheint, dass die Grenzen aus einer bereits instabilen Basis stammen (<code>W_LIMITS_FROM_UNSTABLE_BASELINE</code>), sind alle Nelson-Auswertungen mit Vorsicht zu lesen — die Grenzen selbst können kontaminiert sein. In diesem Fall zuerst eine bereinigte Basis wählen oder in den Grenzen-Modus <em>manuell</em> wechseln.',
          },
        ],
      },
      en: {
        title: 'Interpretation',
        blocks: [
          {
            type: 'paragraph',
            content: 'Unstable does not automatically mean "the gage is broken" — it means "the measurement system behaves differently than at the start of the study, and that needs to be understood before trusting it further".',
          },
          {
            type: 'definition',
            term: 'When drift dominates',
            content: 'A significant, sustained trend (slope β₁ clearly different from 0) points to a gradual cause: wear of gage components, gradual contamination, sensor aging, seasonal temperature change. Action: schedule recalibration, review the calibration interval, and if possible compare the trend against known maintenance/calibration dates to confirm the cause.',
          },
          {
            type: 'definition',
            term: 'When Nelson violations dominate',
            content: 'Repeated or striking patterns (e.g. rule 2 — several consecutive points on one side of the centerline) point more toward an abrupt or recurring cause: a one-time event (shock, drop, repair), an operator or shift change, a batch change of the reference part, or a faulty recalibration. Action: compare the timing of the first violation against the maintenance/event log; check responsibility (appraiser, shift) if relevant.',
          },
          {
            type: 'definition',
            term: 'When both signals combine',
            content: 'Drift <strong>and</strong> Nelson violations together often indicate an accelerating degradation (e.g. progressive wear that starts as a trend and later produces outliers). Priority: take the gage out of service temporarily until the cause is clarified and a new stability study confirms release.',
          },
          {
            type: 'definition',
            term: 'Mind the baseline warning',
            content: 'If the warning appears that the limits come from an already unstable baseline (<code>W_LIMITS_FROM_UNSTABLE_BASELINE</code>), read all Nelson results with caution — the limits themselves may be contaminated. In that case, choose a cleaner baseline first or switch to the <em>given</em> limits mode.',
          },
        ],
      },
    },

    examples: {
      de: {
        title: 'Beispiele',
        blocks: [
          {
            type: 'paragraph',
            content: 'Vier Beispieldatensätze stehen im HelpPanel-Tab „Beispiele" bereit — je zwei pro Kartentyp, einmal stabil (grün) und einmal auffällig (rot):',
          },
          {
            type: 'list',
            items: [
              '<strong>I-MR — stabil</strong>: 50 Einzelwerte, keine {{term:nelson-regeln|Nelson-Verletzung}}, kein Trend. Verdikt grün.',
              '<strong>I-MR — driftend</strong>: 50 Einzelwerte mit langsamem linearen Trend (~0,01·σ pro Punkt). Der {{term:drift-test|Drift-Test}} erkennt den Trend deutlich, Verdikt rot mit Driver <code>drift</code>.',
              '<strong>x̄-R — stabil</strong>: 25 Untergruppen à 5 Wiederholungen, unauffällige {{term:xbar-r-chart|x̄-R-Karte}}. Verdikt grün.',
              '<strong>x̄-R — Mittelwert-Shift</strong>: 25 Untergruppen à 5 Wiederholungen mit einem abrupten Mittelwert-Sprung ab Untergruppe 15. Mehrere {{term:nelson-regeln|Regel-2-Verletzungen}} in Folge, Verdikt rot mit Driver <code>nelson</code>.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Alle vier Datensätze eignen sich, um die Ampel-Logik und die Unterscheidung zwischen den beiden Signalen (Muster vs. Trend) an konkreten Zahlen nachzuvollziehen, bevor eigene Studien-Daten eingespielt werden.',
          },
        ],
      },
      en: {
        title: 'Examples',
        blocks: [
          {
            type: 'paragraph',
            content: 'Four example data sets are available in the HelpPanel "Examples" tab — two per chart type, one stable (green) and one flagged (red):',
          },
          {
            type: 'list',
            items: [
              '<strong>I-MR — stable</strong>: 50 individual values, no {{term:nelson-regeln|Nelson-rule violation}}, no trend. Verdict green.',
              '<strong>I-MR — drifting</strong>: 50 individual values with a slow linear trend (~0.01·σ per point). The {{term:drift-test|drift test}} clearly detects the trend, verdict red with driver <code>drift</code>.',
              '<strong>x̄-R — stable</strong>: 25 subgroups of 5 replicates, unremarkable {{term:xbar-r-chart|x̄-R chart}}. Verdict green.',
              '<strong>x̄-R — mean shift</strong>: 25 subgroups of 5 replicates with an abrupt mean jump starting at subgroup 15. Several consecutive {{term:nelson-regeln|rule-2 violations}}, verdict red with driver <code>nelson</code>.',
            ],
          },
          {
            type: 'paragraph',
            content: 'All four data sets are useful for tracing the verdict logic and the distinction between the two signals (pattern vs. trend) against concrete numbers before feeding in your own study data.',
          },
        ],
      },
    },
  },
};
