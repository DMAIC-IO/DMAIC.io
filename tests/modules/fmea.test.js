import { suite, test, assertEqual } from '../test-utils.js';
import { Action, Risk, State } from '../../js/modules/fmea/fmea-model.js';

suite('FMEA Model — Action', () => {
  test('constructor sets defaults', () => {
    const a = new Action();
    assertEqual(a.text, '');
    assertEqual(a.resp, '');
    assertEqual(a.date, '');
    assertEqual(a.done, false);
    assertEqual(a.deltaS, '0');
    assertEqual(a.deltaO, '0');
    assertEqual(a.deltaD, '0');
    assertEqual(typeof a.id, 'string');
  });

  test('toJSON omits the transient id (legacy parity)', () => {
    const a = new Action();
    a.text = 'fix'; a.resp = 'me'; a.date = '2025-06-01'; a.done = true;
    a.deltaS = '2'; a.deltaO = '1'; a.deltaD = '0';
    const j = a.toJSON();
    assertEqual(j.text, 'fix');
    assertEqual(j.resp, 'me');
    assertEqual(j.date, '2025-06-01');
    assertEqual(j.done, true);
    assertEqual(j.deltaS, '2');
    assertEqual(j.deltaO, '1');
    assertEqual(j.deltaD, '0');
    assertEqual('id' in j, false);
  });

  test('fromJSON restores values', () => {
    const a = Action.fromJSON({ text: 't', resp: 'r', date: 'd', done: true, deltaS: '3', deltaO: '4', deltaD: '5' });
    assertEqual(a.text, 't');
    assertEqual(a.resp, 'r');
    assertEqual(a.date, 'd');
    assertEqual(a.done, true);
    assertEqual(a.deltaS, '3');
    assertEqual(a.deltaO, '4');
    assertEqual(a.deltaD, '5');
  });

  test('fromJSON(null) returns default action', () => {
    const a = Action.fromJSON(null);
    assertEqual(a.text, '');
    assertEqual(a.deltaS, '0');
    assertEqual(a.done, false);
  });

  test('fromJSON sanitizes wrong types', () => {
    const a = Action.fromJSON({ text: 5, done: 'yes', deltaS: 7 });
    assertEqual(a.text, '');
    assertEqual(a.done, true);          // truthy coerced
    assertEqual(a.deltaS, '7');         // numeric coerced to string
  });
});

suite('FMEA Model — Risk RPN', () => {
  test('rpn is S*O*D', () => {
    const r = new Risk();
    r.sev = '5'; r.occ = '4'; r.det = '3';
    assertEqual(r.rpn(), 60);
  });

  test('rpn is 0 when any of S/O/D unset', () => {
    const r = new Risk();
    r.sev = '5'; r.occ = ''; r.det = '3';
    assertEqual(r.rpn(), 0);
    r.occ = '4'; r.det = '';
    assertEqual(r.rpn(), 0);
  });

  test('rpn boundary 1*1*1 and 10*10*10', () => {
    const r = new Risk();
    r.sev = '1'; r.occ = '1'; r.det = '1';
    assertEqual(r.rpn(), 1);
    r.sev = '10'; r.occ = '10'; r.det = '10';
    assertEqual(r.rpn(), 1000);
  });

  test('projected S/O/D = max(1, v - sum(delta))', () => {
    const r = new Risk();
    r.sev = '5'; r.occ = '4'; r.det = '3';
    const a = new Action();
    a.deltaS = '2'; a.deltaO = '1'; a.deltaD = '1';
    r.actions = [a];
    assertEqual(r.projS(), 3);
    assertEqual(r.projO(), 3);
    assertEqual(r.projD(), 2);
    assertEqual(r.projRpn(), 18);
  });

  test('projected clamps at 1 (delta exceeds base)', () => {
    const r = new Risk();
    r.sev = '5'; r.occ = '4'; r.det = '3';
    const a = new Action();
    a.deltaS = '9'; a.deltaO = '9'; a.deltaD = '9';
    r.actions = [a];
    assertEqual(r.projS(), 1);
    assertEqual(r.projO(), 1);
    assertEqual(r.projD(), 1);
    assertEqual(r.projRpn(), 1);
  });

  test('projRpn is 0 when base RPN is 0', () => {
    const r = new Risk();
    r.sev = ''; r.occ = '4'; r.det = '3';
    const a = new Action();
    a.deltaO = '1';
    r.actions = [a];
    assertEqual(r.projRpn(), 0);
  });

  test('deltas sum across multiple actions', () => {
    const r = new Risk();
    r.sev = '8'; r.occ = '8'; r.det = '8';
    const a1 = new Action(); a1.deltaS = '2';
    const a2 = new Action(); a2.deltaS = '3'; a2.deltaO = '1';
    r.actions = [a1, a2];
    assertEqual(r.projS(), 3);   // 8 - 5
    assertEqual(r.projO(), 7);   // 8 - 1
    assertEqual(r.projD(), 8);
  });
});

