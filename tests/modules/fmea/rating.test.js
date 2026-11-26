/**
 * FMEA: reine Bewertung (domain/rating.js) — Fälle aus dem alten
 * fmea.test.js, umgeschrieben auf die gespeicherte Form (S/O/D als Zahl oder
 * `null`, Senkungen als Zahl).
 */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import {
  rpn, projS, projO, projD, projRpn, ap, projAp, needsJustification, isHighSeverity, suggestsSpecialChar,
  rpnCategory, rpnRating, apRating, rating, METHODS, FMEA_TYPES, SPECIAL_CHARS,
} from '../../../js/modules/fmea/domain/rating.js';

/** Risiko mit S/O/D (0 = unbewertet) und Maßnahmen. */
function risk(s, o, d, actions = [], extra = {}) {
  return { sev: s || null, occ: o || null, det: d || null, specialChar: '', justification: '', actions, ...extra };
}
/** Maßnahme. */
function act({ date = '', done = false, dS = 0, dO = 0, dD = 0, text = '' } = {}) {
  return { text, date, done, deltaS: dS, deltaO: dO, deltaD: dD };
}

suite('fmea rating: Listen', () => {
  test('Methoden, Arten und besondere Merkmale wie die Altform', () => {
    assertEqual(METHODS.join(), 'ap,rpn');
    assertEqual(FMEA_TYPES.join(), 'process,design');
    assertEqual(SPECIAL_CHARS.join(), ',CC,SC');
  });
});

suite('fmea rating: RPN', () => {
  test('rpn ist S·O·D, 0 solange eine Stufe fehlt', () => {
    assertEqual(rpn(risk(5, 4, 3)), 60);
    assertEqual(rpn(risk(5, 0, 3)), 0);
    assertEqual(rpn(risk(5, 4, 0)), 0);
    assertEqual(rpn(risk(1, 1, 1)), 1);
    assertEqual(rpn(risk(10, 10, 10)), 1000);
  });
  test('Zielwerte = max(1, Stufe − Σ Senkung)', () => {
    const r = risk(5, 4, 3, [act({ dS: 2, dO: 1, dD: 1 })]);
    assertEqual(projS(r), 3); assertEqual(projO(r), 3); assertEqual(projD(r), 2); assertEqual(projRpn(r), 18);
    const big = risk(5, 4, 3, [act({ dS: 9, dO: 9, dD: 9 })]);
    assertEqual(projS(big), 1); assertEqual(projO(big), 1); assertEqual(projD(big), 1); assertEqual(projRpn(big), 1);
  });
  test('Ziel-RPN 0 ohne RPN; Senkungen summieren über Maßnahmen', () => {
    assertEqual(projRpn(risk(0, 4, 3, [act({ dO: 1 })])), 0);
    const r = risk(8, 8, 8, [act({ dS: 2 }), act({ dS: 3, dO: 1 })]);
    assertEqual(projS(r), 3); assertEqual(projO(r), 7); assertEqual(projD(r), 8);
  });
  test('rpnCategory: Schwellen', () => {
    assertEqual(rpnCategory(0), 'none');
    assertEqual(rpnCategory(49), 'low');
    assertEqual(rpnCategory(50), 'medium');
    assertEqual(rpnCategory(125), 'high');
    assertEqual(rpnCategory(200), 'high');
    assertEqual(rpnCategory(201), 'critical');
  });
  test('Kategorie und Zielkategorie nach RPN', () => {
    const r = risk(10, 10, 10, [act({ dS: 9, dO: 9 })]);
    assertEqual(rpnRating.category(r), 'critical');
    assertEqual(rpnRating.projCategory(r), 'low');
  });
  test('Kennzahlen RPN: Zählung, Mittel gerundet, Maximum, S ≥ 9', () => {
    const st = rpnRating.stats([risk(10, 8, 7), risk(7, 5, 4), risk(5, 4, 3), risk(2, 2, 2), risk(0, 0, 0)]);
    assertEqual(JSON.stringify(st), JSON.stringify({ kind: 'rpn', total: 5, critical: 1, high: 1, medium: 1, low: 1, highSeverity: 1, avg: 192, max: 560 }));
    assertEqual(rpnRating.stats([risk(0, 0, 0)]).avg, null);
    assertEqual(rpnRating.stats([]).max, 0);
  });
});

