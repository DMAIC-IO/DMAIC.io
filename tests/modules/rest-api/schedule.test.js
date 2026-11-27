/**
 * REST API: Zeitplan (domain/schedule.js) und Header-Maskierung
 * (domain/headers.js) — Abstand, nächster Abruf, Abgleich der Zeitgeber,
 * Wechsel des Schalters, Anzeigename.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import {
  SCHEDULE_UNITS, WRITE_MODES, intervalMs, nextRunAt, wantsTimer, scheduleEntries, diffSchedules,
  toggledSchedules, endpointLabel,
} from '../../../js/modules/rest-api/domain/schedule.js';
import {
  MASK, isSecretHeader, redactHeaders, redactEndpoints, unmaskedValue,
} from '../../../js/modules/rest-api/domain/headers.js';
import { State } from '../../../js/modules/rest-api/domain/model.js';

/** Ein Endpunkt mit Zeitplan. */
const ep = (id, { url = 'u', enabled = true, intervalValue = 5, intervalUnit = 'minutes', name = '' } = {}) => ({
  id, name, url, schedule: { enabled, intervalValue, intervalUnit },
});

suite('rest-api Zeitplan', () => {
  test('Listen gleichen dem Schema', () => {
    const shape = State.schema.fields.endpoints.item.shape;
    assertDeepEqual([...WRITE_MODES], [...shape.writeMode.values]);
    assertDeepEqual([...SCHEDULE_UNITS], [...shape.schedule.shape.intervalUnit.values]);
  });
  test('Abstand in Millisekunden', () => {
    assertEqual(intervalMs({ enabled: true, intervalValue: 1, intervalUnit: 'minutes' }), 60000);
    assertEqual(intervalMs({ enabled: true, intervalValue: 2, intervalUnit: 'hours' }), 7200000);
    assertEqual(intervalMs({ enabled: false, intervalValue: 999, intervalUnit: 'hours' }), 999 * 3600000);
  });
  test('nächster Abruf: ab letztem Abruf, sonst ab Start', () => {
    const s = { enabled: true, intervalValue: 1, intervalUnit: 'minutes' };
    assertEqual(nextRunAt(null, 1000, s), 61000);
    assertEqual(nextRunAt(5000, 1000, s), 65000);
  });
  test('Zeitgeber nur mit Schalter an und URL', () => {
    assertTrue(wantsTimer(ep('a')));
    assertTrue(!wantsTimer(ep('a', { url: '' })));
    assertTrue(!wantsTimer(ep('a', { enabled: false })));
    assertDeepEqual(scheduleEntries([ep('a'), ep('b', { url: '' }), ep('c', { intervalUnit: 'hours', intervalValue: 1 })]),
      [{ id: 'a', ms: 300000 }, { id: 'c', ms: 3600000 }]);
  });
  test('Abgleich: starten, stoppen, mit neuem Abstand neu starten, sonst nichts', () => {
    const running = new Map([['a', 300000], ['b', 60000], ['c', 60000]]);
    const d = diffSchedules(running, [{ id: 'a', ms: 300000 }, { id: 'c', ms: 120000 }, { id: 'd', ms: 60000 }]);
    assertDeepEqual(d, { start: [{ id: 'd', ms: 60000 }], stop: ['b'], restart: [{ id: 'c', ms: 120000 }] });
    assertDeepEqual(diffSchedules(new Map(), []), { start: [], stop: [], restart: [] });
  });
  test('Wechsel des Schalters nur bei Endpunkten aus beiden Ständen', () => {
    const before = new Map([['a', false], ['b', true], ['c', true]]);
    assertDeepEqual(toggledSchedules(before, [ep('a'), ep('b', { enabled: false }), ep('c'), ep('neu')]),
      [{ id: 'a', enabled: true }, { id: 'b', enabled: false }]);
  });
  test('Anzeigename: Name, sonst URL, sonst Ersatz', () => {
    assertEqual(endpointLabel({ name: 'N', url: 'u' }, 'X'), 'N');
    assertEqual(endpointLabel({ name: '', url: 'u' }, 'X'), 'u');
    assertEqual(endpointLabel({ name: '', url: '' }, 'X'), 'X');
  });
});

suite('rest-api Header-Maskierung', () => {
  test('geheime Namen: feste Liste und Namensteile, ohne Groß/klein und Rand', () => {
    for (const n of ['Authorization', 'proxy-authorization', ' COOKIE ', 'X-API-Key', 'X-Auth-User', 'x-session-token',
      'Client-Secret', 'apikey', 'X-Key']) assertTrue(isSecretHeader(n), n);
    for (const n of ['Accept', 'Content-Type', 'X-Trace', '', '   ', 'Keep-Alive']) assertTrue(!isSecretHeader(n), JSON.stringify(n));
  });
  test('Werte geheimer Header werden Platzhalter, leere bleiben leer, andere unverändert; Kopie', () => {
    const headers = [
      { key: 'Authorization', value: 'Bearer abc' }, { key: 'Accept', value: 'application/json' },
      { key: 'X-API-Key', value: '' }, { key: '', value: 'ohne Namen' },
    ];
    const out = redactHeaders(headers);
    assertDeepEqual(out, [
      { key: 'Authorization', value: MASK }, { key: 'Accept', value: 'application/json' },
      { key: 'X-API-Key', value: '' }, { key: '', value: 'ohne Namen' },
    ]);
    assertEqual(headers[0].value, 'Bearer abc');
    assertTrue(out[1] !== headers[1], 'Kopie');
  });
  test('Endpunkte für Lesen und Export: nur die Header maskiert', () => {
    const eps = [{ id: 'e', url: 'u', headers: [{ key: 'Cookie', value: 's=1' }] }];
    assertDeepEqual(redactEndpoints(eps), [{ id: 'e', url: 'u', headers: [{ key: 'Cookie', value: MASK }] }]);
    assertEqual(eps[0].headers[0].value, 's=1');
  });
  test('Platzhalter beim Import: wird leer, alles andere bleibt', () => {
    assertDeepEqual([unmaskedValue(MASK), unmaskedValue('x'), unmaskedValue('')], ['', 'x', '']);
  });
});
