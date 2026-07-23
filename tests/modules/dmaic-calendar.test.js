import { suite, test, assertEqual } from '../test-utils.js';
import {
  State,
  fmt2, dateKey, isoDow, getMonday, snp, mtt, ttm, fmtEnd, fmtDur,
  SNAP, MIN_DUR, HOUR_H,
} from '../../js/modules/dmaic-calendar/dmaic-calendar-model.js';

suite('DMAIC Calendar Model — pure date helpers', () => {
  test('fmt2 pads to two digits', () => {
    assertEqual(fmt2(3), '03');
    assertEqual(fmt2(12), '12');
    assertEqual(fmt2(0), '00');
  });

  test('dateKey builds ISO date (month is 0-based)', () => {
    assertEqual(dateKey(2026, 0, 5), '2026-01-05');
    assertEqual(dateKey(2026, 11, 31), '2026-12-31');
  });

  test('isoDow maps Sunday(0) -> 6, Monday(1) -> 0', () => {
    // 2026-06-15 is a Monday
    assertEqual(isoDow(new Date(2026, 5, 15)), 0);
    // 2026-06-14 is a Sunday
    assertEqual(isoDow(new Date(2026, 5, 14)), 6);
  });

  test('getMonday returns the Monday of the week at 00:00', () => {
    const mon = getMonday(new Date(2026, 5, 17)); // a Wednesday
    assertEqual(mon.getFullYear(), 2026);
    assertEqual(mon.getMonth(), 5);
    assertEqual(mon.getDate(), 15);
    assertEqual(mon.getHours(), 0);
  });

  test('getMonday handles Sunday correctly (goes back 6 days)', () => {
    const mon = getMonday(new Date(2026, 5, 14)); // Sunday
    assertEqual(mon.getDate(), 8); // previous Monday
  });

  test('snp snaps minutes to SNAP grid', () => {
    assertEqual(snp(7), 5);
    assertEqual(snp(8), 10);
    assertEqual(SNAP, 5);
  });

  test('mtt converts minutes to HH:MM and clamps', () => {
    assertEqual(mtt(0), '00:00');
    assertEqual(mtt(540), '09:00');
    assertEqual(mtt(-10), '00:00');
    assertEqual(mtt(2000), '23:59');
  });

  test('ttm parses HH:MM to minutes, defaults to 09:00', () => {
    assertEqual(ttm('09:00'), 540);
    assertEqual(ttm('00:30'), 30);
    assertEqual(ttm(''), 540);
    assertEqual(ttm(null), 540);
  });

  test('fmtEnd adds duration to a start time', () => {
    assertEqual(fmtEnd('09:00', 90), '10:30');
    assertEqual(fmtEnd('10:00', 120), '12:00');
  });

  test('fmtDur formats durations', () => {
    assertEqual(fmtDur(30), '30min');
    assertEqual(fmtDur(60), '1h');
    assertEqual(fmtDur(90), '1h 30min');
  });

  test('constants', () => {
    assertEqual(MIN_DUR, 5);
    assertEqual(HOUR_H, 60);
  });
});

suite('DMAIC Calendar Model — State construction & defaults', () => {
  test('constructor sets default axis/day values', () => {
    const s = new State();
    assertEqual(s.axisFrom, 6);
    assertEqual(s.axisTo, 22);
    assertEqual(s.dayFrom, 0);
    assertEqual(s.dayTo, 6);
    assertEqual(s.events.length, 0);
  });

  test('hasContent false when empty, true with events', () => {
    const s = new State();
    assertEqual(s.hasContent(), false);
    s.events.push({ id: 'a', title: 'X', date: '2026-06-15', time: '09:00', duration: 60, desc: '', phase: 'define' });
    assertEqual(s.hasContent(), true);
  });
});

