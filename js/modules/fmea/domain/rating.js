/**
 * D.Mike — FMEA: Bewertung.
 *
 * Reine Rechnung über die gespeicherte Form: RPN = S × O × D, Aufgabenpriorität
 * (AIAG-VDA) über die Tabelle in ap.js, Zielwerte über die Senkungen der
 * Maßnahmen, Prüfregeln, Kennzahlen, Sortierung und die Burndown-Reihen je
 * Methode. S/O/D sind ganze Zahlen 1–10 oder `null` (unbewertet), die
 * Senkungen ganze Zahlen 0–9. Ohne DOM, ohne i18n, ohne Kernimporte.
 */
import { actionPriority, AP_RANK, AP_CATEGORY } from './ap.js';

/** RPN-Schwellen (untere Grenze einschließlich). */
export const RPN_CRITICAL = 200;   // > 200
export const RPN_HIGH = 125;       // 125–200
export const RPN_MEDIUM = 50;      // 50–124

/** Bewertungsmethoden; die erste ist die Vorgabe einer neuen FMEA. */
export const METHODS = Object.freeze(['ap', 'rpn']);
/** Arten der FMEA; die erste ist die Vorgabe. */
export const FMEA_TYPES = Object.freeze(['process', 'design']);
/** Besondere Merkmale; '' = keines, CC = kritisch, SC = signifikant. */
export const SPECIAL_CHARS = Object.freeze(['', 'CC', 'SC']);

/**
 * @typedef {object} ActionLike
 * @property {string} text
 * @property {string} date
 * @property {boolean} done
 * @property {number} deltaS
 * @property {number} deltaO
 * @property {number} deltaD
 */

/**
 * @typedef {object} RiskLike
 * @property {number|null} sev
 * @property {number|null} occ
 * @property {number|null} det
 * @property {string} specialChar
 * @property {string} justification
 * @property {ReadonlyArray<ActionLike>} actions
 */

/** @param {number|null|undefined} v @returns {number} die Stufe, unbewertet 0 */
const val = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * RPN → Kategorie.
 * @param {number} v RPN (0 = unbewertet)
 * @returns {'critical'|'high'|'medium'|'low'|'none'}
 */
export function rpnCategory(v) {
  if (!v) return 'none';
  if (v > RPN_CRITICAL) return 'critical';
  if (v >= RPN_HIGH) return 'high';
  if (v >= RPN_MEDIUM) return 'medium';
  return 'low';
}

/** @param {'H'|'M'|'L'|null} ap @returns {'high'|'medium'|'low'|'none'} */
export const apCategory = (ap) => /** @type {'high'|'medium'|'low'|'none'} */ ((ap && AP_CATEGORY[ap]) || 'none');

/** @param {RiskLike} r @returns {number} S×O×D, 0 solange eine Stufe fehlt */
export function rpn(r) {
  const s = val(r.sev), o = val(r.occ), d = val(r.det);
  return (s && o && d) ? s * o * d : 0;
}

/** @param {RiskLike} r @param {'deltaS'|'deltaO'|'deltaD'} field @returns {number} */
function sumDelta(r, field) {
  let sum = 0;
  for (const a of r.actions) sum += val(a[field]);
  return sum;
}

/** @param {RiskLike} r @returns {number} Ziel-S = max(1, S − ΣΔS) */
export const projS = (r) => Math.max(1, val(r.sev) - sumDelta(r, 'deltaS'));
/** @param {RiskLike} r @returns {number} Ziel-O = max(1, O − ΣΔO) */
export const projO = (r) => Math.max(1, val(r.occ) - sumDelta(r, 'deltaO'));
/** @param {RiskLike} r @returns {number} Ziel-D = max(1, D − ΣΔD) */
export const projD = (r) => Math.max(1, val(r.det) - sumDelta(r, 'deltaD'));

/** @param {RiskLike} r @returns {number} Ziel-RPN, 0 solange die RPN 0 ist */
export function projRpn(r) {
  return rpn(r) ? projS(r) * projO(r) * projD(r) : 0;
}

/** @param {RiskLike} r @returns {'H'|'M'|'L'|null} Aufgabenpriorität von S/O/D */
export const ap = (r) => actionPriority(r.sev ?? '', r.occ ?? '', r.det ?? '');

/** @param {RiskLike} r @returns {'H'|'M'|'L'|null} Aufgabenpriorität nach allen Senkungen */
export function projAp(r) {
  return ap(r) ? actionPriority(projS(r), projO(r), projD(r)) : null;
}

/** @param {RiskLike} r @returns {boolean} AP H ohne Maßnahme mit Text und ohne Begründung */
export function needsJustification(r) {
  return ap(r) === 'H'
    && !r.actions.some((a) => a.text.trim() !== '')
    && r.justification.trim() === '';
}

