/**
 * Tests for modules/triz-evolution-trends/domain/model.js — Schema und
 * Vorgaben, gespeicherte Stände '1.0' ohne Migrationsschritt (zeichengleich
 * zurück), Stände ohne `_schema` über '0→1.0', die Invariante `stageInScale`
 * beim Laden und Schreiben, das Kommando `setTrendStage`, Versionsprüfung,
 * Reparatur unlesbarer Stände, `hasContent` und das Beispiel am bisherigen Ort.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/triz-evolution-trends/domain/model.js';
import { TRENDS, stageCount } from '../../../js/modules/triz-evolution-trends/domain/trends.js';
import { setModelName } from '../../../js/core/model.js';
import { loadModel } from '../../../js/core/initial-model.js';

setModelName(State, 'triz-evolution-trends');

const IDS = ['aggregation', 'dynamism', 'scale', 'automation', 'completeness', 'controllability', 'matching', 'uneven'];
const SCHEMA = { _schema: { name: 'triz-evolution-trends', version: '1.0' } };
const EMPTY_TRENDS = Object.fromEntries(IDS.map((id) => [id, { stage: -1, notes: '' }]));

/** Zustand der Instanz aus der Fixture „Altprojekt“ (`legacy-project.json`). */
const LEGACY = {
  _schema: { name: 'triz-evolution-trends', version: '1.0' },
  system: 'Spritzgießwerkzeug für Türgriffe & Blenden <Serie "B">',
  trends: {
    aggregation: { stage: 3, notes: 'Heute: Familienwerkzeug mit vier Kavitäten.\nNächste Stufe: Werkzeug als Teil einer verketteten Zelle.' },
    dynamism: { stage: 4, notes: 'Schieber über Feld-Lösung (Induktion) — „ohne Mechanik“.' },
    scale: { stage: 0, notes: 'Makro: Bauteile > 200 mm.\nMikro-Strukturen nur als Oberfläche.' },
    automation: { stage: -1, notes: 'Noch nicht eingeordnet — Daten aus Schicht 2 & 3 fehlen.' },
    completeness: { stage: 2, notes: 'Motor + Übertragung + Werkzeug; Steuerung kommt von der Maschine.' },
    controllability: { stage: 1, notes: 'Ein Regelkreis für die Werkzeugtemperatur (Soll < 80 °C).' },
    matching: { stage: 2, notes: 'Einsätze je Variante tauschbar.\nRüstzeit ≈ 12 min.' },
    uneven: { stage: -1, notes: 'Kühlung hinkt hinterher: Bohrungen von 1995, Zykluszeit "steht".\nEngpass für jede weitere Kavität.' },
  },
};

const plain = (v) => JSON.parse(JSON.stringify(v));

/** @param {() => any} fn @returns {any} der geworfene Fehler oder null */
function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

/** Laden mit Reparatur; meldet die reparierten Felder. @param {object} json */
function repaired(json) {
  const fields = [];
  const m = State.fromJSON(json, { repair: true, onRepair: (f) => fields.push(f) });
  return { m, fields };
}

/** Das Altprojekt mit geänderten Trend-Einträgen. @param {Record<string, object>} patch */
function legacyWith(patch) {
  const j = plain(LEGACY);
  for (const [id, v] of Object.entries(patch)) j.trends[id] = { ...j.trends[id], ...v };
  return j;
}

suite('triz-evolution-trends Model — Schema und Vorgaben', () => {
  test('Felder system und trends, kein Ansichtsfeld, ein Kommando', () => {
    assertDeepEqual(Object.keys(State.schema.fields), ['system', 'trends']);
    assertEqual(State.schema.fields.system.kind, 'text');
    assertEqual(State.schema.fields.trends.kind, 'record');
    assertDeepEqual(Object.keys(State.schema.view), []);
    assertDeepEqual(Object.keys(State.schema.commands), ['setTrendStage']);
  });
  test('TRENDS gleicht den Schlüsseln im Schema und den ids des Kommandos', () => {
    assertDeepEqual(TRENDS.map((t) => t.id), IDS);
    assertDeepEqual([...State.schema.fields.trends.keys], IDS);
    assertDeepEqual([...State.schema.commands.setTrendStage.params.trendId.values], IDS);
  });
  test('Stufenzahlen wie in der Altform', () => {
    assertDeepEqual(TRENDS.map((t) => stageCount(t.id)), [4, 5, 4, 4, 4, 4, 4, 0]);
    assertEqual(stageCount('unbekannt'), 0);
  });
  test('Vorgabe je Trend { stage: -1, notes: "" }, System leer, kein Inhalt', () => {
    const m = new State();
    assertEqual(m.system, '');
    assertDeepEqual(plain(m.trends), EMPTY_TRENDS);
    assertEqual(m.hasContent(), false);
  });
  test('toJSON eines neuen Models: _schema, system, trends in Reihenfolge', () => {
    assertEqual(JSON.stringify(new State().toJSON()), JSON.stringify({ ...SCHEMA, system: '', trends: EMPTY_TRENDS }));
  });
});

