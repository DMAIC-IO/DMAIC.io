/**
 * D.Mike — FMEA Model (fmea-model.js)
 *
 * Pure business logic + state for Failure Mode and Effects Analysis, rated by
 * RPN or AIAG-VDA action priority via a rating strategy:
 * RPN = Severity × Occurrence × Detection, AP = table lookup of S/O/D,
 * projected values via per-action S/O/D deltas, risk statistics, priority
 * sort, the action burndown series, and the raw CSV row matrix.
 *
 * No DOM, no i18n, no CSS, no view flags. View transformations (badge classes,
 * scale i18n text, '—' formatting) live in the module's data-fn.
 *
 * Persistence shape matches the legacy module exactly:
 *   { risks: [ { id, step, failureMode, effect, cause, control,
 *                sev, occ, det,            // strings: '' | '1'..'10'
 *                actions: [ { text, resp, date, done,
 *                             deltaS, deltaO, deltaD } ],  // strings '0'..'9'
 *                collapsed } ],
 *     scales: { key: text } | null,
 *     method: 'ap' | 'rpn',          // missing in legacy data → 'rpn'
 *     fmeaType: 'process' | 'design', // selects the AP scale texts
 *   }
 */

import { actionPriority, AP_RANK, AP_CATEGORY } from './fmea-ap.js';

/** RPN category thresholds (inclusive lower bound). */
export const RPN_CRITICAL = 200;   // > 200
export const RPN_HIGH = 125;       // 125–200
export const RPN_MEDIUM = 50;      // 50–124

/** Rating methods; the first is the default for a new FMEA. */
export const METHODS = ['ap', 'rpn'];
/** FMEA types; the first is the default. */
export const FMEA_TYPES = ['process', 'design'];

/**
 * RPN → category key.
 * @param {number} v RPN (0 = unrated)
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
const apCategory = (ap) => AP_CATEGORY[ap] || 'none';

let _seq = 0;
function generateId() {
  _seq += 1;
  return `f${  Date.now().toString(36)  }${Math.random().toString(36).slice(2, 6)  }${_seq.toString(36)}`;
}

/** @param {*} v @returns {string} only genuine strings pass; others reset to '' */
function asStr(v) {
  return typeof v === 'string' ? v : '';
}

/** @param {*} v @returns {string} numeric-like value coerced to a string ('0' default) */
function asDeltaStr(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '0';
}

/** @param {*} v @returns {number} integer value of a numeric string, else 0 */
function asInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

export class Action {
  /** @type {string} transient id — for keyed x-for, NOT persisted */
  id = generateId();
  text = '';
  resp = '';
  date = '';
  done = false;
  deltaS = '0';
  deltaO = '0';
  deltaD = '0';

  toJSON() {
    return {
      text: this.text,
      resp: this.resp,
      date: this.date,
      done: this.done,
      deltaS: this.deltaS,
      deltaO: this.deltaO,
      deltaD: this.deltaD,
    };
  }

  /** @param {*} d @returns {Action} */
  static fromJSON(d) {
    const a = new Action();
    if (d && typeof d === 'object') {
      a.text = asStr(d.text);
      a.resp = asStr(d.resp);
      a.date = asStr(d.date);
      a.done = Boolean(d.done);
      a.deltaS = asDeltaStr(d.deltaS);
      a.deltaO = asDeltaStr(d.deltaO);
      a.deltaD = asDeltaStr(d.deltaD);
    }
    return a;
  }
}

export class Risk {
  /** @type {string} stable id — persisted (used by POM + keyed x-for) */
  id = generateId();
  step = '';
  failureMode = '';
  effect = '';
  cause = '';
  control = '';
  sev = '';
  occ = '';
  det = '';
  /** @type {Action[]} */
  actions = [];
  collapsed = false;

  // ── RPN math ──────────────────────────────────────────────

  /** @returns {number} S×O×D, or 0 if any of S/O/D is unset */
  rpn() {
    const s = asInt(this.sev), o = asInt(this.occ), d = asInt(this.det);
    return (s && o && d) ? s * o * d : 0;
  }

  /** @returns {number} sum of a delta field over all actions */
  _sumDelta(field) {
    let sum = 0;
    for (const a of this.actions) sum += asInt(a[field]);
    return sum;
  }