suite('DMAIC Calendar Model — serialization', () => {
  test('toJSON returns legacy getState shape', () => {
    const s = new State();
    s.events.push({ id: 'a', title: 'T', date: '2026-06-15', time: '09:00', duration: 60, desc: 'd', phase: 'analyze' });
    s.axisFrom = 8; s.axisTo = 18; s.dayFrom = 0; s.dayTo = 4;
    const j = s.toJSON();
    assertEqual(Object.keys(j).sort().join(','), 'axisFrom,axisTo,dayFrom,dayTo,events,viewMode');
    assertEqual(j.axisFrom, 8);
    assertEqual(j.axisTo, 18);
    assertEqual(j.dayFrom, 0);
    assertEqual(j.dayTo, 4);
    assertEqual(j.events.length, 1);
    assertEqual(j.events[0].phase, 'analyze');
  });

  test('viewMode round-trips (default month, persists week)', () => {
    assertEqual(new State().toJSON().viewMode, 'month');
    const s = new State();
    s.viewMode = 'week';
    assertEqual(State.fromJSON(s.toJSON()).viewMode, 'week');
    // Invalid values fall back to the default.
    assertEqual(State.fromJSON({ viewMode: 'nonsense' }).viewMode, 'month');
  });

  test('toJSON preserves todo source tag', () => {
    const s = new State();
    s.events.push({ id: 'todo-1', title: 'T', date: '2026-06-15', time: '09:00', duration: 30, desc: '', phase: 'define', source: 'todo' });
    assertEqual(s.toJSON().events[0].source, 'todo');
  });

  test('fromJSON(null) returns valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.axisFrom, 6);
    assertEqual(s.axisTo, 22);
    assertEqual(s.events.length, 0);
  });

  test('fromJSON(undefined) returns valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.dayFrom, 0);
    assertEqual(s.dayTo, 6);
  });

  test('fromJSON(malformed) returns valid default', () => {
    const s = State.fromJSON({ events: 'nope', axisFrom: 'x' });
    assertEqual(Array.isArray(s.events), true);
    assertEqual(s.events.length, 0);
    assertEqual(s.axisFrom, 6);
  });

  test('fromJSON restores data', () => {
    const data = {
      events: [{ id: 'a', title: 'T', date: '2026-06-15', time: '10:00', duration: 90, desc: 'x', phase: 'measure' }],
      axisFrom: 9, axisTo: 17, dayFrom: 1, dayTo: 5,
    };
    const s = State.fromJSON(data);
    assertEqual(s.axisFrom, 9);
    assertEqual(s.axisTo, 17);
    assertEqual(s.dayFrom, 1);
    assertEqual(s.dayTo, 5);
    assertEqual(s.events[0].title, 'T');
  });

  test('roundtrip toJSON -> fromJSON is lossless', () => {
    const s = new State();
    s.events.push({ id: 'a', title: 'T', date: '2026-06-15', time: '09:00', duration: 60, desc: 'd', phase: 'control', source: 'todo' });
    s.axisFrom = 7; s.axisTo = 20; s.dayFrom = 0; s.dayTo = 3;
    const r = State.fromJSON(s.toJSON());
    assertEqual(JSON.stringify(r.toJSON()), JSON.stringify(s.toJSON()));
  });
});