suite('triz-evolution-trends Model — gespeicherter Stand 1.0', () => {
  test('Altprojekt lädt streng und ohne Reparatur', () => {
    const { m, fields } = repaired(plain(LEGACY));
    assertDeepEqual(fields, []);
    assertEqual(m.system, LEGACY.system);
    assertDeepEqual(plain(m.trends), LEGACY.trends);
    assertEqual(thrown(() => State.fromJSON(plain(LEGACY))), null);
  });
  test('toJSON des Altprojekts ist zeichengleich mit der Eingabe', () => {
    assertEqual(JSON.stringify(State.fromJSON(plain(LEGACY)).toJSON()), JSON.stringify(LEGACY));
  });
  test('Laden wie beim Einhängen ergibt denselben Stand', () => {
    assertEqual(JSON.stringify(loadModel(State, plain(LEGACY)).toJSON()), JSON.stringify(LEGACY));
  });
  test('Rundweg toJSON → fromJSON ist verlustfrei', () => {
    const m = State.fromJSON(plain(LEGACY));
    assertDeepEqual(State.fromJSON(plain(m.toJSON())).toJSON(), m.toJSON());
  });
});

suite('triz-evolution-trends Model — Invariante stageInScale', () => {
  test('aggregation 4 wirft streng und heilt mit Reparatur auf -1, die Notiz bleibt', () => {
    const bad = legacyWith({ aggregation: { stage: 4 } });
    const err = thrown(() => State.fromJSON(bad));
    assertTrue(err instanceof Error);
    assertEqual(err.invariant, 'stageInScale');
    const { m, fields } = repaired(plain(bad));
    assertDeepEqual(fields, ['trends']);
    assertDeepEqual(plain(m.trends.aggregation), { stage: -1, notes: LEGACY.trends.aggregation.notes });
  });
  test('Reparatur heilt nur die verletzten Trends, die übrigen bleiben', () => {
    const { m } = repaired(legacyWith({ aggregation: { stage: 4 }, uneven: { stage: 0 } }));
    assertDeepEqual(plain(m.trends), {
      ...LEGACY.trends,
      aggregation: { stage: -1, notes: LEGACY.trends.aggregation.notes },
      uneven: { stage: -1, notes: LEGACY.trends.uneven.notes },
    });
    assertEqual(m.system, LEGACY.system);
  });
  test('uneven 0 heilt beim Laden wie beim Einhängen auf -1, die Notiz bleibt', () => {
    const m = loadModel(State, legacyWith({ uneven: { stage: 0 } }));
    assertDeepEqual(plain(m.trends.uneven), LEGACY.trends.uneven);
    assertEqual(m.trends.dynamism.stage, 4);
  });
  test('Schreiben des ganzen Felds mit Stufe außerhalb der Skala wird abgelehnt, nichts geändert', () => {
    const m = State.fromJSON(plain(LEGACY));
    for (const patch of [{ aggregation: { stage: 4 } }, { uneven: { stage: 0 } }]) {
      const next = legacyWith(patch).trends;
      const err = thrown(() => { m.trends = next; });
      assertTrue(err instanceof Error);
      assertEqual(err.param, 'trends');
      assertEqual(err.invariant, 'stageInScale');
      assertDeepEqual(plain(m.trends), LEGACY.trends);
    }
  });
  test('Schreiben des ganzen Felds mit gültigen Stufen geht', () => {
    const m = State.fromJSON(plain(LEGACY));
    m.trends = legacyWith({ aggregation: { stage: 0 }, dynamism: { stage: -1 } }).trends;
    assertEqual(m.trends.aggregation.stage, 0);
    assertEqual(m.trends.dynamism.stage, -1);
  });
});