  /** @returns {number} projected Severity = max(1, S − ΣΔS) */
  projS() { return Math.max(1, asInt(this.sev) - this._sumDelta('deltaS')); }
  /** @returns {number} projected Occurrence = max(1, O − ΣΔO) */
  projO() { return Math.max(1, asInt(this.occ) - this._sumDelta('deltaO')); }
  /** @returns {number} projected Detection = max(1, D − ΣΔD) */
  projD() { return Math.max(1, asInt(this.det) - this._sumDelta('deltaD')); }

  /** @returns {number} projected RPN, 0 if base RPN is 0 */
  projRpn() {
    const s = asInt(this.sev), o = asInt(this.occ), d = asInt(this.det);
    return (s && o && d) ? this.projS() * this.projO() * this.projD() : 0;
  }

  /** @returns {'H'|'M'|'L'|null} AIAG-VDA action priority of S/O/D */
  ap() { return actionPriority(this.sev, this.occ, this.det); }

  /** @returns {'H'|'M'|'L'|null} action priority after all action deltas */
  projAp() {
    return this.ap() ? actionPriority(this.projS(), this.projO(), this.projD()) : null;
  }

  // ── Serialization ─────────────────────────────────────────

  toJSON() {
    return {
      id: this.id,
      step: this.step,
      failureMode: this.failureMode,
      effect: this.effect,
      cause: this.cause,
      control: this.control,
      sev: this.sev,
      occ: this.occ,
      det: this.det,
      actions: this.actions.map(a => a.toJSON()),
      collapsed: this.collapsed,
    };
  }

  /** @param {*} d @returns {Risk} */
  static fromJSON(d) {
    const r = new Risk();
    if (d && typeof d === 'object') {
      if (typeof d.id === 'string' && d.id) r.id = d.id;
      r.step = asStr(d.step);
      r.failureMode = asStr(d.failureMode);
      r.effect = asStr(d.effect);
      r.cause = asStr(d.cause);
      r.control = asStr(d.control);
      r.sev = asStr(d.sev);
      r.occ = asStr(d.occ);
      r.det = asStr(d.det);
      r.actions = Array.isArray(d.actions) ? d.actions.map(Action.fromJSON) : [];
      r.collapsed = Boolean(d.collapsed);
    }
    return r;
  }
}

/**
 * Dated actions of a risk, sorted by date ascending.
 * @param {Risk} r @returns {Action[]}
 */
function datedActions(r) {
  return r.actions.filter(a => a.date).sort((x, y) => x.date.localeCompare(y.date));
}

/**
 * Turn sorted events into plan/actual step series. Each event carries one
 * decrement per series key; plan applies all events, actual only done ones.
 * Start point = earliest event − 1 day.
 * @param {Array<{ts:number, done:boolean, dec:Object<string,number>}>} events non-empty
 * @param {Object<string,number>} start start value per series key
 * @returns {{planX:number[], actX:number[], plan:Object<string,number[]>, act:Object<string,number[]>}}
 */
function stepSeries(events, start) {
  events.sort((a, b) => a.ts - b.ts);
  const keys = Object.keys(start);
  const startTs = events[0].ts - 86400000;
  const planX = [startTs], actX = [startTs];
  const plan = {}, act = {}, planCur = { ...start }, actCur = { ...start };
  for (const k of keys) { plan[k] = [start[k]]; act[k] = [start[k]]; }
  for (const ev of events) {
    planX.push(ev.ts);
    for (const k of keys) { planCur[k] -= ev.dec[k]; plan[k].push(planCur[k]); }
    if (ev.done) {
      actX.push(ev.ts);
      for (const k of keys) { actCur[k] -= ev.dec[k]; act[k].push(actCur[k]); }
    }
  }
  return { planX, actX, plan, act };
}