suite('DMAIC Calendar Model — business logic', () => {
  test('upsertEvent adds a new event with generated id', () => {
    const s = new State();
    s.upsertEvent({ title: 'New', date: '2026-06-15', time: '09:00', duration: 60, desc: '', phase: 'define' }, null);
    assertEqual(s.events.length, 1);
    assertEqual(typeof s.events[0].id, 'string');
    assertEqual(s.events[0].title, 'New');
  });

  test('upsertEvent updates an existing event by id', () => {
    const s = new State();
    s.upsertEvent({ title: 'A', date: '2026-06-15', time: '09:00', duration: 60, desc: '', phase: 'define' }, null);
    const id = s.events[0].id;
    s.upsertEvent({ title: 'B', date: '2026-06-16', time: '10:00', duration: 30, desc: 'z', phase: 'analyze' }, id);
    assertEqual(s.events.length, 1);
    assertEqual(s.events[0].title, 'B');
    assertEqual(s.events[0].phase, 'analyze');
    assertEqual(s.events[0].id, id);
  });

  test('removeEvent removes by id', () => {
    const s = new State();
    s.upsertEvent({ title: 'A', date: '2026-06-15', time: '09:00', duration: 60, desc: '', phase: 'define' }, null);
    const id = s.events[0].id;
    s.removeEvent(id);
    assertEqual(s.events.length, 0);
  });

  test('applyTodoSync replaces todo-sourced events, keeps manual ones', () => {
    const s = new State();
    s.upsertEvent({ title: 'Manual', date: '2026-06-15', time: '09:00', duration: 60, desc: '', phase: 'define' }, null);
    s.events.push({ id: 'todo-old', title: 'Old todo', date: '2026-06-10', time: '09:00', duration: 30, desc: '', phase: 'define', source: 'todo' });

    s.applyTodoSync([
      { id: '1', title: 'Task 1', date: '2026-06-20', status: 'open' },
      { id: '2', title: 'Task 2', date: '2026-06-21', status: 'done' },
    ]);

    // manual stays, old todo gone, two new todo events
    const manual = s.events.filter(e => e.source !== 'todo');
    const todos = s.events.filter(e => e.source === 'todo');
    assertEqual(manual.length, 1);
    assertEqual(manual[0].title, 'Manual');
    assertEqual(todos.length, 2);
    assertEqual(todos[0].id, 'todo-1');
    assertEqual(todos[0].time, '09:00');
    assertEqual(todos[0].duration, 30);
    assertEqual(todos[0].phase, 'define');
    assertEqual(todos[0].source, 'todo');
    assertEqual(todos[0].title, 'Task 1');
    assertEqual(todos[0].date, '2026-06-20');
  });

  test('applyTodoSync with empty list clears all todo events', () => {
    const s = new State();
    s.events.push({ id: 'todo-x', title: 'X', date: '2026-06-10', time: '09:00', duration: 30, desc: '', phase: 'define', source: 'todo' });
    s.applyTodoSync([]);
    assertEqual(s.events.length, 0);
  });

  test('eventsForPhase filters by phase, null -> all', () => {
    const s = new State();
    s.events.push({ id: '1', title: 'A', date: '2026-06-15', time: '09:00', duration: 60, desc: '', phase: 'define' });
    s.events.push({ id: '2', title: 'B', date: '2026-06-15', time: '10:00', duration: 60, desc: '', phase: 'analyze' });
    assertEqual(s.eventsForPhase(null).length, 2);
    assertEqual(s.eventsForPhase('analyze').length, 1);
    assertEqual(s.eventsForPhase('analyze')[0].title, 'B');
  });

  test('eventsForDay returns events on a key sorted by time', () => {
    const s = new State();
    s.events.push({ id: '1', title: 'Late', date: '2026-06-15', time: '14:00', duration: 60, desc: '', phase: 'define' });
    s.events.push({ id: '2', title: 'Early', date: '2026-06-15', time: '08:00', duration: 60, desc: '', phase: 'define' });
    s.events.push({ id: '3', title: 'Other', date: '2026-06-16', time: '09:00', duration: 60, desc: '', phase: 'define' });
    const day = s.eventsForDay('2026-06-15', null);
    assertEqual(day.length, 2);
    assertEqual(day[0].title, 'Early');
    assertEqual(day[1].title, 'Late');
  });

  test('upcomingEvents returns future events sorted, capped at 5', () => {
    const s = new State();
    for (let i = 1; i <= 7; i++) {
      s.events.push({ id: String(i), title: 'E' + i, date: '2026-06-' + fmt2(10 + i), time: '09:00', duration: 60, desc: '', phase: 'define' });
    }
    const up = s.upcomingEvents('2026-06-13');
    assertEqual(up.length, 5);
    // first is the earliest >= today key
    assertEqual(up[0].date >= '2026-06-13', true);
  });

  test('monthCells produces padded weeks (multiple of 7)', () => {
    const s = new State();
    const cells = s.monthCells(2026, 5, null); // June 2026
    assertEqual(cells.length % 7, 0);
    // current month days flagged other=false with a key
    const current = cells.filter(c => !c.other);
    assertEqual(current.length, 30); // June has 30 days
    assertEqual(current[0].key, '2026-06-01');
  });

  test('weekDates returns the visible day range as Date objects', () => {
    const s = new State();
    const mondayMs = getMonday(new Date(2026, 5, 17)).getTime();
    const dates = s.weekDates(mondayMs, 0, 4); // Mon..Fri
    assertEqual(dates.length, 5);
    assertEqual(dates[0].getDate(), 15);
    assertEqual(dates[4].getDate(), 19);
  });

  test('hoursArr / visibleDayIndices reflect axis config', () => {
    const s = new State();
    s.axisFrom = 10; s.axisTo = 14;
    assertEqual(s.hoursArr().join(','), '10,11,12,13');
    s.dayFrom = 1; s.dayTo = 3;
    assertEqual(s.visibleDayIndices().join(','), '1,2,3');
  });

  test('axis pixel math: gStart/gEnd/minToPx/pxToMin/totalH (axisFrom=6, axisTo=22)', () => {
    const s = new State(); // defaults: axisFrom=6, axisTo=22
    // grid start/end in minutes-of-day
    assertEqual(s.gStart(), 360); // 6 * 60
    assertEqual(s.gEnd(), 1320);  // 22 * 60
    // minutes-of-day -> pixel offset from grid top (1px per minute, gStart anchored at 0)
    assertEqual(s.minToPx(540), 180); // 09:00 -> 540 - 360
    assertEqual(s.minToPx(360), 0);   // grid start -> 0
    // pixel offset -> minutes-of-day (inverse of minToPx)
    assertEqual(s.pxToMin(180), 540);
    assertEqual(s.pxToMin(0), 360);
    // minToPx and pxToMin round-trip
    assertEqual(s.pxToMin(s.minToPx(720)), 720);
    // total grid height = visible hours * HOUR_H
    assertEqual(s.totalH(), 16 * HOUR_H); // 16 visible hours -> 960
  });

  test('axis pixel math respects a custom axisFrom (axisFrom=8, axisTo=18)', () => {
    const s = new State();
    s.axisFrom = 8; s.axisTo = 18;
    assertEqual(s.gStart(), 480);     // 8 * 60
    assertEqual(s.minToPx(600), 120); // 10:00 -> 600 - 480
    assertEqual(s.pxToMin(120), 600);
    assertEqual(s.totalH(), 10 * HOUR_H); // 10 visible hours -> 600
  });
});