suite('FMEA Model — Risk serialization', () => {
  test('toJSON keeps legacy field set', () => {
    const r = new Risk();
    r.id = 'r1'; r.step = 's'; r.failureMode = 'f'; r.effect = 'e';
    r.cause = 'c'; r.control = 'ctl'; r.sev = '7'; r.occ = '4'; r.det = '5';
    r.collapsed = true;
    const a = new Action(); a.text = 'do';
    r.actions = [a];
    const j = r.toJSON();
    assertEqual(j.id, 'r1');
    assertEqual(j.step, 's');
    assertEqual(j.failureMode, 'f');
    assertEqual(j.effect, 'e');
    assertEqual(j.cause, 'c');
    assertEqual(j.control, 'ctl');
    assertEqual(j.sev, '7');
    assertEqual(j.occ, '4');
    assertEqual(j.det, '5');
    assertEqual(j.collapsed, true);
    assertEqual(Array.isArray(j.actions), true);
    assertEqual(j.actions[0].text, 'do');
  });

  test('fromJSON restores nested actions', () => {
    const r = Risk.fromJSON({ id: 'x', step: 'st', sev: '3', occ: '2', det: '1',
      actions: [{ text: 'a1', deltaS: '1' }, { text: 'a2' }] });
    assertEqual(r.id, 'x');
    assertEqual(r.step, 'st');
    assertEqual(r.actions.length, 2);
    assertEqual(r.actions[0].text, 'a1');
    assertEqual(r.actions[0].deltaS, '1');
    assertEqual(r.actions[1].text, 'a2');
  });

  test('fromJSON(null) returns a default risk with empty actions', () => {
    const r = Risk.fromJSON(null);
    assertEqual(r.step, '');
    assertEqual(r.sev, '');
    assertEqual(Array.isArray(r.actions), true);
    assertEqual(r.actions.length, 0);
    assertEqual(typeof r.id, 'string');
  });

  test('fromJSON tolerates non-array actions', () => {
    const r = Risk.fromJSON({ actions: 'nope' });
    assertEqual(r.actions.length, 0);
  });
});

