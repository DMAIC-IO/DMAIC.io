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
 *
 * `move…Before` setzt vor das Ziel; Ziel `null` heißt „ans Ende“, bei Zeilen
 * „hinter die letzte Geschwisterzeile“ (der Elternknoten bleibt). Fachliche
 * Ablehnungen werfen mit `param`. `confirm` liefert die Rückfrage als
 * Schlüssel unter `modules.ishikawa`.
 */
import {
  defineModel, command, cloneJSON, list, object, record, map, text, number, oneOf, idOf, date, image,
} from '../../../core/model.js';
import { requireForm } from '../../../core/validate.js';
import { todayISO } from '../../../core/local-date.js';
import paretoChart from '../../../widgets/pareto-chart/schema.js';
import { from0 } from './migrations.js';
import { EXP_COLS } from './constants.js';
import { nextId, nextStableId, subtreeIds, siblingsOf } from './tree.js';
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
 * Lehnt einen Expertennamen ab, den ein anderer Experte schon trägt (ohne Groß/Klein).
 * @param {ReadonlyArray<{ id: number, name: string }>} experts @param {string} name
 * @param {number|null} [exceptId] der umbenannte Experte
 * @throws {Error} mit `param` `name`
 */
function requireFreeName(experts, name, exceptId = null) {
  const key = nameKey(name);
  requireForm('name', name, !experts.some((e) => e.id !== exceptId && nameKey(e.name) === key),
    'a name no other expert has, case-insensitive');
}

/**
 * Anzeigename in einer Rückfrage: der getrimmte Text, sonst `#<Position>`.
 * @param {ReadonlyArray<object>} items @param {object} item @param {string} label
 * @returns {string}
 */
function confirmName(items, item, label) {
  return label.trim() || `#${items.indexOf(item) + 1}`;
}

/**
 * Ein Element einer flachen Liste vor ein anderes setzen; `targetId` `null`
 * hängt es ans Ende, auf sich selbst bleibt alles.
 * @template {{ id: number }} T
 * @param {T[]} items @param {number} id @param {number|null} targetId
 * @returns {T[]} neue Liste
 */
function moveBefore(items, id, targetId) {
  if (id === targetId) return items;
  const moved = items.find((x) => x.id === id);
  const rest = items.filter((x) => x.id !== id);
  const at = targetId === null ? rest.length : rest.findIndex((x) => x.id === targetId);
  rest.splice(at, 0, moved);
  return rest;
}

/**
 * Index hinter dem letzten Listeneintrag aus `ids`; ohne Treffer `fallback`.
 * @param {ReadonlyArray<{ id: number }>} rows @param {Set<number>} ids @param {number} fallback
 * @returns {number}
 */
