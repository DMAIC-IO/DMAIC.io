/**
 * Makigami: Exporte (io/export.js, io/svg.js) gegen die Byte-Fixtures der
 * Altform (Instanz (a) des Altprojekts, de, hell): JSON und SVG
 * zeichengleich, CSV Zelle für Zelle (bis auf das Kernformat).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import {
  fileNameBase, toLegacyJSON, stepRows, matrixRows, kpiRows, stepLabel,
} from '../../../js/modules/makigami/io/export.js';
import { matrixSVG } from '../../../js/modules/makigami/io/svg.js';
import { exportColors, THEME_VAR } from '../../../js/modules/makigami/domain/theme.js';
import { State } from '../../../js/modules/makigami/domain/model.js';
import { formatDuration } from '../../../js/modules/makigami/domain/duration.js';
import { setModelName } from '../../../js/core/model.js';
import { toJsonText } from '../../../js/core/exporter.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { formatNumber } from '../../../js/core/number-format.js';

setModelName(State, 'makigami');

const A = '5b1c7d20-3e4f-4a51-9c62-0d7e8f9a1b01';
const plain = (v) => JSON.parse(JSON.stringify(v));

/** @param {string} name @returns {Promise<string>} */
async function fixtureText(name) {
  const res = await fetch(new URL(`./${name}`, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.text();
}

async function legacyA() {
  const project = JSON.parse(await fixtureText('legacy-project.json'));
  return State.fromJSON(plain(project.moduleStates[A]), { repair: true });
}

async function uiDe() {
  const res = await fetch(new URL('../../../js/modules/makigami/resources/i18n/ui.de.json', import.meta.url), { cache: 'no-cache' });
  return res.json();
}

/** Der Name einer Art wie in der Anzeige: eigener Name, sonst übersetzter, sonst Kürzel. */
const mudaLabel = (t) => (c) => c.label || (c.labelKey ? t.muda[c.labelKey.slice('muda.'.length)] : '') || c.code || '';

/**
 * CSV der Altform in Zellen: Komma, Felder in Anführungszeichen mit `""`,
 * Zeilenende CRLF (ein LF innerhalb eines Feldes bleibt).
 * @param {string} text @returns {string[][]}
 */
function parseLegacyCsv(text) {
  const rows = [[]];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { rows.at(-1).push(cell); cell = ''; } else if (ch === '\r' && text[i + 1] === '\n') {
      rows.at(-1).push(cell); cell = ''; rows.push([]); i++;
    } else cell += ch;
  }
  rows.at(-1).push(cell);
  return rows;
}

suite('makigami Export — JSON, CSV, Tabellen', () => {
  test('Dateiname aus dem Titel wie in der Altform', () => {
    assertEqual(fileNameBase('Reklamation & Gutschrift <Q4>'), 'reklamation-gutschrift-q4');
    assertEqual(fileNameBase(''), 'makigami');
    assertEqual(fileNameBase('Ümläut'), 'ml-ut');
    assertEqual(fileNameBase('!!!'), 'makigami');
  });
  test('tree(): zeichengleich mit legacy-export.json', async () => {
    const m = await legacyA();
    assertEqual(toJsonText(toLegacyJSON(m)), await fixtureText('legacy-export.json'));
  });
  test('tree(): ein neuer Stand hat expanded true und settingsOpen false', () => {
    const m = new State();
    const id = m.addStep({});
    const out = /** @type {any} */ (toLegacyJSON(m));
    assertEqual(out.steps[0].expanded, true);
    assertEqual(out.steps[0].id, id);
    assertEqual(out.settingsOpen, false);
    assertEqual(Object.hasOwn(out.mudaCategories[0], 'labelKey'), true);
  });
  test('table(): dieselben Zellen wie legacy-export.csv (BOM, Komma und CRLF sind Kernformat)', async () => {
    const m = await legacyA();
    const t = await uiDe();
    const rows = stepRows(m, {
      header: [t.exportColStep, t.exportColActivity, t.exportColRoles, t.exportColProcess, t.exportColWait, t.exportColMuda, t.exportColNotes],
      rolePlaceholder: t.rolePlaceholder,
      mudaLabel: mudaLabel(t),
    });
    const legacy = parseLegacyCsv((await fixtureText('legacy-export.csv')).replace(/^\uFEFF/, ''));
    assertDeepEqual(rows, legacy);
  });
  test('Matrixblatt: Kopf mit Schritten, Marke je Mitwirkung, Platzhalter für Rollen ohne Namen', async () => {
    const m = await legacyA();
    const rows = matrixRows(m, { rolePlaceholder: 'Rolle…', mark: 'x' });
    assertDeepEqual(rows[0], ['', 'S1: Reklamation erfassen', 'S2: Ware prüfen und Gutachten vom Labor anfordern', 'S3', 'S4: Gutschrift buchen']);
    assertDeepEqual(rows.slice(1), [
      ['Kunde', 'x', '', '', ''],
      ['Sachbearbeitung Reklamationsmanagement', 'x', '', '', 'x'],
      ['Rolle…', '', 'x', '', ''],
    ]);
    assertDeepEqual(kpiRows(['a', 'b'], ['1', '2']), [['a', '1'], ['b', '2']]);
    assertEqual(stepLabel({ title: '' }, 2), 'S3');
  });
});

suite('makigami Export — Bild', () => {
  test('matrixSVG: zeichengleich mit legacy-export.svg (Farben des hellen Themas)', async () => {
    const m = await legacyA();
    const t = await uiDe();
    const { kpi } = /** @type {any} */ (evaluateDerived(m, /** @type {any} */ (undefined), ['kpi']));
    const time = (s) => formatDuration(s, m.timeUnits);
    const svg = matrixSVG(m, {
      corner: `${t.rolesHeaderRows} / ${t.rolesHeaderCols}`,
      rolePlaceholder: t.rolePlaceholder,
      kpiLabels: [t.kpiProcess, t.kpiWait, t.kpiLead, t.kpiPCE],
      kpiValues: [time(kpi.process), time(kpi.wait), time(kpi.lead), `${formatNumber(kpi.pce * 100, 'de', { decimals: 1 })} %`],
    }, exportColors({
      bg: '#fff', bgSec: '#f5f5f7', border: '#d2d2d7', text: '#1d1d1f', muted: '#6e6e73', accent: '#06c', accentBg: '#e5f0ff',
    }));
    assertEqual(svg, await fixtureText('legacy-export.svg'));
  });
  test('ohne Rollen oder Schritte ein Strich; Breite und Höhe wie die Altform', () => {
    const svg = matrixSVG({ roles: [], steps: [] }, {
      corner: 'R / S', rolePlaceholder: '', kpiLabels: ['a', 'b', 'c', 'd'], kpiValues: ['—', '—', '—', '—'],
    }, exportColors({}));
    assertEqual(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="350" height="160"'), true);
    assertEqual(svg.includes('text-anchor="middle">—</text>'), true);
  });
  test('Farben: leere Variablen fallen auf den Rückfall, jede Rolle hat eine Variable', () => {
    const c = exportColors({ bg: '  ', accent: '#123' });
    assertEqual(c.bg, '#ffffff');
    assertEqual(c.accent, '#123');
    assertDeepEqual(Object.keys(c), Object.keys(THEME_VAR));
  });
});