suite('triz-evolution-trends Model — setTrendStage', () => {
  test('gültige Stufe wird gesetzt, die Notiz bleibt', () => {
    const m = State.fromJSON(plain(LEGACY));
    m.setTrendStage({ trendId: 'automation', stage: 3 });
    assertDeepEqual(plain(m.trends.automation), { stage: 3, notes: LEGACY.trends.automation.notes });
  });
  test('über execute', () => {
    const m = new State();
    m.execute({ type: 'setTrendStage', trendId: 'dynamism', stage: 4 });
    assertEqual(m.trends.dynamism.stage, 4);
  });
  test('-1 nimmt die Einordnung zurück', () => {
    const m = State.fromJSON(plain(LEGACY));
    m.setTrendStage({ trendId: 'aggregation', stage: -1 });
    assertEqual(m.trends.aggregation.stage, -1);
  });
  test('unbekannter Trend wird mit param trendId abgelehnt', () => {
    const m = State.fromJSON(plain(LEGACY));
    const err = thrown(() => m.setTrendStage({ trendId: /** @type {any} */ ('foo'), stage: 0 }));
    assertTrue(err instanceof Error);
    assertEqual(err.param, 'trendId');
    assertDeepEqual(plain(m.trends), LEGACY.trends);
  });
  test('Stufe außerhalb der Skala wird abgelehnt, Zustand unverändert', () => {
    const m = State.fromJSON(plain(LEGACY));
    const err = thrown(() => m.setTrendStage({ trendId: 'aggregation', stage: 4 }));
    assertTrue(err instanceof Error);
    assertEqual(err.param, 'trends');
    assertEqual(err.invariant, 'stageInScale');
    assertDeepEqual(plain(m.trends), LEGACY.trends);
  });
  test('uneven mit Stufe ≥ 0 wird abgelehnt, Zustand unverändert', () => {
    const m = State.fromJSON(plain(LEGACY));
    const err = thrown(() => m.setTrendStage({ trendId: 'uneven', stage: 0 }));
    assertTrue(err instanceof Error);
    assertEqual(err.invariant, 'stageInScale');
    assertEqual(m.trends.uneven.stage, -1);
  });
  test('uneven mit -1 geht', () => {
    const m = State.fromJSON(plain(LEGACY));
    m.setTrendStage({ trendId: 'uneven', stage: -1 });
    assertEqual(m.trends.uneven.stage, -1);
  });
  test('Stufe kleiner -1 oder nicht ganzzahlig wird mit param stage abgelehnt', () => {
    const m = State.fromJSON(plain(LEGACY));
    for (const stage of [-2, 1.5]) {
      const err = thrown(() => m.setTrendStage({ trendId: 'aggregation', stage }));
      assertTrue(err instanceof Error, String(stage));
      assertEqual(err.param, 'stage');
    }
    assertEqual(m.trends.aggregation.stage, 3);
  });
});

suite('triz-evolution-trends Model — Stand ohne _schema und Versionsprüfung', () => {
  test('ohne _schema läuft 0→1.0: Stufe "2" → 2, fremder Trend entfällt, uneven ohne Stufe → -1', () => {
    const { _schema, ...rest } = plain(LEGACY);
    rest.trends.aggregation.stage = '2';
    delete rest.trends.uneven.stage;
    rest.trends.foo = { stage: 1, notes: 'weg' };
    const m = State.fromJSON(rest);
    assertEqual(JSON.stringify(m.toJSON()), JSON.stringify(legacyWith({ aggregation: { stage: 2 } })));
  });
  test('ohne _schema: Stufe außerhalb der Skala → -1', () => {
    const { _schema, ...rest } = legacyWith({ aggregation: { stage: 9 }, uneven: { stage: 0 } });
    const m = State.fromJSON(rest);
    assertEqual(m.trends.aggregation.stage, -1);
    assertEqual(m.trends.uneven.stage, -1);
  });
  test('{} lädt als leeres Model', () => {
    const m = State.fromJSON({});
    assertDeepEqual(plain(m.trends), EMPTY_TRENDS);
    assertEqual(m.hasContent(), false);
  });
  test('höhere Version 2.0 wird abgewiesen, auch mit Reparatur und beim Einhängen', () => {
    const v2 = { ...plain(LEGACY), _schema: { name: 'triz-evolution-trends', version: '2.0' } };
    assertThrows(() => State.fromJSON(v2), /_schema\.version/);
    assertThrows(() => State.fromJSON(v2, { repair: true }), /_schema\.version/);
    assertThrows(() => loadModel(State, v2), /_schema\.version/);
  });
  test('unlesbare Version wird abgewiesen', () => {
    assertThrows(() => State.fromJSON({ ...plain(LEGACY), _schema: { version: 'x' } }), /_schema\.version/);
  });
});

