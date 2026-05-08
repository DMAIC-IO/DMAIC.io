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
              'Outliers: cells whose type differs from the dominant type are listed individually — with row number and value. Click an entry to jump directly to the affected cell.',
              'Tip: after a data import, run the column scan on each column first to catch erroneous or mixed entries early.',
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
