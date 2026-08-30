/**
 * D.Mike — Worksheet Module Handbook (worksheet-help.js)
 * Bilingual help content (DE/EN) for the worksheet module.
 */

export default {
  moduleId: 'worksheet',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Das Arbeitsblatt ist die zentrale Datendrehscheibe von DMAIC.io. Hier werden alle Messwerte, Merkmale und Zwischenergebnisse abgelegt — vergleichbar mit einem Tabellenblatt in Excel oder Minitab. Alle Analyse-Module greifen lesend auf die Spalten dieses Arbeitsblatts zu.',
          },
          {
            type: 'definition',
            term: 'Spalten und Spaltentypen',
            content: 'Jede Spalte hat einen Namen, einen Typ (numerisch, Text, Datum, Boolean) und optional eine Einheit. Der Typ steuert, wie Werte interpretiert und in den Analyse-Modulen angeboten werden.',
          },
          {
            type: 'definition',
            term: 'Zeilen',
            content: 'Eine Zeile entspricht einer Beobachtung — z. B. einem gemessenen Werkstück, einem Vorgang, einem Ereignis. Leere Zellen werden in den meisten Analysen automatisch übersprungen.',
          },
          {
            type: 'definition',
            term: 'Mehrere Sheets (Workbook)',
            content: 'Ein Arbeitsblatt kann mehrere Tabs enthalten — z. B. „Rohdaten", „Bereinigt", „Stichprobe Schicht A". Über die Tableiste am unteren Rand werden Sheets angelegt, umbenannt, dupliziert oder gelöscht.',
          },
          {
            type: 'definition',
            term: 'Formeln',
            content: 'Zellen, die mit „=" beginnen, sind Formeln (z. B. =A1+B1, =MEAN(A:A)). Die Berechnung erfolgt sofort und wird beim Öffnen automatisch aktualisiert.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'The worksheet is the central data hub of DMAIC.io. All measurements, attributes, and intermediate results live here — similar to a spreadsheet in Excel or Minitab. Every analysis module reads its columns from this worksheet.',
          },
          {
            type: 'definition',
            term: 'Columns and column types',
            content: 'Each column has a name, a type (numeric, text, date, boolean), and optionally a unit. The type controls how values are interpreted and which columns analysis modules offer for selection.',
          },
          {
            type: 'definition',
            term: 'Rows',
            content: 'One row represents one observation — e.g. one measured part, one transaction, one event. Empty cells are skipped automatically in most analyses.',
          },
          {
            type: 'definition',
            term: 'Multiple sheets (workbook)',
            content: 'A worksheet can contain several tabs — e.g. "Raw data", "Cleaned", "Sample shift A". Use the tab bar at the bottom to add, rename, duplicate, or delete sheets.',
          },
          {
            type: 'definition',
            term: 'Formulas',
            content: 'Cells starting with "=" are formulas (e.g. =A1+B1, =MEAN(A:A)). They are evaluated immediately and recalculated automatically when the worksheet is reopened.',
          },
        ],
      },
    },

    methodology: {
      de: {
        title: 'Bedienung',
        blocks: [
          {
            type: 'heading',
            content: 'Daten eingeben',
          },
          {
            type: 'list',
            items: [
              'Zelle anklicken und tippen — Enter springt nach unten, Tab springt nach rechts.',
              'Bereich markieren und mit Strg+C / Strg+V kopieren bzw. einfügen — auch aus Excel.',
              'Spaltenkopf anklicken, um Name, Typ und Einheit zu ändern.',
              'Strg+Z / Strg+Y für Rückgängig und Wiederherstellen.',
            ],
          },
          {
            type: 'heading',
            content: 'Import und Export',
          },
          {
            type: 'list',
            items: [
              'CSV- oder XLSX-Dateien lassen sich per Drag & Drop oder über die Importleiste laden.',
              'Beim Import wird der Spaltentyp automatisch erkannt; bei Bedarf manuell korrigieren.',
              'Export als CSV oder XLSX über die Exportleiste — der gesamte aktive Sheet wird ausgegeben.',
            ],
          },
          {
            type: 'heading',
            content: 'Sheets verwalten',
          },
          {
            type: 'list',
            items: [
              'Mit „+" am Tab-Ende ein neues Sheet anlegen.',
              'Rechtsklick auf einen Tab → umbenennen, duplizieren, löschen.',
              'Sheets können per Drag in der Tableiste umsortiert werden.',
            ],
          },
          {
            type: 'heading',
            content: 'Spaltendiagnose',
          },
          {
            type: 'paragraph',
            content: 'Die Spaltendiagnose prüft, ob alle Werte einer Spalte zum selben Datentyp gehören. Rechtsklick auf einen Spaltenkopf → „Spaltendiagnose" öffnet ein Panel mit folgenden Informationen:',
          },
          {
            type: 'list',
            items: [
              'Übersicht: Gesamtzahl, befüllte und leere Zellen.',
              'Dominanter Typ: Der am häufigsten erkannte Datentyp (numerisch, Text, Datum, Uhrzeit, Währung, Prozent).',
              'Typenverteilung: Farbiger Balken und Tabelle zeigen die Anteile jedes erkannten Typs.',
              'Schreibvarianten: Bei Textwerten werden ähnliche Einträge gruppiert. Erste Stufe (sicher): identisch nach Folding von Groß-/Kleinschreibung, Leerzeichen, Umlauten/Akzenten und ß — z. B. „ja"/„Ja"/„ JA ", „Müller"/„Muller", „café"/„cafe", „Straße"/„Strasse". Zweite Stufe: Tippfehler-Heuristik via Edit-Distanz (bis zu 3 Änderungen je nach Wortlänge, Vertauschungen wie „teh"/„the" zählen als 1) — fängt z. B. „Mueller"/„Muller", „Schraube"/„Schraueb", „Liferant"/„Lieferant". Fuzzy-Treffer sind mit „≈" markiert und sollten besonders geprüft werden. Klick springt zur ersten betroffenen Zelle; Korrekturen erfolgen ausschließlich manuell.',
              'Abweichler: Zellen, deren Typ vom dominanten Typ abweicht, werden einzeln aufgelistet — mit Zeilennummer und Wert. Ein Klick auf einen Eintrag springt direkt zur betroffenen Zelle.',
              'Tipp: Nach einem Datenimport zuerst die Spaltendiagnose auf jede Spalte anwenden, um fehlerhafte oder gemischte Einträge frühzeitig zu erkennen.',
            ],
          },
        ],
      },
      en: {
        title: 'Operation',
        blocks: [
          {
            type: 'heading',
            content: 'Entering data',
          },
          {
            type: 'list',
            items: [
              'Click a cell and type — Enter moves down, Tab moves right.',
              'Select a range and use Ctrl+C / Ctrl+V to copy or paste — also from Excel.',
              'Click a column header to change name, type, and unit.',
              'Ctrl+Z / Ctrl+Y for undo and redo.',
            ],
          },
          {
            type: 'heading',
            content: 'Import and export',
          },
          {
            type: 'list',
            items: [
              'CSV or XLSX files can be loaded via drag & drop or the import bar.',
              'Column types are detected automatically on import; correct them manually if needed.',
              'Export to CSV or XLSX via the export bar — the entire active sheet is written out.',
            ],
          },
          {
            type: 'heading',
            content: 'Managing sheets',
          },
          {
            type: 'list',
            items: [
              'Use "+" at the end of the tab bar to add a new sheet.',
              'Right-click a tab → rename, duplicate, delete.',
              'Sheets can be reordered by dragging tabs in the tab bar.',
            ],
          },
          {
            type: 'heading',
            content: 'Column scan',
          },
          {
            type: 'paragraph',
            content: 'The column scan checks whether all values in a column belong to the same data type. Right-click a column header → "Column scan" to open a panel with the following information:',
          },
          {
            type: 'list',
            items: [
              'Overview: total count, filled and empty cells.',
              'Dominant type: the most frequently detected data type (numeric, text, date, time, currency, percent).',
              'Type distribution: a colored bar and table show the proportion of each detected type.',
              'Spelling variants: similar text entries are grouped together. Stage 1 (safe): identical after folding case, whitespace, diacritics, and ß — e.g. "yes"/"Yes"/" YES ", "Müller"/"Muller", "café"/"cafe", "Straße"/"Strasse". Stage 2: typo heuristic via edit distance (up to 3 edits depending on word length; transpositions like "teh"/"the" count as 1) — catches "Mueller"/"Muller", "Schraube"/"Schraueb", "Liferant"/"Lieferant". Fuzzy matches are marked with "≈" and should be reviewed especially carefully. Clicking jumps to the first affected cell; corrections are made manually.',
              'Outliers: cells whose type differs from the dominant type are listed individually — with row number and value. Click an entry to jump directly to the affected cell.',
              'Tip: after a data import, run the column scan on each column first to catch erroneous or mixed entries early.',
            ],
          },
        ],
      },
    },

    columnRoles: {
      de: {
        title: 'Spaltenrollen',
        blocks: [
          {
            type: 'paragraph',
            content: 'Neben dem Spaltentyp (wie sind die Werte gespeichert?) hat jede Spalte zusätzlich eine analytische Rolle (wie sind sie gemeint?). Die Rolle entscheidet, welche Diagramme und Statistiken sinnvoll sind — sie ist die Grundlage des Diagramm-Vorschlags und ähnelt dem {{term:skalenniveau|Skalenniveau}} aus Tableau oder Minitab.',
          },
          {
            type: 'paragraph',
            content: 'Beispiel: Eine Spalte „Maschine" mit Werten 1, 2, 3, 4 ist numerisch gespeichert, aber kategorial gemeint — der {{term:mittelwert|Mittelwert}} ergibt keinen Sinn. Heuristik allein bekommt das nicht zuverlässig hin, deshalb gibt es ein zweites, explizites Rollen-Feld pro Spalte.',
          },
          {
            type: 'definition',
            term: 'Stetig (Continuous)',
            content: 'Numerische Messwerte mit sinnvoller Arithmetik — z. B. Maße, Gewichte, Zeiten, Erträge. Mittelwert, {{term:standardabweichung|Standardabweichung}} und {{term:histogramm|Histogramm}} sind anwendbar.',
          },
          {
            type: 'definition',
            term: 'Kategorial (Categorical)',
            content: 'Unordered Kategorien — z. B. Schicht, Maschine, Region. Wird per {{term:pareto|Pareto}}, Balken oder {{term:kreisdiagramm|Tortendiagramm}} dargestellt. Kein Mittelwert.',
          },
          {
            type: 'definition',
            term: 'Ordinal',
            content: 'Geordnete Kategorien mit Rangfolge ohne festen Abstand — z. B. „klein/mittel/groß", Schulnote, Likert-Skala. Bar (geordnet) ist der Standardplot.',
          },
          {
            type: 'definition',
            term: 'Datum/Zeit',
            content: 'Zeitachse — Voraussetzung für Verlaufsdiagramm, Zeitreihe, {{term:regelkarte|Regelkarte}} über die Zeit.',
          },
          {
            type: 'definition',
            term: 'Identifier',
            content: 'Eindeutige Kennzeichen wie Seriennummer, Werkstück-ID, Charge — keine Statistik, dient nur der Rückverfolgung. Wird beim Diagrammvorschlag ausgeblendet.',
          },
          {
            type: 'definition',
            term: 'Freier Text',
            content: 'Kommentare, Beschreibungen, Beobachtungen — z. B. „kratzer auf oberseite". Nicht statistisch auswertbar, aber wertvoll als Kontext.',
          },
          {
            type: 'definition',
            term: 'Badge im Spaltenkopf',
            content: 'Jede Spalte trägt einen Badge mit doppelter Codierung: Die Form (#, Abc, …) zeigt den Speichertyp, die Farbe die Rolle. Ein kleiner blauer Punkt oben rechts markiert manuell gesetzte Rollen — diese werden nicht durch die Heuristik überschrieben, solange sie zum Typ passen.',
          },
          {
            type: 'definition',
            term: 'Rolle manuell ändern',
            content: 'Klick auf den Badge öffnet einen Auswahl-Picker: links Typ, rechts Rolle. Ungültige Rollen für den aktuellen Typ sind ausgeblendet. Ein Wechsel des Typs setzt die Rolle nur dann zurück, wenn die alte Rolle für den neuen Typ unzulässig ist.',
          },
          {
            type: 'paragraph',
            content: 'Automatisch erkannt werden nur vier Rollen: Stetig, Kategorial, Datum, Freier Text. Ordinal und Identifier müssen manuell gesetzt werden — die Heuristik kann ohne Domänenwissen nicht zwischen „Maschine 1–4" (kategorial) und „Note 1–6" (ordinal) unterscheiden.',
          },
        ],
      },
      en: {
        title: 'Column roles',
        blocks: [
          {
            type: 'paragraph',
            content: 'In addition to the column type (how are the values stored?) each column carries an analytical role (how are they meant?). The role decides which charts and statistics make sense — it is the basis of the chart-suggestion tool and mirrors the scale-of-measurement idea in Tableau and Minitab.',
          },
          {
            type: 'paragraph',
            content: 'Example: a column "Machine" with values 1, 2, 3, 4 is numerically stored but semantically categorical — its {{term:mittelwert|mean}} is meaningless. Heuristics alone cannot get this right, so each column has an explicit role field on top of its storage type.',
          },
          {
            type: 'definition',
            term: 'Continuous',
            content: 'Numeric measurements with meaningful arithmetic — lengths, weights, times, yields. Mean, {{term:standardabweichung|standard deviation}}, and histogram apply.',
          },
          {
            type: 'definition',
            term: 'Categorical',
            content: 'Unordered categories — shift, machine, region. Visualized with Pareto, bar, or pie. No meaningful mean.',
          },
          {
            type: 'definition',
            term: 'Ordinal',
            content: 'Ordered categories with a rank but no fixed spacing — "small/medium/large", school grades, Likert scales. The bar (ordered) is the standard plot.',
          },
          {
            type: 'definition',
            term: 'Date / time',
            content: 'A time axis — prerequisite for run charts, time series, and control charts over time.',
          },
          {
            type: 'definition',
            term: 'Identifier',
            content: 'Unique keys such as serial numbers, part IDs, lot codes — no statistics, used purely for traceability. The chart-suggestion tool ignores identifier columns.',
          },
          {
            type: 'definition',
            term: 'Free text',
            content: 'Comments, descriptions, observations — e.g. "scratch on top side". Not statistically analyzable, but valuable as context.',
          },
          {
            type: 'definition',
            term: 'Badge in the column header',
            content: 'Each column shows a badge with dual encoding: the shape (#, Abc, …) indicates the storage type, the color the role. A small blue dot in the top-right marks manually-set roles — these are not overwritten by the heuristic as long as they remain valid for the type.',
          },
          {
            type: 'definition',
            term: 'Change role manually',
            content: 'Clicking the badge opens a two-column picker: type on the left, role on the right. Roles that are not valid for the current type are hidden. Changing the type resets the role only when the previous role becomes invalid for the new type.',
          },
          {
            type: 'paragraph',
            content: 'Only four roles are inferred automatically: Continuous, Categorical, Date, Free text. Ordinal and Identifier must be set by hand — the heuristic cannot tell "Machine 1–4" (categorical) from "Grade 1–6" (ordinal) without domain knowledge.',
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
            term: 'Falscher Spaltentyp',
            content: 'Steht eine numerische Spalte versehentlich auf „Text", wird sie in Analyse-Modulen nicht angeboten oder als kategoriales Merkmal interpretiert. Spaltentyp prüfen, sobald eine erwartete Spalte fehlt.',
          },
          {
            type: 'definition',
            term: 'Gemischte Einheiten in einer Spalte',
            content: 'Zahlen mit unterschiedlichen Einheiten (mm und cm) in derselben Spalte führen zu falschen Statistiken. Pro Spalte genau eine Einheit verwenden — bei Bedarf das Modul „Einheitenrechner" nutzen.',
          },
          {
            type: 'definition',
            term: 'Leere Zeilen mitten im Datensatz',
            content: 'Manche Analysen werten leere Zeilen als „fehlend" und schließen sie aus, andere brechen ab. Im Zweifel den Datensatz vor der Analyse bereinigen.',
          },
          {
            type: 'definition',
            term: 'Formeln nach Datenänderung nicht aktualisiert',
            content: 'Formeln werden bei jeder Zelländerung neu berechnet. Wenn ein Wert dennoch veraltet wirkt, hilft ein erneutes Öffnen des Sheets (oder F5 im Browser) — das erzwingt eine vollständige Neuberechnung.',
          },
          {
            type: 'definition',
            term: 'Zu viele Sheets',
            content: 'Zwischenstände, gefilterte Auszüge und Backups in unterschiedlichen Sheets sind hilfreich — werden aber unübersichtlich. Klare Namen vergeben und veraltete Sheets löschen.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Wrong column type',
            content: 'If a numeric column is accidentally set to "text", analysis modules will either not offer it or treat it as a categorical attribute. Check the column type whenever an expected column is missing.',
          },
          {
            type: 'definition',
            term: 'Mixed units in one column',
            content: 'Numbers with different units (mm and cm) in the same column produce wrong statistics. Use exactly one unit per column — fall back to the unit converter module if needed.',
          },
          {
            type: 'definition',
            term: 'Empty rows in the middle of a dataset',
            content: 'Some analyses treat empty rows as "missing" and skip them, others abort. When in doubt, clean the dataset before analysis.',
          },
          {
            type: 'definition',
            term: 'Formulas not updated after data change',
            content: 'Formulas are recalculated on every cell change. If a value still looks stale, reopening the sheet (or F5 in the browser) forces a full recalculation.',
          },
          {
            type: 'definition',
            term: 'Too many sheets',
            content: 'Intermediate snapshots, filtered extracts, and backups in different sheets are useful — but quickly become confusing. Use clear names and delete obsolete sheets.',
          },
        ],
      },
    },
  },
};