suite('fmea rating: Aufgabenpriorität', () => {
  test('ap über die Tabelle, null solange eine Stufe fehlt', () => {
    assertEqual(ap(risk(9, 4, 1)), 'M');
    assertEqual(ap(risk(8, 6, 6)), 'H');
    assertEqual(ap(risk(2, 2, 2)), 'L');
    assertEqual(ap(risk(9, 4, 0)), null);
  });
  test('projAp: Senkungen, Klemmen auf 1, null ohne Basis', () => {
    assertEqual(projAp(risk(8, 6, 6, [act({ dO: 3 })])), 'M');
    assertEqual(projAp(risk(9, 9, 9, [act({ dS: 9, dO: 9, dD: 9 })])), 'L');
    assertEqual(projAp(risk(9, 0, 0, [act()])), null);
  });
  test('Kategorien H/M/L/— und Zielkategorie', () => {
    assertEqual(apRating.category(risk(9, 8, 7)), 'high');
    assertEqual(apRating.category(risk(9, 4, 1)), 'medium');
    assertEqual(apRating.category(risk(2, 2, 2)), 'low');
    assertEqual(apRating.category(risk(9, 0, 0)), 'none');
    assertEqual(apRating.projCategory(risk(8, 6, 6, [act({ dO: 3 })])), 'medium');
  });
  test('Sortierung: Stufe, dann S, O, D; Unbewertete zuletzt; stabil', () => {
    const list = [
      { n: 'unrated', ...risk(9, 0, 0) }, { n: 'lowS10', ...risk(10, 1, 10) }, { n: 'hS7', ...risk(7, 8, 1) },
      { n: 'hS9', ...risk(9, 6, 1) }, { n: 'm', ...risk(9, 4, 1) },
    ];
    assertEqual([...list].sort(apRating.compare).map((r) => r.n).join(), 'hS9,hS7,m,lowS10,unrated');
    const ties = [{ n: 'a', ...risk(9, 8, 7) }, { n: 'b', ...risk(9, 9, 7) }, { n: 'c', ...risk(9, 9, 8) }];
    assertEqual([...ties].sort(apRating.compare).map((r) => r.n).join(), 'c,b,a');
  });
  test('Kennzahlen AP: Teilbewertung zählt nur in total', () => {
    const st = apRating.stats([risk(9, 8, 7), risk(9, 4, 1), risk(2, 2, 2), risk(9, 8, 0)]);
    assertEqual(JSON.stringify(st), JSON.stringify({ kind: 'ap', total: 4, rated: 3, high: 1, medium: 1, low: 1, unjustified: 1 }));
  });
  test('rating folgt der Methode', () => {
    assertTrue(rating('ap') === apRating);
    assertTrue(rating('rpn') === rpnRating);
  });
});

suite('fmea rating: Prüfregeln', () => {
  test('needsJustification: AP H ohne Maßnahmentext und ohne Begründung', () => {
    assertEqual(needsJustification(risk(9, 8, 7)), true);
    assertEqual(needsJustification(risk(9, 8, 7, [act({ text: '  ' })])), true);
    assertEqual(needsJustification(risk(9, 8, 7, [act({ text: 'x' })])), false);
    assertEqual(needsJustification(risk(9, 8, 7, [], { justification: ' ok ' })), false);
    assertEqual(needsJustification(risk(9, 4, 1)), false);
  });
  test('S ≥ 9 und Hinweis auf besonderes Merkmal', () => {
    assertEqual(isHighSeverity(risk(9, 0, 0)), true);
    assertEqual(isHighSeverity(risk(8, 0, 0)), false);
    assertEqual(suggestsSpecialChar(risk(10, 0, 0)), true);
    assertEqual(suggestsSpecialChar(risk(10, 0, 0, [], { specialChar: 'CC' })), false);
  });
});

suite('fmea rating: Burndown RPN', () => {
  test('null ohne bewertetes Risiko mit datierter Senkung', () => {
    assertEqual(rpnRating.burndownSeries([risk(0, 0, 0, [act({ date: '2025-06-01', dS: 1 })])]), null);
  });
  test('Plan alle Ereignisse, Ist nur erledigte; Start einen Tag vor der frühesten', () => {
    const bd = rpnRating.burndownSeries([risk(5, 4, 3, [act({ date: '2025-07-01', dO: 1 }), act({ date: '2025-06-01', dS: 1, done: true })])]);
    assertEqual(bd.kind, 'rpn');
    assertEqual(bd.totalRPN, 60);
    assertEqual(bd.planY.join(), '60,48,36');
    assertEqual(bd.planX[0], new Date('2025-06-01').getTime() - 86400000);
    assertEqual(bd.actY.join(), '60,48');
    assertEqual(bd.actX.length, 2);
  });
  test('Ist spielt nur erledigte Maßnahmen ab, auch hinter einer offenen', () => {
    const bd = rpnRating.burndownSeries([risk(5, 4, 3, [act({ date: '2025-06-01', dS: 1 }), act({ date: '2025-07-01', dO: 1, done: true })])]);
    assertEqual(bd.planY.join(), '60,48,36');
    assertEqual(bd.actY.join(), '60,45');
  });
});

suite('fmea rating: Burndown AP', () => {
  test('null, wenn keine Maßnahme eine Stufe ändert', () => {
    assertEqual(apRating.burndownSeries([risk(9, 8, 7, [act({ date: '2025-06-01', done: true, dD: 1 })])]), null);
  });
  test('zählt H und H+M; Plan alle Stufenwechsel, Ist nur erledigte', () => {
    const t1 = new Date('2025-06-01').getTime();
    const t2 = new Date('2025-07-01').getTime();
    const bd = apRating.burndownSeries([
      risk(8, 6, 6, [act({ date: '2025-06-01', done: true, dO: 3 })]),
      risk(9, 4, 1, [act({ date: '2025-07-01', dO: 2 })]),
      risk(2, 2, 2),
    ]);
    assertEqual(bd.planX.join(), [t1 - 86400000, t1, t2].join());
    assertEqual(bd.planH.join(), '1,0,0');
    assertEqual(bd.planHM.join(), '2,2,1');
    assertEqual(bd.actX.join(), [t1 - 86400000, t1].join());
    assertEqual(bd.actH.join(), '1,0');
    assertEqual(bd.actHM.join(), '2,2');
  });
  test('ohne Datum und unbewertet zählt nicht', () => {
    assertEqual(apRating.burndownSeries([
      risk(9, 0, 0, [act({ date: '2025-06-01', done: true, dS: 5 })]),
      risk(8, 6, 6, [act({ done: true, dO: 3 })]),
    ]), null);
  });
});
