/**
 * D.Mike — TRIZ function analysis: derived values.
 *
 * Pure functions over plain data (`components`, `interactions`, `exclusions`,
 * `functions`). Rank, open pairs, disadvantages and value & cost are derived
 * and never stored.
 */

/**
 * @typedef {Object} AnalysisData
 * @property {Object[]} [components]
 * @property {Object[]} [interactions]
 * @property {Object[]} [exclusions]
 * @property {Object[]} [functions]
 */

export const KINDS = ['target', 'system', 'supersystem'];
/** Display order of the component groups: supersystem, then the target, then the system. */
export const GROUPS = ['supersystem', 'target', 'system'];
export const TYPES = ['useful', 'harmful'];
export const LEVELS = ['adequate', 'insufficient', 'excessive'];
export const TABS = ['components', 'interactions', 'model', 'valueCost'];

/**
 * Key of an unordered pair.
 * @param {string} a @param {string} b
 * @returns {string}
 */
export function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Functions grouped by their (undirected) pair, in order of first appearance.
 * Incomplete functions each get a group of their own (key `draft|<id>`).
 * @param {{functions: Object[]}} state
 * @returns {Array<{key:string,a:string,b:string,complete:boolean,functions:Object[]}>}
 */
export function functionPairs(state) {
  const groups = new Map();
  for (const f of state.functions) {
    const complete = isComplete(f);
    const key = complete ? pairKey(f.carrier, f.object) : `draft|${f.id}`;
    if (!groups.has(key)) groups.set(key, { key, a: f.carrier, b: f.object, complete, functions: [] });
    groups.get(key).functions.push(f);
  }
  return [...groups.values()];
}

/**
 * Components grouped target → system → supersystem, entry order within a group.
 * @param {Array<Object>} components
 * @returns {Array<Object>}
 */
export function orderedComponents(components) {
  return KINDS.flatMap((k) => components.filter((c) => c.kind === k));
}

/** @param {Object} fn @returns {boolean} both ends set and different */
export function isComplete(fn) {
  return Boolean(fn && fn.carrier && fn.object && fn.carrier !== fn.object);
}

const RANK_BY_KIND = { target: 'basic', supersystem: 'additional', system: 'auxiliary' };

/**
 * Derived rank of a function: useful on the target → basic, on a supersystem
 * element → additional, on a system component → auxiliary; harmful or draft → null.
 * @param {Object} fn @param {Array<Object>} components
 * @returns {'basic'|'additional'|'auxiliary'|null}
 */
export function rankOf(fn, components) {
  if (!isComplete(fn) || fn.type !== 'useful') return null;
  const obj = components.find((c) => c.id === fn.object);
  return obj ? RANK_BY_KIND[obj.kind] ?? null : null;
}

/**
 * Rank of every useful complete function, auxiliary ones with their level:
 * Ax1 acts on a component that carries a basic or additional function, Axk on
 * one that carries an Ax(k−1) function; the shortest way counts. Auxiliary
 * functions without a way to a basic or additional function get level null.
 * @param {{components: Object[], functions: Object[]}} state
 * @returns {Map<string, {rank:'basic'|'additional'|'auxiliary', level:number|null}>}
 */
export function functionRanks(state) {
  const ranked = state.functions
    .map((f) => ({ f, rank: rankOf(f, state.components) }))
    .filter((r) => r.rank);
  // Breadth-first from the carriers of basic/additional functions (depth 0).
  const depth = new Map();
  let frontier = ranked.filter((r) => r.rank !== 'auxiliary').map((r) => r.f.carrier);
  for (let d = 0; frontier.length; d++) {
    const next = [];
    for (const id of frontier) if (!depth.has(id)) depth.set(id, d);
    for (const { f, rank } of ranked) {
      if (rank === 'auxiliary' && depth.get(f.object) === d && !depth.has(f.carrier)) next.push(f.carrier);
    }
    frontier = next;
  }
  return new Map(ranked.map(({ f, rank }) => [f.id, {
    rank, level: rank === 'auxiliary' && depth.has(f.object) ? depth.get(f.object) + 1 : null,
  }]));
}

/** Points per useful function by rank, for the value & cost analysis. */
export const SCORE_BY_RANK = { basic: 3, additional: 2, auxiliary: 1 };

/**
 * Function value of a component: the rank scores of the functions it carries
 * (harmful and draft functions score 0).
 * @param {string} id @param {{components: Object[], functions: Object[]}} state
 * @returns {number}
 */
export function componentValue(id, state) {
  return state.functions
    .filter((f) => f.carrier === id)
    .reduce((sum, f) => sum + (SCORE_BY_RANK[rankOf(f, state.components)] ?? 0), 0);
}

/**
 * Value & cost rows of the system components, in entry order. Value and cost
 * are normalised to 0…10 against the largest value / entered cost.
 * @param {AnalysisData} state
 * @returns {Array<{id:string,name:string,value:number,normValue:number,cost:number|null,normCost:number|null}>}
 */
export function valueCostRows(state) {
  const system = state.components.filter((c) => c.kind === 'system');
  const values = system.map((c) => componentValue(c.id, state));
  const maxValue = Math.max(0, ...values);
  const maxCost = Math.max(0, ...system.map((c) => c.cost ?? 0));
  return system.map((c, i) => ({
    id: c.id,
    name: c.name,
    value: values[i],
    normValue: maxValue > 0 ? values[i] / maxValue * 10 : 0,
    cost: c.cost ?? null,
    normCost: c.cost == null ? null : (maxCost > 0 ? c.cost / maxCost * 10 : 0),
  }));
}

/**
 * Ticked pairs that no complete function uses (in either direction).
 * @param {AnalysisData} state
 * @returns {Array<{a:string,b:string}>}
 */
export function openPairs(state) {
  const used = new Set(state.functions.filter(isComplete).map((f) => pairKey(f.carrier, f.object)));
  return state.interactions.filter((i) => !used.has(pairKey(i.a, i.b))).map((i) => ({ a: i.a, b: i.b }));
}

/**
 * Functional disadvantages — the handover shape for part 2.
 * @param {AnalysisData} state
 * @returns {Array<{functionId:string,carrier:string,verb:string,object:string,parameter:string,kind:'harmful'|'insufficient'|'excessive'}>}
 */
export function disadvantages(state) {
  const name = (id) => state.components.find((c) => c.id === id)?.name ?? '';
  const out = [];
  for (const f of state.functions) {
    if (!isComplete(f)) continue;
    let kind = null;
    if (f.type === 'harmful') kind = 'harmful';
    else if (f.level === 'insufficient' || f.level === 'excessive') kind = f.level;
    if (!kind) continue;
    out.push({ functionId: f.id, carrier: name(f.carrier), verb: f.verb, object: name(f.object), parameter: f.parameter, kind });
  }
  return out;
}