/** Classic RPN rating (S × O × D with fixed thresholds). */
export const rpnRating = {
  /** @param {Risk} risk */
  category: (risk) => rpnCategory(risk.rpn()),
  /** @param {Risk} risk */
  projCategory: (risk) => rpnCategory(risk.projRpn()),
  /** RPN descending. @param {Risk} a @param {Risk} b */
  compare: (a, b) => b.rpn() - a.rpn(),
  /**
   * @param {Risk[]} risks
   * @returns {{kind:'rpn', total:number, critical:number, high:number, medium:number,
   *            low:number, avg:(number|null), max:number}}
   *          avg is null when no risk is rated; max is 0 when none rated.
   */
  stats(risks) {
    let total = 0, critical = 0, high = 0, medium = 0, low = 0, sum = 0, count = 0, max = 0;
    for (const r of risks) {
      total++;
      const v = r.rpn();
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
    return { kind: 'rpn', total, critical, high, medium, low, avg: count ? Math.round(sum / count) : null, max };
  },
  /**
   * Risk burndown on the RPN sum. Each dated action's RPN reduction is one event.
   * @param {Risk[]} risks
   * @returns {{kind:'rpn', planX:number[], planY:number[], actX:number[], actY:number[], totalRPN:number}|null}
   */
  burndownSeries(risks) {
    const events = [];
    let totalRPN = 0;
    for (const r of risks) {
      const s0 = asInt(r.sev), o0 = asInt(r.occ), d0 = asInt(r.det);
      if (!s0 || !o0 || !d0) continue;
      totalRPN += s0 * o0 * d0;
      let runS = s0, runO = o0, runD = d0;
      for (const a of datedActions(r)) {
        const ds = asInt(a.deltaS), doo = asInt(a.deltaO), dd = asInt(a.deltaD);
        if (!ds && !doo && !dd) continue;
        const before = runS * runO * runD;
        runS = Math.max(1, runS - ds);
        runO = Math.max(1, runO - doo);
        runD = Math.max(1, runD - dd);
        const reduction = before - runS * runO * runD;
        if (reduction > 0) {
          events.push({ ts: new Date(a.date).getTime(), done: Boolean(a.done), dec: { y: reduction } });
        }
      }
    }
    if (!events.length || !totalRPN) return null;
    const { planX, actX, plan, act } = stepSeries(events, { y: totalRPN });
    return { kind: 'rpn', planX, planY: plan.y, actX, actY: act.y, totalRPN };
  },
};

/** AIAG-VDA action priority rating (H / M / L table lookup). */
export const apRating = {
  /** @param {Risk} risk */
  category: (risk) => apCategory(risk.ap()),
  /** @param {Risk} risk */
  projCategory: (risk) => apCategory(risk.projAp()),
  /**
   * AP level, then S, then O, then D — all descending; unrated risks last.
   * @param {Risk} a @param {Risk} b
   */
  compare(a, b) {
    return ((AP_RANK[b.ap()] || 0) - (AP_RANK[a.ap()] || 0))
      || (asInt(b.sev) - asInt(a.sev))
      || (asInt(b.occ) - asInt(a.occ))
      || (asInt(b.det) - asInt(a.det));
  },
  /**
   * @param {Risk[]} risks
   * @returns {{kind:'ap', total:number, rated:number, high:number, medium:number, low:number}}
   */
  stats(risks) {
    const st = { kind: 'ap', total: 0, rated: 0, high: 0, medium: 0, low: 0 };
    for (const r of risks) {
      st.total++;
      const cat = apCategory(r.ap());
      if (cat === 'none') continue;
      st.rated++;
      st[cat]++;
    }
    return st;
  },
  /**
   * Burndown on the number of H risks and of H+M risks. Each dated action
   * that changes a risk's AP level is one event.
   * @param {Risk[]} risks
   * @returns {{kind:'ap', planX:number[], planH:number[], planHM:number[],
   *            actX:number[], actH:number[], actHM:number[]}|null}
   */
  burndownSeries(risks) {
    const events = [];
    const start = { h: 0, hm: 0 };
    const isH = (ap) => (ap === 'H' ? 1 : 0);
    const isHM = (ap) => (ap === 'H' || ap === 'M' ? 1 : 0);
    for (const r of risks) {
      let cur = r.ap();
      if (!cur) continue;
      start.h += isH(cur);
      start.hm += isHM(cur);
      let runS = asInt(r.sev), runO = asInt(r.occ), runD = asInt(r.det);
      for (const a of datedActions(r)) {
        runS = Math.max(1, runS - asInt(a.deltaS));
        runO = Math.max(1, runO - asInt(a.deltaO));
        runD = Math.max(1, runD - asInt(a.deltaD));
        const next = actionPriority(runS, runO, runD);
        if (next === cur) continue;
        events.push({
          ts: new Date(a.date).getTime(),
          done: Boolean(a.done),
          dec: { h: isH(cur) - isH(next), hm: isHM(cur) - isHM(next) },
        });
        cur = next;
      }
    }
    if (!events.length) return null;
    const { planX, actX, plan, act } = stepSeries(events, start);
    return { kind: 'ap', planX, planH: plan.h, planHM: plan.hm, actX, actH: act.h, actHM: act.hm };
  },
};

export class State {
  /** @type {Risk[]} */
  risks = [];
  /** @type {object|null} custom scale-text overrides, null = use i18n defaults */
  scales = null;
  /** @type {'ap'|'rpn'} rating method; a new FMEA uses AP */
  method = 'ap';
  /** @type {'process'|'design'} selects the AP scale texts */
  fmeaType = 'process';

  // ── Content / CRUD ────────────────────────────────────────

  /** @returns {boolean} true if any risk exists (for loadExample confirm) */
  hasContent() {
    return this.risks.length > 0;
  }

  /** @returns {Risk} the new, blank risk */
  addRisk() {
    const r = new Risk();
    this.risks.push(r);
    return r;
  }

  /** @param {string} id */
  removeRisk(id) {
    this.risks = this.risks.filter(r => r.id !== id);
  }

  /** @param {string} riskId @returns {Action|null} */
  addAction(riskId) {
    const r = this.risks.find(rr => rr.id === riskId);
    if (!r) return null;
    const a = new Action();
    r.actions.push(a);
    return a;
  }

  /** @param {string} riskId @param {number} idx */
  removeAction(riskId, idx) {
    const r = this.risks.find(rr => rr.id === riskId);
    if (r) r.actions.splice(idx, 1);
  }

  /** @returns {typeof rpnRating|typeof apRating} strategy for the active method */
  rating() {
    return this.method === 'ap' ? apRating : rpnRating;
  }

  /** Sort risks most urgent first by the active method (stable for ties). */
  sortByPriority() {
    this.risks.sort(this.rating().compare);
  }

  /** Drop all custom scale overrides. */
  resetScales() {
    this.scales = null;
  }

  // ── Statistics ────────────────────────────────────────────

  /** @returns {object} stats of the active rating method (see rpnRating/apRating.stats) */
  stats() {
    return this.rating().stats(this.risks);
  }

  // ── Burndown series (pure) ────────────────────────────────

  /** @returns {object|null} burndown series of the active rating method */
  burndownSeries() {
    return this.rating().burndownSeries(this.risks);
  }

  // ── CSV row matrix (pure) ─────────────────────────────────

  /**
   * Raw CSV data matrix (no escaping, no headers). One row per action, or a
   * single row when a risk has no actions. Column order:
   *   #, step, failureMode, effect, cause, control, S, O, D, RPN, AP,
   *   action, responsible, dueDate, done, ΔS, ΔO, ΔD, ProjS, ProjO, ProjD, ProjRPN, ProjAP
   * `done` is emitted as the language-specific yes/no strings supplied by the caller.
   *
   * @param {{yes?:string, no?:string}} [labels]
   * @returns {Array<Array<string|number>>}
   */
  csvRows(labels = {}) {
    const yes = labels.yes ?? 'Ja';
    const no = labels.no ?? 'Nein';
    const rows = [];

    this.risks.forEach((risk, idx) => {
      const s = asInt(risk.sev), o = asInt(risk.occ), d = asInt(risk.det);
      const rpn = risk.rpn();
      const ap = risk.ap() || '';
      const ps = risk.projS(), po = risk.projO(), pd = risk.projD();
      const prpn = (s && o && d) ? ps * po * pd : '';
      const pap = risk.projAp() || '';
      const head = [idx + 1, risk.step, risk.failureMode, risk.effect, risk.cause, risk.control,
        s || '', o || '', d || '', rpn || '', ap];
      const blankHead = ['', '', '', '', '', '', '', '', '', '', ''];

      if (!risk.actions.length) {
        rows.push([...head, '', '', '', '', '', '', '', ps, po, pd, prpn, pap]);
      } else {
        risk.actions.forEach((a, ai) => {
          const actionCols = [a.text, a.resp, a.date, a.done ? yes : no, a.deltaS, a.deltaO, a.deltaD];
          rows.push(ai === 0
            ? [...head, ...actionCols, ps, po, pd, prpn, pap]
            : [...blankHead, ...actionCols, '', '', '', '', '']);
        });
      }
    });

    return rows;
  }

  // ── Serialization ─────────────────────────────────────────

  toJSON() {
    return {
      method: this.method,
      fmeaType: this.fmeaType,
      risks: this.risks.map(r => r.toJSON()),
      scales: this.scales ? { ...this.scales } : null,
    };
  }

  /** @param {*} d @returns {State} always a valid State, even for malformed input */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;
    s.method = METHODS.includes(d.method) ? d.method : 'rpn';
    s.fmeaType = FMEA_TYPES.includes(d.fmeaType) ? d.fmeaType : 'process';
    s.risks = Array.isArray(d.risks) ? d.risks.map(Risk.fromJSON) : [];
    s.scales = (d.scales && typeof d.scales === 'object') ? { ...d.scales } : null;
    return s;
  }
}
