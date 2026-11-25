/**
 * TRIZ-Evolutionstrends: Beispiel.
 *
 * Das Beispiel `triz-evolution-trends-pkw-beleuchtung` liegt in der
 * Modulablage, lädt streng und ohne Reparatur, und System, Stufen und Notizen
 * gleichen dem `read()` der Altform (`uneven` ohne Stufenwahl: `-1`).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { setModelName } from '../../../js/core/model.js';
import { State } from '../../../js/modules/triz-evolution-trends/domain/model.js';

setModelName(State, 'triz-evolution-trends');

const BASE = '../../../js/modules/triz-evolution-trends/resources/examples/';
const FILE = 'projects/triz-evolution-trends-pkw-beleuchtung.json';

/** `read()` der Altform für das Beispiel. */
const LEGACY_READ = {
  system: 'Pkw-Beleuchtung (Hauptscheinwerfer)',
  trends: {
    aggregation: { stage: 2, notes: 'Heute: LED-Matrix (Poly). Nächste Stufe: integriertes Beleuchtungssystem mit Front-/Seitenlicht-Kopplung über eine gemeinsame Sensorik.' },
    dynamism: { stage: 1, notes: 'Heute: schwenkbare Module (gelenkig). Nächste Stufe: elastisch verformbare Lichtquelle / OLED-Folie, dann Feld-Lösung (Laser-Phosphor).' },
    scale: { stage: 1, notes: 'Heute: Meso (mm-LEDs). Nächste Stufe: Mikro-LED-Arrays für pixelgenaue Lichtverteilung.' },
    automation: { stage: 2, notes: 'Heute: automatisch (Sensor-Schalter, Fernlichtassistent). Nächste Stufe: autonome Beleuchtung, die Verkehrsteilnehmer einzeln ausblendet.' },
    completeness: { stage: 3, notes: 'Vollständig (Energie + Übertragung + Lichtquelle + Steuerung). Trend gesättigt — Fortschritt verlagert sich auf andere Linien.' },
    controllability: { stage: 2, notes: 'Adaptive Regelung (Kurvenlicht, Geschwindigkeit, Gegenverkehr). Nächste Stufe: lernend / kontextabhängig (Wetterdaten, Karten-Topografie).' },
    matching: { stage: 1, notes: 'Einstellbar (Höhenkorrektur, Fahrmodus). Nächste Stufe: individuelle Lichtsignatur pro Fahrer, dann selbstadaptierend an Sehprofil.' },
    uneven: { stage: -1, notes: 'Das Bordnetz (12 V-Architektur) ist auf Stand von 1980 — limitiert Leistung und Schaltgeschwindigkeit moderner LED-Matrix-Systeme.' },
  },
};

/** @param {string} relPath */
async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

const plain = (v) => JSON.parse(JSON.stringify(v));

suite('triz-evolution-trends: Beispiel', () => {
  test('das Beispiel steht in der Modulablage', async () => {
    const own = await fetchJson(`${BASE}examples.json`);
    assertDeepEqual(own.examples.map((e) => e.id), ['triz-evolution-trends-pkw-beleuchtung']);
    const [e] = own.examples;
    assertEqual(e.type, 'project');
    assertEqual(e.format, 'json');
    assertEqual(e.file, FILE);
    assertEqual(e.modules, undefined);
    assertTrue(!!e.title.de && !!e.title.en, 'Titel fehlt');
    assertTrue(!!e.description.de && !!e.description.en, 'Beschreibung fehlt');
  });

  test('pkw-beleuchtung: lädt streng ohne Reparatur, Werte wie in der Altform', async () => {
    const raw = await fetchJson(`${BASE}${FILE}`);
    assertDeepEqual(raw._schema, { name: 'triz-evolution-trends', version: '1.0' });
    assertDeepEqual(Object.keys(raw), ['_schema', 'system', 'trends']);
    assertDeepEqual(raw.trends.uneven.stage, -1);
    State.fromJSON(plain(raw));
    /** @type {string[]} */
    const repairs = [];
    const m = State.fromJSON(plain(raw), { repair: true, onRepair: (f) => repairs.push(f) });
    assertDeepEqual(repairs, []);
    assertDeepEqual({ system: m.system, trends: plain(m.trends) }, LEGACY_READ);
    assertEqual(Object.values(LEGACY_READ.trends).filter((t) => t.stage >= 0).length, 7);
    assertEqual(JSON.stringify(m.toJSON()), JSON.stringify(raw));
    assertTrue(m.hasContent(), 'hasContent');
  });
});