/** @param {RiskLike} r @returns {boolean} S 9 oder 10 */
export const isHighSeverity = (r) => val(r.sev) >= 9;

/** @param {RiskLike} r @returns {boolean} S ≥ 9 ohne besonderes Merkmal */
export const suggestsSpecialChar = (r) => isHighSeverity(r) && r.specialChar === '';

/**
 * Ein Kalendertag JJJJ-MM-TT, den `Date` versteht — Altstände können
 * Freitext im Datum tragen, der sonst NaN in die Reihen schriebe.
 * @param {unknown} v @returns {boolean}
 */
function isIsoDay(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(v).getTime());
}

/**
 * Die Maßnahmen eines Risikos mit gültigem ISO-Datum, nach Datum aufsteigend.
 * @param {RiskLike} r @returns {ActionLike[]}
 */
function datedActions(r) {
  return r.actions.filter((a) => isIsoDay(a.date)).sort((x, y) => x.date.localeCompare(y.date));
}

/**
 * Spielt die datierten Maßnahmen eines Risikos zweimal ab: der Plan wendet
 * jede an, das Ist nur die erledigten — eine offene Maßnahme bläht so nie das
 * Ergebnis einer späteren erledigten auf. Ein Ereignis je Maßnahme, die eines
 * der beiden Abspiele ändert.
 * @param {RiskLike} r ein bewertetes Risiko
 * @param {(s: number, o: number, d: number) => Record<string, number>} measure Reihenwerte zu S/O/D
 * @returns {Array<{ ts: number, done: boolean, dec: Record<string, number>, actDec: Record<string, number> }>}
 */
function replayActions(r, measure) {
  const events = [];
  const plan = { s: val(r.sev), o: val(r.occ), d: val(r.det) };
  const act = { ...plan };
  /** @param {{ s: number, o: number, d: number }} run @param {ActionLike} a */
  const apply = (run, a) => {
    run.s = Math.max(1, run.s - val(a.deltaS));
    run.o = Math.max(1, run.o - val(a.deltaO));
    run.d = Math.max(1, run.d - val(a.deltaD));
  };
  /** @param {Record<string, number>} before @param {Record<string, number>} after */
  const diff = (before, after) => {
    /** @type {Record<string, number>} */
    const dec = {};
    for (const k of Object.keys(before)) dec[k] = before[k] - after[k];
    return dec;
  };
  let planVal = measure(plan.s, plan.o, plan.d);
  let actVal = planVal;
  for (const a of datedActions(r)) {
    const done = Boolean(a.done);
    apply(plan, a);
    const nextPlan = measure(plan.s, plan.o, plan.d);
    const dec = diff(planVal, nextPlan);
    planVal = nextPlan;
    let actDec = diff(actVal, actVal);
    if (done) {
      apply(act, a);
      const nextAct = measure(act.s, act.o, act.d);
      actDec = diff(actVal, nextAct);
      actVal = nextAct;
    }
    const changed = Object.values(dec).some(Boolean) || Object.values(actDec).some(Boolean);
    if (changed) events.push({ ts: new Date(a.date).getTime(), done, dec, actDec });
  }
  return events;
}

/**
 * Ereignisse → Stufenreihen Plan/Ist; Start = frühestes Ereignis − 1 Tag.
 * @param {Array<{ ts: number, done: boolean, dec: Record<string, number>, actDec: Record<string, number> }>} events nicht leer
 * @param {Record<string, number>} start Startwert je Reihe
 * @returns {{ planX: number[], actX: number[], plan: Record<string, number[]>, act: Record<string, number[]> }}
 */
function stepSeries(events, start) {
  events.sort((a, b) => a.ts - b.ts);
  const keys = Object.keys(start);
  const startTs = events[0].ts - 86400000;
  const planX = [startTs], actX = [startTs];
  /** @type {Record<string, number[]>} */ const plan = {};
  /** @type {Record<string, number[]>} */ const act = {};
  const planCur = { ...start }, actCur = { ...start };
  for (const k of keys) { plan[k] = [start[k]]; act[k] = [start[k]]; }
  for (const ev of events) {
    planX.push(ev.ts);
    for (const k of keys) { planCur[k] -= ev.dec[k]; plan[k].push(planCur[k]); }
    if (ev.done) {
      actX.push(ev.ts);
      for (const k of keys) { actCur[k] -= ev.actDec[k]; act[k].push(actCur[k]); }
    }
  }
  return { planX, actX, plan, act };
}

