import { suite, test, assertEqual } from '../test-utils.js';
import { Action, Risk, State, rpnRating, apRating, rpnCategory } from '../../js/modules/fmea/fmea-model.js';

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

  test('sortByPriority sorts by RPN descending in RPN mode', () => {
    const s = new State();
    s.method = 'rpn';
    const lo = s.addRisk(); lo.sev = '1'; lo.occ = '1'; lo.det = '1';   // 1
    const hi = s.addRisk(); hi.sev = '10'; hi.occ = '10'; hi.det = '10'; // 1000
    s.sortByPriority();
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
    s.method = 'rpn';
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
      s.method = 'rpn';
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
    s.method = 'rpn';
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
    s.method = 'rpn';
    const r = s.addRisk();  // unrated
    s.addAction(r.id);
    assertEqual(s.burndownSeries(), null);
  });

  test('plan covers all events, actual only done events', () => {
    const s = new State();
    s.method = 'rpn';
    const r = s.addRisk();
    r.sev = '5'; r.occ = '4'; r.det = '3'; // RPN 60
    const a1 = new Action(); a1.date = '2025-06-01'; a1.deltaS = '1'; a1.done = true;
    const a2 = new Action(); a2.date = '2025-07-01'; a2.deltaO = '1'; a2.done = false;
    r.actions = [a1, a2];
    const bd = s.burndownSeries();
    assertEqual(bd.kind, 'rpn');
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
    s.method = 'rpn';
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
    s.method = 'rpn';
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

suite('FMEA Model — Risk action priority', () => {
  const rated = (s, o, d) => { const r = new Risk(); r.sev = String(s); r.occ = String(o); r.det = String(d); return r; };

  test('ap() looks up S/O/D in the AP table', () => {
    assertEqual(rated(9, 4, 1).ap(), 'M');
    assertEqual(rated(8, 6, 6).ap(), 'H');
    assertEqual(rated(2, 2, 2).ap(), 'L');
  });

  test('ap() is null while S, O or D is unset', () => {
    const r = new Risk(); r.sev = '9'; r.occ = '4';
    assertEqual(r.ap(), null);
  });

  test('projAp() applies the summed action deltas', () => {
    const r = rated(8, 6, 6);              // H
    const a = new Action(); a.deltaO = '3'; // O 6 → 3
    r.actions = [a];
    assertEqual(r.projAp(), 'M');          // S 7–8, O 2–3, D 5–6
  });

  test('projAp() clamps each rating at 1 for large deltas', () => {
    const r = rated(9, 9, 9);
    const a = new Action(); a.deltaS = '9'; a.deltaO = '9'; a.deltaD = '9';
    r.actions = [a];
    assertEqual(r.projAp(), 'L');
  });

  test('projAp() is null when the base rating is incomplete', () => {
    const r = new Risk(); r.sev = '9';
    r.actions = [new Action()];
    assertEqual(r.projAp(), null);
  });
});

suite('FMEA Model — method and FMEA type', () => {
  test('new State() starts in AP mode for a process FMEA', () => {
    const s = new State();
    assertEqual(s.method, 'ap');
    assertEqual(s.fmeaType, 'process');
  });

  test('fromJSON without method loads a legacy FMEA as RPN', () => {
    const s = State.fromJSON({ risks: [] });
    assertEqual(s.method, 'rpn');
    assertEqual(s.fmeaType, 'process');
  });

  test('fromJSON(null) behaves like a new FMEA', () => {
    assertEqual(State.fromJSON(null).method, 'ap');
    assertEqual(State.fromJSON(undefined).method, 'ap');
  });

  test('fromJSON keeps valid values', () => {
    const s = State.fromJSON({ method: 'ap', fmeaType: 'design' });
    assertEqual(s.method, 'ap');
    assertEqual(s.fmeaType, 'design');
  });

  test('fromJSON falls back on invalid values', () => {
    const s = State.fromJSON({ method: 'xyz', fmeaType: 7 });
    assertEqual(s.method, 'rpn');
    assertEqual(s.fmeaType, 'process');
  });

  test('toJSON writes method and fmeaType; switching back and forth is lossless', () => {
    const s = new State();
    const r = s.addRisk(); r.sev = '7'; r.occ = '4'; r.det = '5';
    s.scales = { sevNone: 'Custom RPN', 'ap.process.sev.10.meaning': 'Custom AP' };
    s.method = 'rpn';
    s.fmeaType = 'design';
    s.method = 'ap';
    const back = State.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
    assertEqual(back.method, 'ap');
    assertEqual(back.fmeaType, 'design');
    assertEqual(back.risks[0].sev, '7');
    assertEqual(back.scales.sevNone, 'Custom RPN');
    assertEqual(back.scales['ap.process.sev.10.meaning'], 'Custom AP');
  });
});

suite('FMEA Model — rating strategies', () => {
  const add = (s, sv, o, d) => { const r = s.addRisk(); r.sev = sv ? String(sv) : ''; r.occ = o ? String(o) : ''; r.det = d ? String(d) : ''; return r; };

  test('rating() follows the method', () => {
    const s = new State();
    assertEqual(s.rating(), apRating);
    s.method = 'rpn';
    assertEqual(s.rating(), rpnRating);
  });

  test('rpnCategory thresholds', () => {
    assertEqual(rpnCategory(0), 'none');
    assertEqual(rpnCategory(49), 'low');
    assertEqual(rpnCategory(50), 'medium');
    assertEqual(rpnCategory(125), 'high');
    assertEqual(rpnCategory(200), 'high');
    assertEqual(rpnCategory(201), 'critical');
  });

  test('apRating.category maps H/M/L/null to high/medium/low/none', () => {
    const s = new State();
    assertEqual(apRating.category(add(s, 9, 8, 7)), 'high');
    assertEqual(apRating.category(add(s, 9, 4, 1)), 'medium');
    assertEqual(apRating.category(add(s, 2, 2, 2)), 'low');
    assertEqual(apRating.category(add(s, 9, 0, 0)), 'none');
  });

  test('apRating.projCategory uses the projected AP', () => {
    const s = new State();
    const r = add(s, 8, 6, 6);                 // H
    const a = new Action(); a.deltaO = '3'; r.actions = [a];
    assertEqual(apRating.projCategory(r), 'medium');
  });

  test('rpnRating.category / projCategory use RPN thresholds', () => {
    const s = new State();
    const r = add(s, 10, 10, 10);              // 1000 critical
    const a = new Action(); a.deltaS = '9'; a.deltaO = '9'; r.actions = [a]; // 1*1*10 = 10
    assertEqual(rpnRating.category(r), 'critical');
    assertEqual(rpnRating.projCategory(r), 'low');
  });

  test('AP sort: AP level first, then S, O, D; unrated last', () => {
    const s = new State();
    const unrated = add(s, 9, 0, 0);
    const lowS10 = add(s, 10, 1, 10);          // L despite S 10
    const hS7 = add(s, 7, 8, 1);               // H
    const hS9 = add(s, 9, 6, 1);               // H, higher S
    const m = add(s, 9, 4, 1);                 // M
    s.sortByPriority();
    assertEqual(s.risks.map(r => r.id).join(), [hS9, hS7, m, lowS10, unrated].map(r => r.id).join());
  });

  test('AP sort breaks S ties by O then D', () => {
    const s = new State();
    const a = add(s, 9, 8, 7);                 // H
    const b = add(s, 9, 9, 7);                 // H, higher O
    const c = add(s, 9, 9, 8);                 // H, same O, higher D
    s.sortByPriority();
    assertEqual(s.risks.map(r => r.id).join(), [c, b, a].map(r => r.id).join());
  });

  test('AP stats count H/M/L and rated; partial ratings only count in total', () => {
    const s = new State();
    add(s, 9, 8, 7);   // H
    add(s, 9, 4, 1);   // M
    add(s, 2, 2, 2);   // L
    add(s, 9, 8, 0);   // partial
    const st = s.stats();
    assertEqual(st.kind, 'ap');
    assertEqual(st.total, 4);
    assertEqual(st.rated, 3);
    assertEqual(st.high, 1);
    assertEqual(st.medium, 1);
    assertEqual(st.low, 1);
  });

  test('RPN stats carry kind rpn', () => {
    const s = new State();
    s.method = 'rpn';
    assertEqual(s.stats().kind, 'rpn');
  });
});

suite('FMEA Model — AP burndown series', () => {
  const rated = (s, sv, o, d) => { const r = s.addRisk(); r.sev = String(sv); r.occ = String(o); r.det = String(d); return r; };
  const act = (date, done, { dS = '0', dO = '0', dD = '0' } = {}) => {
    const a = new Action(); a.date = date; a.done = done; a.deltaS = dS; a.deltaO = dO; a.deltaD = dD; return a;
  };

  test('returns null when no action changes an AP level', () => {
    const s = new State();
    const r = rated(s, 9, 8, 7);                       // H
    r.actions = [act('2025-06-01', true, { dD: '1' })]; // D 7 → 6, still H
    assertEqual(s.burndownSeries(), null);
  });

  test('counts H and H+M; plan has all level changes, actual only done ones', () => {
    const s = new State();
    const r1 = rated(s, 8, 6, 6);                       // H
    r1.actions = [act('2025-06-01', true, { dO: '3' })]; // → S8 O3 D6 = M
    const r2 = rated(s, 9, 4, 1);                       // M
    r2.actions = [act('2025-07-01', false, { dO: '2' })]; // → S9 O2 D1 = L
    rated(s, 2, 2, 2);                                  // L, no actions
    const bd = s.burndownSeries();
    assertEqual(bd.kind, 'ap');
    const t1 = new Date('2025-06-01').getTime();
    const t2 = new Date('2025-07-01').getTime();
    assertEqual(bd.planX.join(), [t1 - 86400000, t1, t2].join());
    assertEqual(bd.planH.join(), '1,0,0');
    assertEqual(bd.planHM.join(), '2,2,1');
    assertEqual(bd.actX.join(), [t1 - 86400000, t1].join());
    assertEqual(bd.actH.join(), '1,0');
    assertEqual(bd.actHM.join(), '2,2');
  });

  test('applies a risk\'s dated actions in date order', () => {
    const s = new State();
    const r = rated(s, 8, 8, 7);                        // H
    r.actions = [
      act('2025-08-01', true, { dO: '2' }),             // second: O 4 → 2 → M (S7–8,O2–3,D7–10)
      act('2025-05-01', true, { dO: '4' }),             // first:  O 8 → 4 → H (S7–8,O4–5,D7–10) no change
    ];
    const bd = s.burndownSeries();
    const t = new Date('2025-08-01').getTime();
    assertEqual(bd.planX.join(), [t - 86400000, t].join());
    assertEqual(bd.planH.join(), '1,0');
    assertEqual(bd.planHM.join(), '1,1');
  });

  test('ignores undated actions and unrated risks', () => {
    const s = new State();
    const unrated = s.addRisk(); unrated.sev = '9';
    unrated.actions = [act('2025-06-01', true, { dS: '5' })];
    const r = rated(s, 8, 6, 6);
    r.actions = [act('', true, { dO: '3' })];
    assertEqual(s.burndownSeries(), null);
  });
});
