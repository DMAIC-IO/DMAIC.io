/**
 * Process Map Export gegen die Byte-Fixtures der Altform (Task 0, Altprojekt,
 * de): CSV „bis auf das Kernformat“, XLSX-Zellen, JSON mit festem
 * Zeitstempel. Einzige Abweichung im Inhalt: das Vorwärtsziel von „Backen“
 * heilt die Migration zu „kein Ziel“.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/process-map/domain/model.js';
import { toRows, toExportJSON, XLSX_SHEET } from '../../../js/modules/process-map/io/export.js';

const LEGACY_ID = '5c2e9a71-4b3d-4f80-9e16-7a0d3c8b2f41';

async function fetchText(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.text()).replace(/^\uFEFF/, '');
}

/** Übersetzer aus ui.de.json mit `{param}`-Ersetzung. */
async function translator() {
  const ui = JSON.parse(await fetchText('../../../js/modules/process-map/resources/i18n/ui.de.json'));
  return (/** @type {string} */ key, /** @type {Record<string, unknown>} */ params = {}) =>
    String(ui[key] ?? key).replace(/\{(\w+)\}/g, (_, p) => String(params[p] ?? `{${p}}`));
}

/** @returns {Promise<any>} das migrierte Altprojekt */
async function legacyModel() {
  const project = JSON.parse(await fetchText('./legacy-project.json'));
  return State.fromJSON(project.moduleStates[LEGACY_ID], { repair: true });
}

/** CSV der Altform (`sep=;`, alles in Anführungszeichen) als Zeilen von Texten. */
function parseLegacyCsv(text) {
  const lines = text.split('\n').filter((l) => l !== '' && l !== 'sep=;');
  return lines.map((l) => l.split(';').map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"')));
}

suite('Process Map Export — Tabelle (CSV/XLSX)', () => {
  test('CSV: Kopf, Reihenfolge und Inhalt wie die Altform; Schrittnummer als Zahl', async () => {
    const t = await translator();
    const rows = toRows((await legacyModel()).steps, t);
    const legacy = parseLegacyCsv(await fetchText('./legacy-export.csv'));
    legacy[5][6] = 'Zu dunkel';
    assertDeepEqual(rows.map((r) => r.map(String)), legacy);
    assertEqual(rows[1][0], 1);
    assertEqual(rows[2][0], '1.1');
  });

  test('XLSX: Zellen und Zelltypen wie die Altform, Blatt „Process Map“', async () => {
    const t = await translator();
    const rows = toRows((await legacyModel()).steps, t);
    const legacy = JSON.parse(await fetchText('./legacy-export-xlsx.json'));
    assertDeepEqual(legacy.sheetNames, [XLSX_SHEET]);
    legacy.rows[5][6].v = 'Zu dunkel';
    assertDeepEqual(rows.map((r) => r.map((v) => ({ t: typeof v === 'number' ? 'n' : 's', v }))), legacy.rows);
  });

  test('Loop-Spalte mit gültigem Ziel: „→ Schritt NN“ aus csvLoopTarget', async () => {
    const t = await translator();
    const rows = toRows((await legacyModel()).steps, t);
    assertEqual(rows[4][6], 'Teig gerissen → Schritt 01 [Neu kneten, Ruhen lassen]');
  });

  test('ohne Schritte nur der Kopf', async () => {
    const t = await translator();
    assertEqual(toRows([], t).length, 1);
  });
});

suite('Process Map Export — JSON', () => {
  test('toExportJSON gleicht der Altform bis auf das Vorwärtsziel (timestamp fest)', async () => {
    const legacy = JSON.parse((await fetchText('./legacy-export.json')));
    legacy.steps[2].loop.targetStep = null;
    assertDeepEqual(JSON.parse(JSON.stringify(toExportJSON((await legacyModel()).steps, '<masked>'))), legacy);
  });
});
