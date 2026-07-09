/**
 * Unit tests for the REST API module Model (rest-api-model.js).
 * Covers Endpoint + State: constructor defaults, toJSON/fromJSON round-trip,
 * null/undefined handling, sanitization, business logic, hasContent().
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { Endpoint, State } from '../../js/modules/rest-api/rest-api-model.js';

suite('REST API Model — Endpoint', () => {
  test('constructor sets default values', () => {
    const ep = new Endpoint();
    assertEqual(typeof ep.id, 'string');
    assertEqual(ep.id.length > 0, true);
    assertEqual(ep.name, '');
    assertEqual(ep.url, '');
    assertEqual(Array.isArray(ep.headers), true);
    assertEqual(ep.headers.length, 0);
    assertEqual(Array.isArray(ep.mappings), true);
    assertEqual(ep.mappings.length, 0);
    assertEqual(ep.writeMode, 'replace');
    assertEqual(ep.schedule.enabled, false);
    assertEqual(ep.schedule.intervalValue, 5);
    assertEqual(ep.schedule.intervalUnit, 'minutes');
  });

  test('toJSON returns expected shape', () => {
    const ep = new Endpoint();
    ep.name = 'My API';
    ep.url = 'https://api.example.com';
    ep.headers = [{ key: 'Authorization', value: 'Bearer x' }];
    ep.mappings = [{ jsonPath: 'data.v', columnRef: null }];
    ep.writeMode = 'append';
    const j = ep.toJSON();
    assertEqual(j.id, ep.id);
    assertEqual(j.name, 'My API');
    assertEqual(j.url, 'https://api.example.com');
    assertEqual(j.headers[0].key, 'Authorization');
    assertEqual(j.headers[0].value, 'Bearer x');
    assertEqual(j.mappings[0].jsonPath, 'data.v');
    assertEqual(j.mappings[0].columnRef, null);
    assertEqual(j.writeMode, 'append');
    assertEqual(j.schedule.enabled, false);
    assertEqual(j.schedule.intervalValue, 5);
    assertEqual(j.schedule.intervalUnit, 'minutes');
  });

  test('fromJSON(null) returns valid default', () => {
    const ep = Endpoint.fromJSON(null);
    assertEqual(ep instanceof Endpoint, true);
    assertEqual(ep.name, '');
    assertEqual(ep.writeMode, 'replace');
    assertEqual(ep.schedule.intervalUnit, 'minutes');
  });

  test('fromJSON(undefined) returns valid default', () => {
    const ep = Endpoint.fromJSON(undefined);
    assertEqual(ep instanceof Endpoint, true);
    assertEqual(ep.url, '');
  });

  test('fromJSON round-trip is lossless', () => {
    const ep = new Endpoint();
    ep.name = 'Round';
    ep.url = 'https://x.test/a';
    ep.headers = [{ key: 'K', value: 'V' }];
    ep.mappings = [{ jsonPath: 'a.b', columnRef: { instanceId: 'w1', sheetId: 's1', columnId: 'c1' } }];
    ep.writeMode = 'prepend';
    ep.schedule = { enabled: true, intervalValue: 12, intervalUnit: 'hours' };
    const restored = Endpoint.fromJSON(ep.toJSON());
    assertEqual(restored.id, ep.id);
    assertEqual(restored.name, 'Round');
    assertEqual(restored.url, 'https://x.test/a');
    assertEqual(restored.headers.length, 1);
    assertEqual(restored.headers[0].key, 'K');
    assertEqual(restored.mappings[0].jsonPath, 'a.b');
    assertEqual(restored.mappings[0].columnRef.columnId, 'c1');
    assertEqual(restored.writeMode, 'prepend');
    assertEqual(restored.schedule.enabled, true);
    assertEqual(restored.schedule.intervalValue, 12);
    assertEqual(restored.schedule.intervalUnit, 'hours');
  });

  test('fromJSON sanitizes invalid writeMode to replace', () => {
    const ep = Endpoint.fromJSON({ writeMode: 'bogus' });
    assertEqual(ep.writeMode, 'replace');
  });

  test('fromJSON sanitizes invalid intervalUnit to minutes', () => {
    const ep = Endpoint.fromJSON({ schedule: { enabled: false, intervalValue: 3, intervalUnit: 'days' } });
    assertEqual(ep.schedule.intervalUnit, 'minutes');
    assertEqual(ep.schedule.intervalValue, 3);
  });

  test('fromJSON sanitizes non-string name/url', () => {
    const ep = Endpoint.fromJSON({ name: 42, url: null });
    assertEqual(ep.name, '');
    assertEqual(ep.url, '');
  });

  test('fromJSON migrates legacy intervalMinutes', () => {
    const ep = Endpoint.fromJSON({ schedule: { enabled: true, intervalMinutes: 7 } });
    assertEqual(ep.schedule.intervalValue, 7);
    assertEqual(ep.schedule.intervalUnit, 'minutes');
    assertEqual('intervalMinutes' in ep.schedule, false);
  });

  test('fromJSON defaults missing mappings/headers to empty arrays', () => {
    const ep = Endpoint.fromJSON({ name: 'x' });
    assertEqual(Array.isArray(ep.mappings), true);
    assertEqual(ep.mappings.length, 0);
    assertEqual(Array.isArray(ep.headers), true);
    assertEqual(ep.headers.length, 0);
  });

  test('scheduleToMs converts minutes', () => {
    const ep = new Endpoint();
    ep.schedule = { enabled: true, intervalValue: 5, intervalUnit: 'minutes' };
    assertEqual(ep.scheduleToMs(), 5 * 60000);
  });

  test('scheduleToMs converts hours', () => {
    const ep = new Endpoint();
    ep.schedule = { enabled: true, intervalValue: 2, intervalUnit: 'hours' };
    assertEqual(ep.scheduleToMs(), 2 * 3600000);
  });

  test('scheduleToMs falls back to 5 when value missing', () => {
    const ep = new Endpoint();
    ep.schedule = { enabled: true, intervalValue: 0, intervalUnit: 'minutes' };
    assertEqual(ep.scheduleToMs(), 5 * 60000);
  });

  test('usedColumnKeys collects keys excluding given index', () => {
    const ep = new Endpoint();
    ep.mappings = [
      { jsonPath: 'a', columnRef: { instanceId: 'w', sheetId: 's', columnId: 'c1' } },
      { jsonPath: 'b', columnRef: { instanceId: 'w', sheetId: 's', columnId: 'c2' } },
      { jsonPath: 'c', columnRef: null },
    ];
    const used = ep.usedColumnKeys(0);
    assertEqual(used.has('w|s|c2'), true);
    assertEqual(used.has('w|s|c1'), false);
    assertEqual(used.size, 1);
  });

  test('usedColumnKeys with no exclusion collects all non-null refs', () => {
    const ep = new Endpoint();
    ep.mappings = [
      { jsonPath: 'a', columnRef: { instanceId: 'w', sheetId: 's', columnId: 'c1' } },
      { jsonPath: 'b', columnRef: null },
    ];
    const used = ep.usedColumnKeys(-1);
    assertEqual(used.size, 1);
    assertEqual(used.has('w|s|c1'), true);
  });
});

suite('REST API Model — State', () => {
  test('constructor sets default values', () => {
    const s = new State();
    assertEqual(Array.isArray(s.endpoints), true);
    assertEqual(s.endpoints.length, 0);
    assertEqual(s.activeId, null);
  });

  test('toJSON returns endpoints + activeId', () => {
    const s = new State();
    const ep = new Endpoint();
    ep.name = 'A';
    s.endpoints = [ep];
    s.activeId = ep.id;
    const j = s.toJSON();
    assertEqual(j.endpoints.length, 1);
    assertEqual(j.endpoints[0].name, 'A');
    assertEqual(j.activeId, ep.id);
  });

  test('fromJSON(null) returns valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s instanceof State, true);
    assertEqual(s.endpoints.length, 0);
    assertEqual(s.activeId, null);
  });

  test('fromJSON(undefined) returns valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s instanceof State, true);
    assertEqual(s.endpoints.length, 0);
  });

  test('fromJSON restores endpoints and activeId', () => {
    const ep = new Endpoint();
    ep.name = 'Restore';
    ep.url = 'https://r.test';
    const s = State.fromJSON({ endpoints: [ep.toJSON()], activeId: ep.id });
    assertEqual(s.endpoints.length, 1);
    assertEqual(s.endpoints[0] instanceof Endpoint, true);
    assertEqual(s.endpoints[0].name, 'Restore');
    assertEqual(s.activeId, ep.id);
  });

  test('fromJSON handles non-array endpoints gracefully', () => {
    const s = State.fromJSON({ endpoints: 'nope', activeId: 'x' });
    assertEqual(Array.isArray(s.endpoints), true);
    assertEqual(s.endpoints.length, 0);
  });

  test('toJSON -> fromJSON round-trip is lossless', () => {
    const s = new State();
    const ep1 = new Endpoint();
    ep1.name = 'One';
    ep1.url = 'https://one.test';
    ep1.headers = [{ key: 'H', value: 'V' }];
    const ep2 = new Endpoint();
    ep2.name = 'Two';
    ep2.schedule = { enabled: true, intervalValue: 3, intervalUnit: 'hours' };
    s.endpoints = [ep1, ep2];
    s.activeId = ep2.id;
    const restored = State.fromJSON(s.toJSON());
    assertEqual(restored.endpoints.length, 2);
    assertEqual(restored.endpoints[0].name, 'One');
    assertEqual(restored.endpoints[0].headers[0].key, 'H');
    assertEqual(restored.endpoints[1].schedule.intervalUnit, 'hours');
    assertEqual(restored.activeId, ep2.id);
  });

  test('hasContent false for fresh state', () => {
    assertEqual(new State().hasContent(), false);
  });

  test('hasContent true when an endpoint exists', () => {
    const s = new State();
    s.endpoints = [new Endpoint()];
    assertEqual(s.hasContent(), true);
  });

  test('activeEndpoint returns the active endpoint or null', () => {
    const s = new State();
    const ep = new Endpoint();
    s.endpoints = [ep];
    s.activeId = ep.id;
    assertEqual(s.activeEndpoint() === ep, true);
    s.activeId = 'missing';
    assertEqual(s.activeEndpoint(), null);
  });
});