suite('FMEA Model — State', () => {
  test('constructor: empty risks, null scales', () => {
    const s = new State();
    assertEqual(s.risks.length, 0);
    assertEqual(s.scales, null);
  });

  test('hasContent reflects risk presence', () => {
    const s = new State();
    assertEqual(s.hasContent(), false);
    s.addRisk();
    assertEqual(s.hasContent(), true);
  });

  test('addRisk appends a blank risk with id', () => {
    const s = new State();
    const r = s.addRisk();
    assertEqual(s.risks.length, 1);
    assertEqual(s.risks[0], r);
    assertEqual(typeof r.id, 'string');
    assertEqual(r.actions.length, 0);
  });

  test('removeRisk filters by id', () => {
    const s = new State();
    const r1 = s.addRisk();
    const r2 = s.addRisk();
    s.removeRisk(r1.id);
    assertEqual(s.risks.length, 1);
    assertEqual(s.risks[0].id, r2.id);
  });

  test('addAction / removeAction on a risk', () => {
    const s = new State();
    const r = s.addRisk();
    s.addAction(r.id);
    s.addAction(r.id);
    assertEqual(r.actions.length, 2);
    assertEqual(r.actions[0].deltaS, '0');
    s.removeAction(r.id, 0);
    assertEqual(r.actions.length, 1);
  });

  test('sortByRPN sorts descending', () => {
    const s = new State();
    const lo = s.addRisk(); lo.sev = '1'; lo.occ = '1'; lo.det = '1';   // 1
    const hi = s.addRisk(); hi.sev = '10'; hi.occ = '10'; hi.det = '10'; // 1000
    s.sortByRPN();
    assertEqual(s.risks[0].id, hi.id);
    assertEqual(s.risks[1].id, lo.id);
  });

  test('resetScales nulls custom scales', () => {
    const s = new State();
    s.scales = { sevNone: 'Custom' };
    s.resetScales();
    assertEqual(s.scales, null);
  });

  test('stats counts categories, avg and max', () => {
    const s = new State();
    const mk = (sv, o, d) => { const r = s.addRisk(); r.sev = String(sv); r.occ = String(o); r.det = String(d); };
    mk(2, 3, 4);   // 24  low
    mk(5, 4, 3);   // 60  medium
    mk(6, 6, 5);   // 180 high
    mk(10, 10, 10);// 1000 critical
    s.addRisk();   // unrated -> counts in total only
    const st = s.stats();
    assertEqual(st.total, 5);
    assertEqual(st.critical, 1);
    assertEqual(st.high, 1);
    assertEqual(st.medium, 1);
    assertEqual(st.low, 1);
    assertEqual(st.max, 1000);
    assertEqual(st.avg, Math.round((24 + 60 + 180 + 1000) / 4));
  });

  test('stats categorizes at the exact RPN thresholds (>200 crit / >=125 high / >=50 med / else low)', () => {
    // Each risk's RPN is built from S/O/D in 1..10. The exact spec values 124
    // and 201 are not producible by S×O×D, so the nearest reachable values just
    // below each threshold (120 < 125, 210 > 200) stand in for them.
    const cat = (sv, o, d) => {
      const s = new State();
      const r = s.addRisk(); r.sev = String(sv); r.occ = String(o); r.det = String(d);
      const st = s.stats();
      if (st.critical) return 'critical';
      if (st.high) return 'high';
      if (st.medium) return 'medium';
      if (st.low) return 'low';
      return 'none';
    };
    assertEqual(cat(1, 7, 7), 'low');       // 49  -> low
    assertEqual(cat(1, 5, 10), 'medium');   // 50  -> medium (>=50)
    assertEqual(cat(2, 6, 10), 'medium');   // 120 -> medium (just below 125)
    assertEqual(cat(5, 5, 5), 'high');      // 125 -> high (>=125)
    assertEqual(cat(2, 10, 10), 'high');    // 200 -> high (not > 200)
    assertEqual(cat(3, 7, 10), 'critical'); // 210 -> critical (> 200)
  });

  test('stats avg/max are null when nothing is rated', () => {
    const s = new State();
    s.addRisk();
    const st = s.stats();
    assertEqual(st.total, 1);
    assertEqual(st.avg, null);
    assertEqual(st.max, 0);
  });

  test('toJSON / fromJSON roundtrip lossless (incl. scales + nested actions)', () => {
    const s = new State();
    const r = s.addRisk();
    r.step = 'Step'; r.sev = '7'; r.occ = '4'; r.det = '5'; r.collapsed = true;
    const a = new Action(); a.text = 'fix'; a.date = '2025-06-01'; a.done = true; a.deltaO = '2';
    r.actions = [a];
    s.scales = { sevNone: 'Custom None' };

    const json = s.toJSON();
    const back = State.fromJSON(json);
    assertEqual(JSON.stringify(back.toJSON()), JSON.stringify(json));
    assertEqual(back.risks[0].step, 'Step');
    assertEqual(back.risks[0].collapsed, true);
    assertEqual(back.risks[0].actions[0].text, 'fix');
    assertEqual(back.scales.sevNone, 'Custom None');
  });

  test('fromJSON(null) returns valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.risks.length, 0);
    assertEqual(s.scales, null);
  });

  test('fromJSON(undefined) returns valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.risks.length, 0);
    assertEqual(s.scales, null);
  });

  test('fromJSON malformed returns valid default', () => {
    const s = State.fromJSON({ risks: 'nope', scales: 42 });
    assertEqual(s.risks.length, 0);
    assertEqual(s.scales, null);
  });
});

