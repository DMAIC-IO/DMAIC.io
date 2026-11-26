/**
 * Tests for modules/lessons-learned/io/export.js — der JSON-Export gleicht
 * dem Download der Altform zeichengleich (Byte-Fixture `export-legacy.json`
 * aus Instanz (c) des Altprojekts, `JSON.stringify(…, null, 2)`, ohne BOM und
 * ohne Zeilenende); leer `[]`.
 */
import { suite, test, assertEqual } from '../../test-utils.js';
import { toExport } from '../../../js/modules/lessons-learned/io/export.js';
import { State } from '../../../js/modules/lessons-learned/domain/model.js';
import { setModelName } from '../../../js/core/model.js';

setModelName(State, 'lessons-learned');

/** Die Byte-Fixture, Zeile für Zeile. */
const FIXTURE = [
  "[",
  "  {",
  "    \"id\": \"c1\",",
  "    \"title\": \"Rüstzeit halbiert durch SMED\",",
  "    \"category\": \"success\",",
  "    \"phase\": \"improve\",",
  "    \"impact\": \"high\",",
  "    \"owner\": \"M. Müller\",",
  "    \"description\": \"Rüsten von 40 auf 18 min & ohne Nacharbeit.\",",
  "    \"rootCause\": \"Interne und externe Tätigkeiten waren nicht getrennt.\",",
  "    \"recommendation\": \"SMED-Workshop für Linie 2 „vorziehen“.\",",
  "    \"actions\": [",
  "      {",
  "        \"text\": \"Standard für Linie 2 schreiben\",",
  "        \"done\": false",
  "      },",
  "      {",
  "        \"text\": \"Werkzeugwagen beschaffen\",",
  "        \"done\": true",
  "      }",
  "    ],",
  "    \"createdAt\": 1780488000000,",
  "    \"updatedAt\": 1780660800000",
  "  },",
  "  {",
  "    \"id\": \"c2\",",
  "    \"title\": \"Lieferant meldet Abweichungen zu spät\",",
  "    \"category\": \"problem\",",
  "    \"phase\": \"control\",",
  "    \"impact\": \"medium\",",
  "    \"owner\": \"Einkauf\",",
  "    \"description\": \"\",",
  "    \"rootCause\": \"Kein vereinbarter Meldeweg.\",",
  "    \"recommendation\": \"\",",
  "    \"actions\": [",
  "      {",
  "        \"text\": \"Meldeweg vertraglich festlegen\",",
  "        \"done\": false",
  "      }",
  "    ],",
  "    \"createdAt\": 1780315200000,",
  "    \"updatedAt\": 1780315200000",
  "  }",
  "]",
].join('\n');

/** Instanz (c) des Altprojekts (ohne `_schema`). */
const LEGACY_C = JSON.parse(FIXTURE);

suite('lessons-learned export — JSON wie die Altform', () => {
  test('gleich der Byte-Fixture, über das Model geladen', () => {
    const m = State.fromJSON({ lessons: JSON.parse(JSON.stringify(LEGACY_C)) });
    assertEqual(JSON.stringify(toExport(m.lessons), null, 2), FIXTURE);
  });
  test('Schlüsselfolge fest, auch bei anders geordneter Eingabe', () => {
    const shuffled = LEGACY_C.map((l) => Object.fromEntries(Object.entries(l).reverse()));
    assertEqual(JSON.stringify(toExport(shuffled), null, 2), FIXTURE);
  });
  test('leer: []', () => {
    assertEqual(JSON.stringify(toExport([]), null, 2), '[]');
  });
});
