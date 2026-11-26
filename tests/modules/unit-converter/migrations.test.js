/**
 * Tests for modules/unit-converter/domain/migrations.js — '0→1.0' übernimmt
 * jeden Stand des alten `State.fromJSON` (Texte, Zeitzonen als Position,
 * auch als Ganzzahltext der Erstform; leeres Datum wird heute), das goldene
 * Fixture v0.3.0 (Größenart und Zeitzonen der Datei gab es nie: Vorgaben) und die
 * Instanzen des Altprojekts über das Model; ein '1.0'-Stand mit Reparatur.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { from0 } from '../../../js/modules/unit-converter/domain/migrations.js';
import { State } from '../../../js/modules/unit-converter/domain/model.js';
import { setModelName } from '../../../js/core/model.js';
import { todayISO } from '../../../js/core/local-date.js';

setModelName(State, 'unit-converter');

const SCHEMA = { _schema: { name: 'unit-converter', version: '1.0' } };
const FIXTURES = new URL('../../fixtures/exports/', import.meta.url);
const plain = (v) => JSON.parse(JSON.stringify(v));

/** @param {URL} url @returns {Promise<any>} */
async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${url}: HTTP ${res.status}`);
  return res.json();
}

/** Laden mit Reparatur wie der Kern. @param {object} j */
const load = (j) => plain(State.fromJSON(plain(j), { repair: true }));

/** Alle Zustände des Moduls in einem Export. @param {any} v @param {any[]} [acc] @returns {any[]} */
function states(v, acc = []) {
  if (Array.isArray(v)) v.forEach((x) => states(x, acc));
  else if (v && typeof v === 'object') {
    if (v.phases && v.moduleStates) {
      for (const list of Object.values(v.phases)) {
        for (const e of Array.isArray(list) ? list : []) {
          if (e?.moduleId === 'unit-converter') acc.push(v.moduleStates[e.instanceId] ?? e.state);
        }
      }
    } else Object.values(v).forEach((x) => states(x, acc));
  }
  return acc;
}

suite('unit-converter Migration 0→1.0', () => {
  test('Texte bleiben, Fremdes wird die Vorgabe, fremde Schlüssel entfallen', () => {
    assertDeepEqual(from0({ activeCat: 'masse', fromUnit: 'kg', toUnit: 'g', inputVal: '2,5', tzFrom: 4, tzTo: 13, tzTime: '08:15', tzDate: '2026-03-02', extra: 1 }),
      { activeCat: 'masse', fromUnit: 'kg', toUnit: 'g', inputVal: '2,5', tzFrom: 4, tzTo: 13, tzTime: '08:15', tzDate: '2026-03-02' });
    assertDeepEqual(from0({ activeCat: 3, fromUnit: null, inputVal: 5, tzTime: 1 }),
      { activeCat: 'laenge', fromUnit: '', toUnit: '', inputVal: '', tzFrom: 1, tzTo: 0, tzTime: '12:00' });
    assertDeepEqual(from0(null), from0({}));
    assertDeepEqual(from0([1]), from0({}));
  });

  test('Zeitzonen als Ganzzahltext der Erstform werden Positionen', () => {
    const o = from0({ tzFrom: '5', tzTo: '13' });
    assertEqual(o.tzFrom, 5);
    assertEqual(o.tzTo, 13);
    assertEqual(from0({ tzFrom: '23' }).tzFrom, 1);
    assertEqual(from0({ tzFrom: '1.5', tzTo: 'Europe/Berlin' }).tzFrom, 1);
    assertEqual(from0({ tzTo: 'America/New_York' }).tzTo, 0);
  });

  test('leeres Datum entfällt, die Vorgabe setzt heute', () => {
    assertTrue(!Object.hasOwn(from0({ tzDate: '' }), 'tzDate'));
    assertEqual(load({ tzDate: '' }).tzDate, todayISO());
  });

  test('über das Model: unbekannte Größenart und Einheiten wie das alte fromJSON', () => {
    const m = load({ activeCat: 'time', fromUnit: 'h', toUnit: 'min', inputVal: '42', tzFrom: '5', tzTo: '13', tzTime: '08:15', tzDate: '' });
    assertDeepEqual(m, { ...SCHEMA, activeCat: 'laenge', fromUnit: 'nm', toUnit: 'um', inputVal: '42', tzFrom: 5, tzTo: 13, tzTime: '08:15', tzDate: todayISO() });
  });

  test('Golden v0.3.0: Vorgaben, nur Wert, Uhrzeit und Datum bleiben', async () => {
    const found = states(await fetchJSON(new URL('v0.3.0_single_project.json', FIXTURES)));
    assertEqual(found.length, 1);
    assertDeepEqual(load(found[0]), {
      ...SCHEMA, activeCat: 'laenge', fromUnit: 'nm', toUnit: 'um', inputVal: '12.4',
      tzFrom: 1, tzTo: 0, tzTime: '09:00', tzDate: '2026-05-02',
    });
  });

  test('Altprojekt: (a) 1.0 repariert, (b) Erstform', () => {
    const a = { ...SCHEMA, activeCat: 'laborwerte', fromUnit: 'mgdl_ch', toUnit: 'mmoll_bz', inputVal: '1.234,5', tzFrom: 5, tzTo: 17, tzTime: '23:30', tzDate: '2026-03-29' };
    const b = { activeCat: 'time', fromUnit: 'h', toUnit: 'min', inputVal: '42', tzFrom: '5', tzTo: '13', tzTime: '08:15', tzDate: '' };
    assertDeepEqual(load(a), { ...a, toUnit: 'mmoll_ch' });
    assertDeepEqual(load(b), { ...SCHEMA, activeCat: 'laenge', fromUnit: 'nm', toUnit: 'um', inputVal: '42', tzFrom: 5, tzTo: 13, tzTime: '08:15', tzDate: todayISO() });
  });

  test('Stand 1.0 läuft ohne Migration, Reparatur nur am Ungültigen', () => {
    const j = { ...SCHEMA, activeCat: 'masse', fromUnit: 'kg', toUnit: 'cm', inputVal: 'x', tzFrom: 30, tzTo: 2, tzTime: '7:00', tzDate: '2026-06-01' };
    assertDeepEqual(load(j), { ...SCHEMA, activeCat: 'masse', fromUnit: 'kg', toUnit: 'mg', inputVal: 'x', tzFrom: 1, tzTo: 2, tzTime: '', tzDate: '2026-06-01' });
  });
});