suite('FMEA Model — burndown series', () => {
  test('returns null when no rated risks with dated reductions', () => {
    const s = new State();
    const r = s.addRisk();  // unrated
    s.addAction(r.id);
    assertEqual(s.burndownSeries(), null);
  });

  test('plan covers all events, actual only done events', () => {
    const s = new State();
    const r = s.addRisk();
    r.sev = '5'; r.occ = '4'; r.det = '3'; // RPN 60
    const a1 = new Action(); a1.date = '2025-06-01'; a1.deltaS = '1'; a1.done = true;
    const a2 = new Action(); a2.date = '2025-07-01'; a2.deltaO = '1'; a2.done = false;
    r.actions = [a1, a2];
    const bd = s.burndownSeries();
    assertEqual(bd.totalRPN, 60);
    // start point + 2 plan events
    assertEqual(bd.planX.length, 3);
    assertEqual(bd.planY[0], 60);
    // a1 reduces 5->4 => 4*4*3=48, reduction 12 => plan 48
    assertEqual(bd.planY[1], 48);
    // a2 reduces O 4->3 => 4*3*3=36, reduction 12 => plan 36
    assertEqual(bd.planY[2], 36);
    // actual: start + only the done a1
    assertEqual(bd.actX.length, 2);
    assertEqual(bd.actY[1], 48);
  });

  test('plan series starts one day (86400000 ms) before the earliest action', () => {
    const s = new State();
    const r = s.addRisk();
    r.sev = '5'; r.occ = '4'; r.det = '3';
    const later = new Action(); later.date = '2025-07-01'; later.deltaO = '1'; later.done = true;
    const earlier = new Action(); earlier.date = '2025-06-01'; earlier.deltaS = '1'; earlier.done = true;
    r.actions = [later, earlier]; // out of order on purpose
    const bd = s.burndownSeries();
    const earliestTs = new Date('2025-06-01').getTime();
    assertEqual(bd.planX[0], earliestTs - 86400000);
    assertEqual(bd.actX[0], earliestTs - 86400000);
  });

  test('sequential reductions ordered by date', () => {
    const s = new State();
    const r = s.addRisk();
    r.sev = '6'; r.occ = '6'; r.det = '6';  // 216
    const later = new Action(); later.date = '2025-08-01'; later.deltaD = '2'; later.done = true;
    const earlier = new Action(); earlier.date = '2025-05-01'; earlier.deltaS = '2'; earlier.done = true;
    r.actions = [later, earlier]; // out of order on purpose
    const bd = s.burndownSeries();
    // earliest first: S 6->4 => 4*6*6=144 (reduction 72)
    assertEqual(bd.planY[1], 144);
    // then D 6->4 => 4*6*4=96 (reduction 48)
    assertEqual(bd.planY[2], 96);
  });
});

suite('FMEA Model — CSV rows', () => {
  test('risk without actions yields one row with projected values', () => {
    const s = new State();
    const r = s.addRisk();
    r.step = 'St'; r.sev = '3'; r.occ = '2'; r.det = '1';
    const rows = s.csvRows();
    assertEqual(rows.length, 1);
    // [#, step, fm, eff, cause, ctrl, S, O, D, RPN, action.., projS, projO, projD, projRPN]
    assertEqual(rows[0][0], 1);
    assertEqual(rows[0][1], 'St');
    assertEqual(rows[0][6], 3);
    assertEqual(rows[0][9], 6);   // RPN
  });

  test('risk with actions yields one row per action', () => {
    const s = new State();
    const r = s.addRisk();
    r.sev = '5'; r.occ = '4'; r.det = '3';
    const a1 = new Action(); a1.text = 'A1';
    const a2 = new Action(); a2.text = 'A2';
    r.actions = [a1, a2];
    const rows = s.csvRows();
    assertEqual(rows.length, 2);
    // first action row carries risk fields, second is blanked for risk cols
    assertEqual(rows[0][0], 1);
    assertEqual(rows[1][0], '');
    assertEqual(rows[1][1], '');
  });
});
