/**
 * D.Mike — Ishikawa (6M): Model.
 *
 * Problembeschreibung, Expertenteam, Ursachenbaum als flache Zeilenliste mit
 * `parentId` (Bewertung 0–9 je Experte), gespeicherte Stände (Snapshots),
 * Experimente, Fakten und zwei Bildgalerien. Ohne DOM, ohne i18n.
 *
 * Gespeichert: `{ _schema, problem, experts, catLabels, rows, snapshots,
 * experiments, facts, images, paretoEdits }`. Neue ids sind `max + 1` über die
 * jeweilige Liste (`domain/tree.js`). Dass Baum und ids stimmig sind, sichern
 * die Invarianten — beim Laden repariert, beim Schreiben abgelehnt.
 */
import {
  defineModel, list, object, record, map, text, number, oneOf, idOf, date, image,
} from '../../../core/model.js';
import paretoChart from '../../../widgets/pareto-chart/schema.js';
import { from0 } from './migrations.js';
import { nextStableId } from './tree.js';
import { scoreOf, paretoItems } from './scores.js';

/**
 * Ein Eintrag des Pareto-Diagramms.
 *
 * @typedef {object} ParetoItem
 * @property {string} stableId  stableId of the cause (H-001 …)
 * @property {string} name  the trimmed name, or the stableId when the name is empty
 * @property {string} category  effective category key: own, or inherited from the main cause; '' without one
 * @property {number} score  mean of the given ratings
 */

/**
 * @typedef {object} Row
 * @property {number} id
 * @property {string} stableId
 * @property {number|null} parentId
 * @property {string} category
 * @property {string} name
 * @property {string} description
 * @property {Record<string, number>} ratings
 * @property {string} status
 */

/**
 * True, wenn keine id doppelt vorkommt.
 * @param {ReadonlyArray<unknown>} ids @returns {boolean}
 */
function distinct(ids) {
  return new Set(ids).size === ids.length;
}

/**
 * Spätere Einträge mit schon gesehener id entfallen.
 * @template {{ id: unknown }} T
 * @param {T[]} items @param {Set<unknown>} [seen] gemeinsame Menge über mehrere Listen
 * @returns {T[]}
 */
function dedupe(items, seen = new Set()) {
  return items.filter((x) => {
    if (seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  });
}

/** @param {string} name @returns {string} Vergleichsform eines Expertennamens */
function nameKey(name) {
  return name.trim().toLowerCase();
}

/**
 * ids der Zeilen, die über ihre Eltern zu sich selbst zurückführen.
 * @param {ReadonlyArray<Row>} rows @returns {Set<number>}
 */
function cycleMembers(rows) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out = new Set();
  for (const r of rows) {
    const seen = new Set();
    let p = r.parentId;
    while (p !== null && byId.has(p) && !seen.has(p)) {
      if (p === r.id) { out.add(r.id); break; }
      seen.add(p);
      p = byId.get(p).parentId;
    }
  }
  return out;
}

