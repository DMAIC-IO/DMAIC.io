/**
 * FMEA: das Altprojekt der E2E-Fixture `legacy-project.json` (Instanz
 * ohne `_schema`) und die Zeilen seines
 * CSV-Downloads aus der Altform (legacy-export.csv ohne BOM).
 */
export const LEGACY_STATE = Object.freeze({
  "fmeaType": "design",
  "risks": [
    {
      "id": "r1",
      "step": "Wareneingang Gehäuse",
      "failureMode": "Falsches Material geliefert",
      "effect": "Gehäuse bricht im Feld",
      "cause": "Lieferant verwechselt Charge",
      "prevention": "Materialzeugnis je Charge",
      "control": "Stichprobe mit Spektrometer",
      "specialChar": "CC",
      "justification": "",
      "sev": "9",
      "occ": "4",
      "det": "6",
      "actions": [
        {
          "text": "Prüfanweisung um Spektralanalyse ergänzen",
          "resp": "QS",
          "date": "2026-03-02",
          "done": true,
          "deltaS": "0",
          "deltaO": "2",
          "deltaD": "3"
        },
        {
          "text": "Lieferantenaudit \"Charge\"; Nachweis",
          "resp": "Einkauf",
          "date": "2026-04-15",
          "done": false,
          "deltaS": "0",
          "deltaO": 1,
          "deltaD": "0"
        }
      ],
      "collapsed": false
    },
    {
      "step": "Montage Deckel",
      "failureMode": "Schraube nicht angezogen",
      "effect": "Deckel lose",
      "cause": "Akkuschrauber ohne Drehmomentkontrolle",
      "prevention": "",
      "control": "Sichtprüfung",
      "specialChar": "",
      "justification": "Altwert S 15 aus Import",
      "sev": "15",
      "occ": "3",
      "det": "2",
      "actions": [
        {
          "text": "Drehmomentschrauber mit Quittierung",
          "resp": "Fertigung",
          "date": "2026-03-20",
          "done": true,
          "deltaS": "0",
          "deltaO": "0",
          "deltaD": "3"
        }
      ],
      "collapsed": false
    },
    {
      "id": "r3",
      "step": "Verpackung",
      "failureMode": "Etikett fehlt",
      "effect": "Rückverfolgung unmöglich",
      "cause": "Drucker leer",
      "prevention": "Füllstandsanzeige",
      "control": "Keine",
      "specialChar": "SC",
      "justification": "",
      "sev": "7",
      "occ": "7",
      "det": "7",
      "actions": [],
      "collapsed": true
    }
  ],
  "scales": {
    "sevHigh": "Kunde verärgert (eigener Text)",
    "ap.design.sev.10.meaning": "Gefahr für Leib und Leben (eigener Text)",
    "legacyNote": "unbekannter Schlüssel"
  }
});

/** Zeilen der Byte-Fixture (ohne BOM, ohne Zeilenende). */
export const LEGACY_CSV = [
  "sep=;",
  "\"#\";\"Prozessschritt\";\"Potenzieller Fehlermodus\";\"Potenzielle Fehlerfolge(n)\";\"Potenzielle Fehlerursache(n)\";\"Vermeidungsmaßnahme\";\"Entdeckungsmaßnahme\";\"Besonderes Merkmal\";\"Begründung (keine Maßnahme)\";\"S\";\"O\";\"D\";\"RPN\";\"AP\";\"Maßnahme\";\"Verantw.\";\"Zieldatum\";\"Umgesetzt\";\"ΔS\";\"ΔO\";\"ΔD\";\"Proj.S\";\"Proj.O\";\"Proj.D\";\"Proj.RPN\";\"Proj.AP\"",
  "\"1\";\"Wareneingang Gehäuse\";\"Falsches Material geliefert\";\"Gehäuse bricht im Feld\";\"Lieferant verwechselt Charge\";\"Materialzeugnis je Charge\";\"Stichprobe mit Spektrometer\";\"CC\";\"\";\"9\";\"4\";\"6\";\"216\";\"H\";\"Prüfanweisung um Spektralanalyse ergänzen\";\"QS\";\"2026-03-02\";\"Ja\";\"0\";\"2\";\"3\";\"9\";\"1\";\"3\";\"27\";\"L\"",
  "\"\";\"\";\"\";\"\";\"\";\"\";\"\";\"\";\"\";\"\";\"\";\"\";\"\";\"\";\"Lieferantenaudit \"\"Charge\"\"; Nachweis\";\"Einkauf\";\"2026-04-15\";\"Nein\";\"0\";\"1\";\"0\";\"\";\"\";\"\";\"\";\"\"",
  "\"2\";\"Montage Deckel\";\"Schraube nicht angezogen\";\"Deckel lose\";\"Akkuschrauber ohne Drehmomentkontrolle\";\"\";\"Sichtprüfung\";\"\";\"Altwert S 15 aus Import\";\"15\";\"3\";\"2\";\"90\";\"\";\"Drehmomentschrauber mit Quittierung\";\"Fertigung\";\"2026-03-20\";\"Ja\";\"0\";\"0\";\"3\";\"15\";\"3\";\"1\";\"45\";\"\"",
  "\"3\";\"Verpackung\";\"Etikett fehlt\";\"Rückverfolgung unmöglich\";\"Drucker leer\";\"Füllstandsanzeige\";\"Keine\";\"SC\";\"\";\"7\";\"7\";\"7\";\"343\";\"H\";\"\";\"\";\"\";\"\";\"\";\"\";\"\";\"7\";\"7\";\"7\";\"343\";\"H\""
];
