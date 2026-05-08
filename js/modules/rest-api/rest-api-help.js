/**
 * D.Mike — REST API Module Handbook (rest-api-help.js)
 * Bilingual help content (DE/EN) for the REST API module.
 */

export default {
  moduleId: 'rest-api',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Das REST-API-Modul verbindet DMAIC.io mit externen Datenquellen. Es ruft per HTTP-GET JSON-Daten von einer URL ab, mappt einzelne Felder auf Spalten im Arbeitsblatt und kann den Abruf wiederkehrend ausführen — z. B. um Messwerte aus einem Server, einer Maschinensteuerung oder einem Cloud-Dienst regelmäßig in das Arbeitsblatt zu schreiben.',
          },
          {
            type: 'definition',
            term: 'Endpunkt',
            content: 'Ein gespeicherter Eintrag mit Name, URL, optionalen HTTP-Headern und einer Mapping-Tabelle. Pro Projekt lassen sich beliebig viele Endpunkte verwalten — z. B. einer pro Maschine oder pro Datenquelle.',
          },
          {
            type: 'definition',
            term: 'JSON-Pfad',
            content: 'Eine Punktnotation, die in der API-Antwort einen bestimmten Wert oder ein Array adressiert (z. B. data.measurements oder result.values[*].temperature). Der Wert hinter diesem Pfad wird in die zugewiesene Worksheet-Spalte geschrieben.',
          },
          {
            type: 'definition',
            term: 'Mapping (JSON-Pfad → Spalte)',
            content: 'Eine Liste von Zuordnungen: Pro Eintrag wird ein JSON-Pfad einer Zielspalte im Arbeitsblatt zugewiesen. Beim Abruf werden die Werte gemäß diesen Mappings übernommen.',
          },
          {
            type: 'definition',
            term: 'Schreibmodus',
            content: 'Steuert, wie die abgerufenen Werte in die Spalten geschrieben werden — entweder ersetzen (alte Werte werden überschrieben) oder anhängen (neue Werte werden unten angefügt). Anhängen eignet sich für laufende Datenerfassung.',
          },
          {
            type: 'definition',
            term: 'Zeitplan (Schedule)',
            content: 'Optionaler Wiederholungsabruf in Minuten oder Stunden. Solange das Modul geöffnet ist, ruft es den Endpunkt automatisch im eingestellten Intervall auf.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'The REST API module connects DMAIC.io to external data sources. It performs HTTP GET requests against a URL, maps individual fields of the JSON response to columns in the worksheet, and can run on a schedule — e.g. to regularly pull measurements from a server, a machine controller, or a cloud service into the worksheet.',
          },
          {
            type: 'definition',
            term: 'Endpoint',
            content: 'A saved entry with name, URL, optional HTTP headers, and a mapping table. Any number of endpoints can be managed per project — e.g. one per machine or per data source.',
          },
          {
            type: 'definition',
            term: 'JSON path',
            content: 'A dot notation that addresses a specific value or array in the API response (e.g. data.measurements or result.values[*].temperature). The value behind this path is written to the assigned worksheet column.',
          },
          {
            type: 'definition',
            term: 'Mapping (JSON path → column)',
            content: 'A list of assignments: each entry maps one JSON path to one target column in the worksheet. On every fetch, values are written according to these mappings.',
          },
          {
            type: 'definition',
            term: 'Write mode',
            content: 'Controls how fetched values are written to the columns — either replace (old values are overwritten) or append (new values are added at the bottom). Append is suitable for ongoing data capture.',
          },
          {
            type: 'definition',
            term: 'Schedule',
            content: 'Optional repeating fetch in minutes or hours. As long as the module is open, it automatically calls the endpoint at the configured interval.',
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
            content: 'Endpunkt einrichten',
          },
          {
            type: 'list',
            items: [
              'Mit „+" einen neuen Endpunkt anlegen und einen sprechenden Namen vergeben.',
              'URL eintragen — typischerweise eine REST-Schnittstelle, die JSON liefert.',
              'Bei Bedarf HTTP-Header ergänzen (z. B. Authorization für API-Keys oder Bearer Tokens).',
              'Mit dem Play-Button einen Testabruf starten — die Antwort wird zur Inspektion angezeigt.',
              'JSON-Pfade aus der Antwort identifizieren und je einer Worksheet-Spalte zuordnen.',
              'Schreibmodus wählen: ersetzen oder anhängen.',
              'Optional: Schedule aktivieren, Intervall in Minuten oder Stunden eintragen.',
            ],
          },
          {
            type: 'heading',
            content: 'Endpunkte verwalten',
          },
          {
            type: 'list',
            items: [
              'Endpunkte lassen sich duplizieren — praktisch für mehrere ähnliche Datenquellen.',
              'Beim Löschen eines Endpunkts wird ein laufender Schedule automatisch beendet.',
              'Der gesamte Zustand (Endpunkte, Mappings, Zeitpläne) wird beim Projekt-Export mit gespeichert.',
            ],
          },
        ],
      },
      en: {
        title: 'Operation',
        blocks: [
          {
            type: 'heading',
            content: 'Setting up an endpoint',
          },
          {
            type: 'list',
            items: [
              'Use "+" to create a new endpoint and give it a meaningful name.',
              'Enter the URL — typically a REST interface that returns JSON.',
              'Add HTTP headers if needed (e.g. Authorization for API keys or bearer tokens).',
              'Click the play button to run a test fetch — the response is displayed for inspection.',
              'Identify JSON paths in the response and assign each one to a worksheet column.',
              'Pick the write mode: replace or append.',
              'Optional: enable the schedule and enter an interval in minutes or hours.',
            ],
          },
          {
            type: 'heading',
            content: 'Managing endpoints',
          },
          {
            type: 'list',
            items: [
              'Endpoints can be duplicated — handy for several similar data sources.',
              'Deleting an endpoint automatically stops a running schedule.',
              'The full state (endpoints, mappings, schedules) is included in the project export.',
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
            term: 'CORS-Fehler',
            content: 'Browser blockieren standardmäßig API-Aufrufe an fremde Domains, wenn der Server keine CORS-Header sendet. Lösung: Endpoint serverseitig CORS-fähig machen oder einen Proxy verwenden. Symptome: Netzwerkfehler ohne Antwort.',
          },
          {
            type: 'definition',
            term: 'Sensible Daten in Headern',
            content: 'API-Keys, Bearer Tokens und Passwörter werden im Klartext im Projekt gespeichert und beim Export mit ausgegeben. Daten vor dem Teilen prüfen oder Token regelmäßig rotieren.',
          },
          {
            type: 'definition',
            term: 'Falscher JSON-Pfad',
            content: 'Tippfehler oder eine falsche Verschachtelungstiefe führen dazu, dass leere Spalten geschrieben werden. Vor dem produktiven Einsatz immer einen Testabruf machen und das Ergebnis prüfen.',
          },
          {
            type: 'definition',
            term: 'Schreibmodus „Ersetzen" mit Schedule',
            content: 'Bei aktivem Schedule und „Ersetzen" wird der Sheet-Inhalt bei jedem Abruf überschrieben — alte Werte gehen verloren. Für Zeitreihen unbedingt „Anhängen" wählen.',
          },
          {
            type: 'definition',
            term: 'Schedule läuft nur bei geöffnetem Modul',
            content: 'Der wiederkehrende Abruf läuft im Browser-Tab. Schließt man das Modul oder den Browser, stoppt der Schedule. Für echte Hintergrund-Erfassung ist ein Server-Job nötig.',
          },
          {
            type: 'definition',
            term: 'Sehr kurze Intervalle',
            content: 'Intervalle unter einer Minute belasten den Browser und die Gegenseite stark. Für hochfrequente Daten lieber serverseitig puffern und in größeren Schritten holen.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'CORS errors',
            content: 'Browsers block cross-origin API calls by default unless the server sends the right CORS headers. Solution: enable CORS on the endpoint or use a proxy. Symptom: network error without a response body.',
          },
          {
            type: 'definition',
            term: 'Sensitive data in headers',
            content: 'API keys, bearer tokens, and passwords are stored in clear text inside the project and included in exports. Check data before sharing or rotate tokens regularly.',
          },
          {
            type: 'definition',
            term: 'Wrong JSON path',
            content: 'Typos or the wrong nesting depth cause empty columns to be written. Always run a test fetch and check the result before using the endpoint productively.',
          },
          {
            type: 'definition',
            term: 'Write mode "replace" with a schedule',
            content: 'With "replace" enabled and a schedule running, the sheet content is overwritten on every fetch — old values are lost. For time series, choose "append".',
          },
          {
            type: 'definition',
            term: 'Schedule only runs while the module is open',
            content: 'The recurring fetch runs in the browser tab. Closing the module or the browser stops the schedule. For real background acquisition, a server-side job is required.',
          },
          {
            type: 'definition',
            term: 'Very short intervals',
            content: 'Intervals below one minute put a heavy load on the browser and the remote endpoint. For high-frequency data, buffer on the server side and fetch in larger steps.',
          },
        ],
      },
    },
  },
};