export class State extends defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    problem: text(),
    experts: list(object({ id: number({ integer: true }), name: text(), color: text() })),
    catLabels: record(['man', 'machine', 'environment', 'material', 'measurement', 'method'], text()),
    rows: list(object({
      id: number({ integer: true }),
      stableId: text(),
      parentId: number({ integer: true, nullable: true }),
      category: oneOf(['', 'man', 'machine', 'environment', 'material', 'measurement', 'method']),
      name: text(),
      description: text(),
      ratings: map(idOf('experts'), number({ integer: true, min: 0, max: 9 })),
      status: oneOf(['open', 'testing', 'confirmed', 'rejected']),
    }), { bulk: true, bulkKind: 'tree' }),
    snapshots: list(object({
      id: number({ integer: true }),
      name: text(),
      date: text(),
      data: object({
        problem: text(),
        experts: list(object({ id: number({ integer: true }), name: text(), color: text() })),
        rows: list(object({
          id: number({ integer: true }),
          stableId: text(),
          parentId: number({ integer: true, nullable: true }),
          category: oneOf(['', 'man', 'machine', 'environment', 'material', 'measurement', 'method']),
          name: text(),
          description: text(),
          ratings: map(number({ integer: true }), number({ integer: true, min: 0, max: 9 })),
          status: oneOf(['open', 'testing', 'confirmed', 'rejected']),
        })),
      }, { omitOnRead: true }),
    }), { bulk: true }),
    experiments: list(object({
      id: number({ integer: true }),
      title: text(),
      description: text(),
      responsible: text(),
      status: oneOf(['planned', 'running', 'done', 'cancelled']),
      startDate: date({ empty: true }),
      endDate: date({ empty: true }),
      costMoney: number({ nullable: true, min: 0 }),
      costHours: number({ nullable: true, min: 0 }),
      hypothesisIds: list(idOf('rows', { key: 'stableId' })),
    })),
    facts: list(object({
      id: number({ integer: true }),
      name: text(),
      description: text(),
      date: date({ empty: true }),
      owner: text(),
    })),
    images: object({
      inScope: list(object({ id: number({ integer: true }), dataUrl: image(), caption: text() })),
      outScope: list(object({ id: number({ integer: true }), dataUrl: image(), caption: text() })),
    }),
  },
  view: {
    paretoEdits: paretoChart.edits(),
  },
  derived: {
    /**
     * Score je Ursache (stableId): Mittel der abgegebenen Bewertungen, ohne Bewertung null.
     * @this {State}
     * @returns {Record<string, number|null>}
     */
    scores() {
      return Object.fromEntries(this.rows.map((/** @type {Row} */ r) => [r.stableId, scoreOf(r)]));
    },
    /**
     * Die bewerteten Ursachen absteigend nach Score; Unterursachen in der Kategorie ihrer Hauptursache.
     * @this {State}
     * @returns {ParetoItem[]}
     */
    paretoItems() {
      return paretoItems(this.rows);
    },
  },
  invariants: {
    uniqueExpertNames: {
      fields: ['experts'],
      test(m) {
        return distinct(m.experts.map((e) => nameKey(e.name)));
      },
      repair(m) {
        const taken = new Set();
        for (const e of m._v.experts) {
          const base = e.name;
          let name = base;
          for (let n = 2; taken.has(nameKey(name)); n++) name = `${base} (${n})`;
          e.name = name;
          taken.add(nameKey(name));
        }
      },
    },
    uniqueRowIds: {
      fields: ['rows'],
      test(m) {
        return distinct(m.rows.map((r) => r.id))
          && m.rows.every((r) => r.stableId !== '')
          && distinct(m.rows.map((r) => r.stableId));
      },
      repair(m) {
        /** @type {Row[]} */
        const rows = dedupe(m._v.rows);
        const seen = new Set();
        for (const r of rows) {
          if (r.stableId === '' || seen.has(r.stableId)) r.stableId = nextStableId(rows, m._v.snapshots);
          seen.add(r.stableId);
        }
        m._v.rows = rows;
        const known = new Set(rows.map((r) => r.stableId));
        for (const x of m._v.experiments) x.hypothesisIds = x.hypothesisIds.filter((sid) => known.has(sid));
      },
    },
    validParents: {
      fields: ['rows'],
      test(m) {
        const ids = new Set(m.rows.map((r) => r.id));
        return m.rows.every((r) => r.parentId === null || ids.has(r.parentId))
          && cycleMembers(m.rows).size === 0;
      },
      repair(m) {
        const ids = new Set(m._v.rows.map((r) => r.id));
        for (const r of m._v.rows) if (r.parentId !== null && !ids.has(r.parentId)) r.parentId = null;
        const cyc = cycleMembers(m._v.rows);
        for (const r of m._v.rows) if (cyc.has(r.id)) r.parentId = null;
      },
    },
    subRowsWithoutCategory: {
      fields: ['rows'],
      test(m) {
        return m.rows.every((r) => r.parentId === null || r.category === '');
      },
      repair(m) {
        for (const r of m._v.rows) if (r.parentId !== null) r.category = '';
      },
    },
    uniqueItemIds: {
      fields: ['experts', 'snapshots', 'experiments', 'facts', 'images'],
      test(m) {
        return distinct(m.experts.map((e) => e.id))
          && distinct(m.snapshots.map((s) => s.id))
          && distinct(m.experiments.map((x) => x.id))
          && distinct(m.facts.map((f) => f.id))
          && distinct([...m.images.inScope, ...m.images.outScope].map((i) => i.id));
      },
      repair(m) {
        m._v.experts = dedupe(m._v.experts);
        m._v.snapshots = dedupe(m._v.snapshots);
        m._v.experiments = dedupe(m._v.experiments);
        m._v.facts = dedupe(m._v.facts);
        const seen = new Set();
        m._v.images = { inScope: dedupe(m._v.images.inScope, seen), outScope: dedupe(m._v.images.outScope, seen) };
      },
    },
  },
}) {}