function afterLast(rows, ids, fallback) {
  let at = -1;
  rows.forEach((r, i) => { if (ids.has(r.id)) at = i; });
  return at < 0 ? fallback : at + 1;
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
  commands: {
    addExpert: command({
      params: { name: text({ trim: true, nonEmpty: true }) },
      returns: number({ integer: true }),
      run({ name }) {
        requireFreeName(this.experts, name);
        const id = nextId(this.experts);
        this.experts.push({ id, name, color: EXP_COLS[this.experts.length % EXP_COLS.length] });
        return id;
      },
    }),
    renameExpert: command({
      params: { expertId: idOf('experts'), name: text({ trim: true, nonEmpty: true }) },
      run({ expertId, name }) {
        requireFreeName(this.experts, name, expertId);
        this.experts.find((e) => e.id === expertId).name = name;
      },
    }),
    removeExpert: command({
      params: { expertId: idOf('experts') },
      run({ expertId }) {
        for (const r of this.rows) delete r.ratings[String(expertId)];
        this.experts = this.experts.filter((e) => e.id !== expertId);
      },
    }),
    addRow: command({
      returns: object({ id: number({ integer: true }), stableId: text() }),
      run() {
        const created = { id: nextId(this.rows), stableId: nextStableId(this.rows, this.snapshots) };
        this.rows.push({ ...created, parentId: null, category: '', name: '', description: '', ratings: {}, status: 'open' });
        return created;
      },
    }),
    addSubRow: command({
      params: { parentId: idOf('rows') },
      returns: object({ id: number({ integer: true }), stableId: text() }),
      run({ parentId }) {
        const created = { id: nextId(this.rows), stableId: nextStableId(this.rows, this.snapshots) };
        const at = afterLast(this.rows, new Set([parentId, ...subtreeIds(this.rows, parentId)]), this.rows.length);
        this.rows.splice(at, 0, { ...created, parentId, category: '', name: '', description: '', ratings: {}, status: 'open' });
        return created;
      },
    }),
    setRowField: command({
      params: {
        rowId: idOf('rows'),
        name: text({ optional: true }),
        category: oneOf(['', 'man', 'machine', 'environment', 'material', 'measurement', 'method'], { optional: true }),
        description: text({ optional: true }),
        status: oneOf(['open', 'testing', 'confirmed', 'rejected'], { optional: true }),
      },
      run({ rowId, ...changes }) {
        const row = this.rows.find((r) => r.id === rowId);
        if (changes.category !== undefined) {
          requireForm('category', changes.category, row.parentId === null || changes.category === '',
            '"" for a sub-cause; it inherits the category of its main cause');
        }
        Object.assign(row, changes);
      },
    }),
    removeRow: command({
      params: { rowId: idOf('rows') },
      confirm({ rowId }) {
        const row = this.rows.find((r) => r.id === rowId);
        const name = row.name.trim() || row.stableId;
        const count = subtreeIds(this.rows, rowId).length;
        return count > 0
          ? { key: 'delRowConfirmWithSubs', params: { name, count } }
          : { key: 'delRowConfirm', params: { name } };
      },
      run({ rowId }) {
        const gone = new Set([rowId, ...subtreeIds(this.rows, rowId)]);
        const goneStable = new Set(this.rows.filter((r) => gone.has(r.id)).map((r) => r.stableId));
        this.rows = this.rows.filter((r) => !gone.has(r.id));
        for (const x of this.experiments) x.hypothesisIds = x.hypothesisIds.filter((sid) => !goneStable.has(sid));
      },
    }),
    moveRowBefore: command({
      params: { rowId: idOf('rows'), targetRowId: idOf('rows', { nullable: true }) },
      run({ rowId, targetRowId }) {
        if (rowId === targetRowId) return;
        const sub = subtreeIds(this.rows, rowId);
        requireForm('targetRowId', targetRowId, !sub.includes(targetRowId), 'a cause outside the moved subtree, or null');
        const group = new Set([rowId, ...sub]);
        const moved = this.rows.filter((r) => group.has(r.id));
        const rest = this.rows.filter((r) => !group.has(r.id));
        const row = moved.find((r) => r.id === rowId);
        let at;
        if (targetRowId === null) {
          const others = siblingsOf(this.rows, rowId).filter((id) => id !== rowId);
          if (others.length === 0) return;
          const after = new Set(others.flatMap((id) => [id, ...subtreeIds(this.rows, id)]));
          at = afterLast(rest, after, rest.length);
        } else {
          const target = rest.find((r) => r.id === targetRowId);
          at = rest.indexOf(target);
          row.parentId = target.parentId;
          if (row.parentId !== null) row.category = '';
        }
        rest.splice(at, 0, ...moved);
        this.rows = rest;
      },
    }),
    setRating: command({
      params: {
        rowId: idOf('rows'),
        expertId: idOf('experts'),
        value: number({ integer: true, min: 0, max: 9, nullable: true }),
      },
      run({ rowId, expertId, value }) {
        const ratings = this.rows.find((r) => r.id === rowId).ratings;
        if (value === null) delete ratings[String(expertId)];
        else ratings[String(expertId)] = value;
      },
    }),
    loadSnapshot: command({
      params: { snapshotId: idOf('snapshots') },
      confirm() { return { key: 'loadSnapConfirm' }; },
      run({ snapshotId }) {
        const data = cloneJSON(this.snapshots.find((s) => s.id === snapshotId).data);
        const experts = new Set(data.experts.map((e) => String(e.id)));
        for (const r of data.rows) {
          for (const k of Object.keys(r.ratings)) if (!experts.has(k)) delete r.ratings[k];
        }
        const known = new Set(data.rows.map((r) => r.stableId));
        for (const x of this.experiments) x.hypothesisIds = x.hypothesisIds.filter((sid) => known.has(sid));
        this.problem = data.problem;
        this.experts = data.experts;
        this.rows = data.rows;
      },
    }),
    removeSnapshot: command({
      params: { snapshotId: idOf('snapshots') },
      run({ snapshotId }) {
        this.snapshots = this.snapshots.filter((s) => s.id !== snapshotId);
      },
    }),
    addExperiment: command({
      returns: number({ integer: true }),
      run() {
        const id = nextId(this.experiments);
        this.experiments.push({
          id, title: '', description: '', responsible: '', status: 'planned',
          startDate: '', endDate: '', costMoney: null, costHours: null, hypothesisIds: [],
        });
        return id;
      },
    }),
    setExperimentField: command({
      params: {
        experimentId: idOf('experiments'),
        title: text({ optional: true }),
        description: text({ optional: true }),
        responsible: text({ optional: true }),
        status: oneOf(['planned', 'running', 'done', 'cancelled'], { optional: true }),
        startDate: date({ empty: true, optional: true }),
        endDate: date({ empty: true, optional: true }),
        costMoney: number({ nullable: true, min: 0, optional: true }),
        costHours: number({ nullable: true, min: 0, optional: true }),
      },
      run({ experimentId, ...changes }) {
        Object.assign(this.experiments.find((x) => x.id === experimentId), changes);
      },
    }),
    removeExperiment: command({
      params: { experimentId: idOf('experiments') },
      confirm({ experimentId }) {
        const x = this.experiments.find((e) => e.id === experimentId);
        return { key: 'delExperimentConfirm', params: { name: confirmName(this.experiments, x, x.title) } };
      },
      run({ experimentId }) {
        this.experiments = this.experiments.filter((x) => x.id !== experimentId);
      },
    }),
    moveExperimentBefore: command({
      params: { experimentId: idOf('experiments'), targetExperimentId: idOf('experiments', { nullable: true }) },
      run({ experimentId, targetExperimentId }) {
        this.experiments = moveBefore(this.experiments, experimentId, targetExperimentId);
      },
    }),
    setExperimentHypotheses: command({
      params: { experimentId: idOf('experiments'), hypothesisIds: list(idOf('rows', { key: 'stableId' })) },
      run({ experimentId, hypothesisIds }) {
        this.experiments.find((x) => x.id === experimentId).hypothesisIds = [...new Set(hypothesisIds)];
      },
    }),
    setCauseExperiments: command({
      params: { stableId: idOf('rows', { key: 'stableId' }), experimentIds: list(idOf('experiments')) },
      run({ stableId, experimentIds }) {
        const linked = new Set(experimentIds);
        for (const x of this.experiments) {
          const has = x.hypothesisIds.includes(stableId);
          if (linked.has(x.id) && !has) x.hypothesisIds.push(stableId);
          else if (!linked.has(x.id) && has) x.hypothesisIds = x.hypothesisIds.filter((sid) => sid !== stableId);
        }
      },
    }),
    addFact: command({
      returns: number({ integer: true }),
      run() {
        const id = nextId(this.facts);
        this.facts.push({ id, name: '', description: '', date: todayISO(), owner: '' });
        return id;
      },
    }),
    setFactField: command({
      params: {
        factId: idOf('facts'),
        name: text({ optional: true }),
        description: text({ optional: true }),
        date: date({ empty: true, optional: true }),
        owner: text({ optional: true }),
      },
      run({ factId, ...changes }) {
        Object.assign(this.facts.find((f) => f.id === factId), changes);
      },
    }),
    removeFact: command({
      params: { factId: idOf('facts') },
      confirm({ factId }) {
        const f = this.facts.find((x) => x.id === factId);
        return { key: 'delFactConfirm', params: { name: confirmName(this.facts, f, f.name) } };
      },
      run({ factId }) {
        this.facts = this.facts.filter((f) => f.id !== factId);
      },
    }),
    moveFactBefore: command({
      params: { factId: idOf('facts'), targetFactId: idOf('facts', { nullable: true }) },
      run({ factId, targetFactId }) {
        this.facts = moveBefore(this.facts, factId, targetFactId);
      },
    }),
    addImage: command({
      params: { scope: oneOf(['inScope', 'outScope']), dataUrl: image(), caption: text() },
      returns: number({ integer: true }),
      run({ scope, dataUrl, caption }) {
        const id = nextId([...this.images.inScope, ...this.images.outScope]);
        this.images[scope].push({ id, dataUrl, caption });
        return id;
      },
    }),
    removeImage: command({
      params: { scope: oneOf(['inScope', 'outScope']), id: idOf('images[scope]') },
      confirm({ scope, id }) {
        const list = this.images[scope];
        const img = list.find((i) => i.id === id);
        return { key: 'delImageConfirm', params: { name: confirmName(list, img, img.caption) } };
      },
      run({ scope, id }) {
        this.images[scope] = this.images[scope].filter((i) => i.id !== id);
      },
    }),
    setImageCaption: command({
      params: { scope: oneOf(['inScope', 'outScope']), id: idOf('images[scope]'), caption: text() },
      run({ scope, id, caption }) {
        this.images[scope].find((i) => i.id === id).caption = caption;
      },
    }),
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
      fields: ['rows', 'experiments'],
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