/** Klassische Bewertung (S × O × D mit festen Schwellen). */
export const rpnRating = Object.freeze({
  /** @param {RiskLike} r */
  category: (r) => rpnCategory(rpn(r)),
  /** @param {RiskLike} r */
  projCategory: (r) => rpnCategory(projRpn(r)),
  /** RPN absteigend. @param {RiskLike} a @param {RiskLike} b */
  compare: (a, b) => rpn(b) - rpn(a),
  /**
   * @param {ReadonlyArray<RiskLike>} risks
   * @returns {{ kind: 'rpn', total: number, critical: number, high: number, medium: number, low: number,
   *   highSeverity: number, avg: number|null, max: number }} avg `null` ohne bewertetes Risiko
   */
  stats(risks) {
    let total = 0, critical = 0, high = 0, medium = 0, low = 0, highSeverity = 0, sum = 0, count = 0, max = 0;
    for (const r of risks) {
      total++;
      if (isHighSeverity(r)) highSeverity++;
      const v = rpn(r);
      if (v > 0) {
        count++; sum += v;
        if (v > max) max = v;
        const cat = rpnCategory(v);
        if (cat === 'critical') critical++;
        else if (cat === 'high') high++;
        else if (cat === 'medium') medium++;
        else low++;
      }
    }
    return { kind: 'rpn', total, critical, high, medium, low, highSeverity, avg: count ? Math.round(sum / count) : null, max };
  },
  /**
   * Burndown der RPN-Summe; jede RPN-Senkung einer datierten Maßnahme ist ein Ereignis.
   * @param {ReadonlyArray<RiskLike>} risks
   * @returns {{ kind: 'rpn', planX: number[], planY: number[], actX: number[], actY: number[], totalRPN: number }|null}
   */
  burndownSeries(risks) {
    const events = [];
    let totalRPN = 0;
    for (const r of risks) {
      const s0 = val(r.sev), o0 = val(r.occ), d0 = val(r.det);
      if (!s0 || !o0 || !d0) continue;
      totalRPN += s0 * o0 * d0;
      events.push(...replayActions(r, (sv, o, d) => ({ y: sv * o * d })));
    }
    if (!events.length || !totalRPN) return null;
    const { planX, actX, plan, act } = stepSeries(events, { y: totalRPN });
    return { kind: 'rpn', planX, planY: plan.y, actX, actY: act.y, totalRPN };
  },
});

/** @param {'H'|'M'|'L'|null} level @returns {{ h: number, hm: number }} */
const counts = (level) => ({ h: level === 'H' ? 1 : 0, hm: level === 'H' || level === 'M' ? 1 : 0 });

/** Aufgabenpriorität nach AIAG-VDA (Tabelle H / M / L). */
export const apRating = Object.freeze({
  /** @param {RiskLike} r */
  category: (r) => apCategory(ap(r)),
  /** @param {RiskLike} r */
  projCategory: (r) => apCategory(projAp(r)),
  /**
   * AP-Stufe, dann S, dann O, dann D — je absteigend; Unbewertete zuletzt.
   * @param {RiskLike} a @param {RiskLike} b
   */
  compare(a, b) {
    const ra = ap(a), rb = ap(b);
    return ((rb ? AP_RANK[rb] : 0) - (ra ? AP_RANK[ra] : 0))
      || (val(b.sev) - val(a.sev))
      || (val(b.occ) - val(a.occ))
      || (val(b.det) - val(a.det));
  },
  /**
   * @param {ReadonlyArray<RiskLike>} risks
   * @returns {{ kind: 'ap', total: number, rated: number, high: number, medium: number, low: number, unjustified: number }}
   */
  stats(risks) {
    const st = { kind: /** @type {'ap'} */ ('ap'), total: 0, rated: 0, high: 0, medium: 0, low: 0, unjustified: 0 };
    for (const r of risks) {
      st.total++;
      if (needsJustification(r)) st.unjustified++;
      const cat = apCategory(ap(r));
      if (cat === 'none') continue;
      st.rated++;
      st[cat]++;
    }
    return st;
  },
  /**
   * Burndown der Zahl der H- und der H+M-Risiken; jede datierte Maßnahme, die
   * die AP-Stufe eines Risikos ändert, ist ein Ereignis.
   * @param {ReadonlyArray<RiskLike>} risks
   * @returns {{ kind: 'ap', planX: number[], planH: number[], planHM: number[], actX: number[], actH: number[], actHM: number[] }|null}
   */
  burndownSeries(risks) {
    const events = [];
    const start = { h: 0, hm: 0 };
    for (const r of risks) {
      const cur = ap(r);
      if (!cur) continue;
      const c = counts(cur);
      start.h += c.h;
      start.hm += c.hm;
      events.push(...replayActions(r, (sv, o, d) => counts(actionPriority(sv, o, d))));
    }
    if (!events.length) return null;
    const { planX, actX, plan, act } = stepSeries(events, start);
    return { kind: 'ap', planX, planH: plan.h, planHM: plan.hm, actX, actH: act.h, actHM: act.hm };
  },
});

/**
 * Die Bewertung der Methode.
 * @param {string} method `ap` oder `rpn`
 * @returns {typeof apRating|typeof rpnRating}
 */
export function rating(method) {
  return method === 'ap' ? apRating : rpnRating;
}
