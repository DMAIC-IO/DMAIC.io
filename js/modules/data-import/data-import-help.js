/**
 * D.Mike — Data Import Module Handbook (data-import-help.js)
 * Bilingual help content (DE/EN) for the data import module.
 */

export default {
  moduleId: 'data-import',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Das Datenimport-Modul liest Datensätze aus Fremdformaten ein und überträgt sie als neue Worksheet-Tabelle in DMAIC.io. Damit können Sie Daten aus anderen Statistik-Werkzeugen weiterverwenden, ohne sie manuell abtippen oder umständlich exportieren zu müssen.',
          },
          {
            type: 'definition',
            term: 'Unterstützte Formate',
            content: 'Aktuell werden das Minitab-Projektformat .mpx, Textdateien (CSV / TSV / TXT), Tabellenkalkulationen (.xlsx, .xlsm, .xls, .ods), JSON / NDJSON sowie das Q-DAS AQDEF-Format (.dfq / .dfd / .dfx) unterstützt. Die Modul-Architektur ist offen — weitere Formate (JMP, SPSS, …) lassen sich als zusätzliche Parser ergänzen.',
          },
          {
            type: 'definition',
            term: 'Minitab .mpx',
            content: 'Eine .mpx-Datei ist ein ZIP-Archiv mit XML-Dateien, das ein Minitab-Projekt einschließlich aller Worksheets enthält. DMAIC.io entpackt das Archiv lokal im Browser, liest die Spaltennamen, Datentypen und Werte aus und stellt sie zur Übernahme bereit.',
          },
          {
            type: 'definition',
            term: 'CSV / TSV / TXT',
            content: 'Textbasierte Tabellendateien mit Trennzeichen (Komma, Semikolon, Tabulator, Senkrechtstrich). Trennzeichen und Zeichensatz (UTF-8, Windows-1252, Latin-1) lassen sich nach dem Laden umstellen — die Vorschau wird unmittelbar neu berechnet. Spaltentypen (numerisch / Text) werden automatisch anhand der Werte erkannt; sowohl Punkt als auch Komma werden als Dezimaltrenner akzeptiert. Für CMM-Exporte (Zeiss CALYPSO, Hexagon PC-DMIS, Mitutoyo MeasurLink) stehen Profile als Ein-Klick-Defaults bereit, die Trennzeichen, Zeichensatz und Anzahl zu überspringender Kopfzeilen gemeinsam setzen — alle Werte lassen sich danach weiter feinjustieren.',
          },
          {
            type: 'definition',
            term: 'Excel / ODS',
            content: 'Tabellenkalkulationen aus Microsoft Excel (.xlsx, .xlsm, .xls) und LibreOffice / OpenOffice (.ods). Mehrere Tabellenblätter werden komplett übernommen — über die Tabs in der Vorschau lässt sich das gewünschte Blatt auswählen. Datumswerte werden in ISO-Form (JJJJ-MM-TT) übernommen, Formeln auf ihre berechneten Werte reduziert.',
          },
          {
            type: 'definition',
            term: 'JSON / NDJSON',
            content: 'JSON-Dateien können in drei Strukturen vorkommen und werden alle erkannt: als Records-Array (`[{a:1, b:2}, …]` — das von DMAIC.io selbst exportierte Worksheet-Format), als spaltenorientiertes Objekt (`{a:[1,2,…], b:[3,4,…]}`) sowie als NDJSON / JSONL mit einem JSON-Datensatz pro Zeile. Wrapper-Objekte mit `data`-, `rows`- oder `records`-Feld werden automatisch entpackt.',
          },
          {
            type: 'definition',
            term: 'Q-DAS AQDEF',
            content: 'Industriestandard für SPC-/Messdaten im DACH-Raum (Bosch, Daimler, VW, ZF, Continental). Das Modul liest .dfq, .dfd und .dfx und wertet die K-Schlüssel aus: K0100 = Anzahl Merkmale, K2002/n = Merkmalsbezeichnung (Spaltenname), K2001/n = Merkmalsnummer (Fallback-Name), K0001/n / K0002/n = Mess- bzw. Attributwerte, K1002/n = Bauteilbezeichnung (Tabellenname). Werte können verbose als einzelne K0001/n-Zeilen oder kompakt mit einer Zeile pro Messung kommen — das Trennzeichen wird automatisch erkannt. Vorausgewählt ist Windows-1252 (Q-DAS-typisch), UTF-8 mit BOM wird automatisch erkannt.',
          },
          {
            type: 'definition',
            term: 'Lokal & offline',
            content: 'Die Datei wird ausschließlich im Browser entpackt und ausgewertet — es findet keine Übertragung an einen Server statt. Das gilt auch für sensible Prozessdaten.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'The data-import module reads datasets from third-party formats and transfers them as a new worksheet table into DMAIC.io. It lets you keep working with data produced by other statistics tools without having to retype or roundtrip through CSV.',
          },
          {
            type: 'definition',
            term: 'Supported formats',
            content: 'The Minitab project format .mpx, delimited text files (CSV / TSV / TXT), spreadsheets (.xlsx, .xlsm, .xls, .ods), JSON / NDJSON, and the Q-DAS AQDEF format (.dfq / .dfd / .dfx) are supported today. The module architecture is open — additional formats (JMP, SPSS, …) can be added as further parsers.',
          },
          {
            type: 'definition',
            term: 'Minitab .mpx',
            content: 'An .mpx file is a ZIP archive of XML files that holds a complete Minitab project including all worksheets. DMAIC.io unpacks the archive locally in the browser, reads column names, data types, and values, and makes them available for transfer.',
          },
          {
            type: 'definition',
            term: 'CSV / TSV / TXT',
            content: 'Delimited text files (comma, semicolon, tab, pipe). After loading, delimiter and encoding (UTF-8, Windows-1252, Latin-1) can be switched at any time — the preview is recomputed immediately. Column types (numeric / text) are detected from the values; both period and comma are accepted as decimal separators. For CMM exports (Zeiss CALYPSO, Hexagon PC-DMIS, Mitutoyo MeasurLink) one-click profiles set delimiter, encoding, and the number of metadata rows to skip together — every value remains tweakable afterwards.',
          },
          {
            type: 'definition',
            term: 'Excel / ODS',
            content: 'Spreadsheets from Microsoft Excel (.xlsx, .xlsm, .xls) and LibreOffice / OpenOffice (.ods). All sheets are loaded — use the tabs in the preview to choose which one to transfer. Date cells are converted to ISO format (YYYY-MM-DD); formulas are read as their evaluated values.',
          },
          {
            type: 'definition',
            term: 'JSON / NDJSON',
            content: 'JSON files can appear in three shapes and all of them are auto-detected: a records array (`[{a:1, b:2}, …]` — the worksheet\'s own export format), a column-oriented object (`{a:[1,2,…], b:[3,4,…]}`), and NDJSON / JSONL with one JSON record per line. Wrapper objects with a `data`, `rows`, or `records` field are unwrapped automatically.',
          },
          {
            type: 'definition',
            term: 'Q-DAS AQDEF',
            content: 'The de-facto SPC / measurement standard in DACH industry (Bosch, Daimler, VW, ZF, Continental). The module reads .dfq, .dfd, and .dfx files and parses the K-keys: K0100 = number of characteristics, K2002/n = characteristic description (column name), K2001/n = characteristic number (fallback name), K0001/n / K0002/n = measurement / attribute values, K1002/n = part description (sheet name). Values may come verbose as individual K0001/n lines or compact with one row per measurement — the row delimiter is detected automatically. Windows-1252 is pre-selected (typical for Q-DAS); UTF-8 with BOM is detected automatically.',
          },
          {
            type: 'definition',
            term: 'Local & offline',
            content: 'The file is unpacked and inspected entirely in the browser — nothing is uploaded to a server. The same holds for sensitive process data.',
          },
        ],
      },
    },

    methodology: {
      de: {
        title: 'Bedienung',
        blocks: [
          {
            type: 'list',
            items: [
              'Datei per Drag & Drop auf die Ablagefläche ziehen oder mit „Datei wählen" über den Datei-Dialog auswählen.',
              'Das Modul erkennt das Format an der Dateiendung und entpackt die Datei sofort.',
              'In der Vorschau sind Spaltennamen, Datentypen und die ersten 20 Zeilen sichtbar.',
              'Bei mehreren Tabellen in der Datei zwischen den Tabs umschalten, um die jeweils interessante Tabelle zu prüfen.',
              'Mit „→ Worksheet" wird die aktuell angezeigte Tabelle als neues Worksheet im Daten-Bereich angelegt.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Typische Einsatzfälle: Bestehende Minitab-Schulungsdatensätze in DMAIC.io weiterverwenden, Beispieldaten aus Lehrbüchern einlesen, Auditberichte aus Drittsystemen reproduzieren.',
          },
        ],
      },
      en: {
        title: 'Operation',
        blocks: [
          {
            type: 'list',
            items: [
              'Drag a file onto the drop area or use "Choose file" to pick one through the file dialog.',
              'The module detects the format from the file extension and unpacks the file immediately.',
              'The preview shows column names, data types, and the first 20 rows.',
              'If the file contains several worksheets, switch between the tabs to inspect each one.',
              'Click "→ Worksheet" to create a new worksheet in the data section from the currently shown table.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Typical use cases: continue working with existing Minitab training datasets in DMAIC.io, load example data from textbooks, reproduce audit reports from third-party systems.',
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
            term: 'Fehlende Werte',
            content: 'Minitab markiert fehlende Werte mit einem Stern (*). Diese werden beim Import in echte Leerzellen umgewandelt, damit sie in Statistik-Modulen korrekt ignoriert werden.',
          },
          {
            type: 'definition',
            term: 'Datums- und Zeitspalten',
            content: 'Datums-/Zeit-Spalten werden derzeit als Text importiert, nicht als echte Datums-Werte. Für Zeitreihenanalysen ggf. eine numerische Hilfsspalte ergänzen.',
          },
          {
            type: 'definition',
            term: 'Erst die richtige Tabelle auswählen',
            content: 'Bei Dateien mit mehreren Tabellen wird nur die aktuell aktive Tabelle übernommen. Wenn weitere Tabellen benötigt werden, das Modul nochmals nutzen oder die Datei mehrfach importieren und jeweils einen anderen Tab wählen.',
          },
          {
            type: 'definition',
            term: 'Sehr große Dateien',
            content: 'Da das Entpacken im Browser stattfindet, kann es bei mehreren hundert Megabyte spürbar dauern. Die ersten Sekunden zeigt das Modul den Hinweis „Datei wird gelesen…" — bitte abwarten.',
          },
          {
            type: 'definition',
            term: 'Nach Reload erneut auswählen',
            content: 'Nach einem Browser-Reload bleibt der Dateiname erhalten, der Inhalt aber nicht — Browser dürfen Datei-Handles nicht persistieren. Die Datei muss in diesem Fall erneut ausgewählt werden.',
          },
          {
            type: 'definition',
            term: 'CSV: Umlaute & Trennzeichen prüfen',
            content: 'Falls Umlaute in der Vorschau falsch dargestellt werden, ist meist „Windows-1252 (Excel)" der richtige Zeichensatz. In Deutschland exportiert Excel oft mit Semikolon statt Komma — bei merkwürdiger Spaltenaufteilung das Trennzeichen umstellen. Beide Korrekturen lösen sofort einen Neuparse aus.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Missing values',
            content: 'Minitab marks missing values with an asterisk (*). On import these are converted to real empty cells so that statistics modules ignore them correctly.',
          },
          {
            type: 'definition',
            term: 'Date and time columns',
            content: 'Date / time columns are currently imported as text, not as native date values. For time-series analyses you may want to add a helper numeric column.',
          },
          {
            type: 'definition',
            term: 'Pick the right sheet first',
            content: 'For files with multiple sheets, only the currently active sheet is transferred. If you need other sheets, run the module again or import the file repeatedly with a different tab selected each time.',
          },
          {
            type: 'definition',
            term: 'Very large files',
            content: 'Because unpacking happens in the browser, files in the hundreds of megabytes range can take a moment. The module shows "Reading file…" during that time — please wait.',
          },
          {
            type: 'definition',
            term: 'Re-pick after reload',
            content: 'After a browser reload the file name is kept, but the content is not — browsers do not allow persisting file handles. The file has to be picked again in that case.',
          },
          {
            type: 'definition',
            term: 'CSV: check encoding & delimiter',
            content: 'If umlauts or accented characters look garbled in the preview, "Windows-1252 (Excel)" is usually the right encoding. In Germany, Excel often exports with a semicolon instead of a comma — if columns look wrong, switch the delimiter. Either change triggers an immediate re-parse.',
          },
        ],
      },
    },
  },
};