suite('triz-evolution-trends Model — unlesbare Einträge in 1.0 (ganzes Feld trends fällt zurück)', () => {
  const cases = [
    ['fehlender Trend', (j) => { delete j.trends.matching; }],
    ['fremder Trend', (j) => { j.trends.foo = { stage: 0, notes: '' }; }],
    ['fehlende Stufe', (j) => { delete j.trends.uneven.stage; }],
    ['Stufe als Text ohne Zahl', (j) => { j.trends.aggregation.stage = 'zwei'; }],
    ['Stufe null', (j) => { j.trends.aggregation.stage = null; }],
    ['Stufe nicht ganzzahlig', (j) => { j.trends.aggregation.stage = 2.5; }],
    ['Stufe kleiner -1', (j) => { j.trends.aggregation.stage = -3; }],
    ['Notiz kein Text', (j) => { j.trends.aggregation.notes = 42; }],
  ];
  for (const [name, mutate] of cases) {
    test(`${name}: wirft streng; mit Reparatur wird trends Vorgabe, system bleibt`, () => {
      const j = plain(LEGACY);
      mutate(j);
      assertTrue(thrown(() => State.fromJSON(plain(j))) instanceof Error);
      const { m, fields } = repaired(j);
      assertDeepEqual(fields, ['trends']);
      assertDeepEqual(plain(m.trends), EMPTY_TRENDS);
      assertEqual(m.system, LEGACY.system);
    });
  }
});

suite('triz-evolution-trends Model — Stufe als Zahltext in 1.0', () => {
  test('"2" lädt streng als Zahl 2, ohne Reparatur', () => {
    const { m, fields } = repaired(legacyWith({ aggregation: { stage: '2' } }));
    assertDeepEqual(fields, []);
    assertEqual(m.trends.aggregation.stage, 2);
    assertEqual(State.fromJSON(legacyWith({ aggregation: { stage: '2' } })).trends.aggregation.stage, 2);
  });
});

suite('triz-evolution-trends Model — hasContent', () => {
  test('System gesetzt → true', () => {
    assertEqual(State.fromJSON({ ...SCHEMA, system: 'X' }).hasContent(), true);
  });
  test('eine Stufe ≥ 0 → true', () => {
    const m = new State();
    m.setTrendStage({ trendId: 'aggregation', stage: 0 });
    assertEqual(m.hasContent(), true);
  });
  test('eine Notiz → true', () => {
    const m = new State();
    m.trends = { ...EMPTY_TRENDS, uneven: { stage: -1, notes: 'x' } };
    assertEqual(m.hasContent(), true);
  });
  test('Stufe -1 und keine Notiz → false', () => {
    const m = new State();
    m.setTrendStage({ trendId: 'aggregation', stage: -1 });
    assertEqual(m.hasContent(), false);
  });
});

suite('triz-evolution-trends Model — Beispiel am bisherigen Ort', () => {
  test('pkw-beleuchtung (ohne _schema, uneven ohne Stufe) lädt über 0→1.0', async () => {
    const url = new URL('../../../examples/projects/triz-evolution-trends-pkw-beleuchtung.json', import.meta.url);
    const res = await fetch(url, { cache: 'no-cache' });
    assertTrue(res.ok, `could not fetch example: HTTP ${res.status}`);
    const file = await res.json();
    assertEqual(file._schema, undefined);
    assertEqual(Object.hasOwn(file.trends.uneven, 'stage'), false);
    const { m, fields } = repaired(file);
    assertDeepEqual(fields, []);
    assertEqual(m.system, file.system);
    assertDeepEqual(IDS.map((id) => m.trends[id].stage), [2, 1, 1, 2, 3, 2, 1, -1]);
    for (const id of IDS) assertEqual(m.trends[id].notes, file.trends[id].notes, id);
    const withStage = plain(file);
    withStage.trends.uneven = { stage: -1, notes: file.trends.uneven.notes };
    assertEqual(JSON.stringify(m.toJSON()), JSON.stringify({ ...SCHEMA, ...withStage }));
  });
});
