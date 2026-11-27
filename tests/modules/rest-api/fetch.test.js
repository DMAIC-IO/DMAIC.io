/**
 * REST API: Abruf (io/fetch.js) — Kopfzeilen, JSON und Text, Fehlerstatus,
 * Netzfehler als Status 0, Abbruch weitergeworfen, ungültiges JSON.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { buildRequest, readResponse, fetchEndpoint } from '../../../js/modules/rest-api/io/fetch.js';

/**
 * Eine Antwort wie `fetch` sie liefert.
 * @param {{ status?: number, statusText?: string, type?: string, body?: string }} o
 */
function res({ status = 200, statusText = 'OK', type = 'application/json', body = '{}' } = {}) {
  return {
    status, statusText, ok: status >= 200 && status < 300,
    headers: { get: (n) => (n.toLowerCase() === 'content-type' ? type : null) },
    json: async () => JSON.parse(body),
    text: async () => body,
  };
}

suite('rest-api fetch: Anfrage', () => {
  test('GET ohne Kopfzeilen: keine headers in den Optionen', () => {
    assertDeepEqual(buildRequest({ url: 'a/b', headers: [] }), { url: 'a/b', init: { method: 'GET' } });
  });
  test('Namen getrimmt, leere Namen weg, Werte unverändert', () => {
    const { init } = buildRequest({ url: 'x', headers: [
      { key: '  Accept ', value: ' text/plain ' }, { key: '   ', value: 'weg' }, { key: '', value: 'weg' },
    ] });
    assertDeepEqual(init.headers, { Accept: ' text/plain ' });
  });
  test('nur leere Namen: leeres headers-Objekt wie in der Altform', () => {
    assertDeepEqual(buildRequest({ url: 'x', headers: [{ key: '', value: 'v' }] }).init.headers, {});
  });
  test('Signal wird durchgereicht', () => {
    const signal = new AbortController().signal;
    assertEqual(buildRequest({ url: 'x', headers: [] }, signal).init.signal, signal);
  });
});

suite('rest-api fetch: Antwort', () => {
  test('JSON wird mit zwei Leerzeichen eingerückt', async () => {
    const r = await readResponse(res({ body: '{"a":[1,2]}' }));
    assertDeepEqual(r, { status: 200, statusText: 'OK', ok: true, body: '{\n  "a": [\n    1,\n    2\n  ]\n}' });
  });
  test('Inhaltstyp mit json-Zusatz zählt als JSON', async () => {
    const r = await readResponse(res({ type: 'application/problem+json; charset=utf-8', body: '{"x":1}' }));
    assertEqual(r.body, '{\n  "x": 1\n}');
  });
  test('Text bleibt Text; ohne Inhaltstyp ebenso', async () => {
    assertEqual((await readResponse(res({ type: 'text/plain', body: 'hallo' }))).body, 'hallo');
    assertEqual((await readResponse(res({ type: null, body: '{"a":1}' }))).body, '{"a":1}');
  });
  test('500 ist eine Antwort mit ok false, kein Fehler', async () => {
    const r = await fetchEndpoint({ url: 'x', headers: [] }, {
      fetchImpl: async () => res({ status: 500, statusText: 'Internal Server Error', type: 'text/plain', body: 'kaputt' }),
    });
    assertDeepEqual(r, { status: 500, statusText: 'Internal Server Error', ok: false, body: 'kaputt' });
  });
});

suite('rest-api fetch: Fehler', () => {
  test('Netzfehler wird Status 0 mit der Meldung', async () => {
    const r = await fetchEndpoint({ url: 'x', headers: [] }, {
      fetchImpl: async () => { throw new TypeError('Failed to fetch'); },
    });
    assertDeepEqual(r, { status: 0, statusText: 'Error', ok: false, body: 'Failed to fetch' });
  });
  test('ungültiges JSON bei 200 wird Status 0 mit der Parser-Meldung (Altverhalten)', async () => {
    const r = await fetchEndpoint({ url: 'x', headers: [] }, { fetchImpl: async () => res({ body: '{kaputt' }) });
    assertEqual(r.status, 0);
    assertEqual(r.statusText, 'Error');
    assertTrue(r.body.length > 0, 'Meldung des Parsers');
  });
  test('Abbruch wird weitergeworfen', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    let caught = null;
    try {
      await fetchEndpoint({ url: 'x', headers: [] }, { fetchImpl: async () => { throw abort; } });
    } catch (e) { caught = e; }
    assertEqual(caught, abort);
  });
  test('URL, Optionen und Signal erreichen fetch', async () => {
    const signal = new AbortController().signal;
    let seen = null;
    await fetchEndpoint({ url: 'rest/x', headers: [{ key: 'K', value: 'v' }] }, {
      signal, fetchImpl: async (url, init) => { seen = { url, init }; return res(); },
    });
    assertDeepEqual(seen, { url: 'rest/x', init: { method: 'GET', headers: { K: 'v' }, signal } });
  });
});
