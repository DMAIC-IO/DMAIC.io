/**
 * D.Mike — Ishikawa: Viewmodel-Kommandos.
 *
 * Kommandos, die Übersetzungen (`this.t`) oder den UI-State (`this.state`)
 * brauchen; Oberfläche und Agent gehen denselben Weg. Ins Model schreiben sie
 * über `setFields`, nie direkt.
 */
import { command, text, number, idOf, map, oneOf, object, list, cloneJSON, setFields } from '../../../core/model.js';
import { requireEnum, requireForm } from '../../../core/validate.js';
import { CAT_KEYS } from '../domain/constants.js';
import { nextId, nextStableId, subtreeIds } from '../domain/tree.js';
import { compareRows } from '../domain/scores.js';
import { dateText } from './dates.js';

/**
 * Eine Zeile samt Teilbaum kopieren; die Kopie steht hinter dem Teilbaum des
 * Originals und bekommt neue ids und stableIds. Nur die oberste Kopie trägt
 * den Namenszusatz.
 * @param {any[]} rows Zeilen (Kopie, wird verändert)
 * @param {any[]} snapshots für freie stableIds
 * @param {number} rowId Original
 * @param {string} suffix Namenszusatz der obersten Kopie
 * @returns {number} id der obersten Kopie
 */
function duplicateInto(rows, snapshots, rowId, suffix) {
  const copy = (srcId, parentId) => {
    const src = rows.find((r) => r.id === srcId);
    const id = nextId(rows);
    const row = {
      id,
      stableId: nextStableId(rows, snapshots),
      parentId,
      category: src.category,
      name: src.name + (srcId === rowId ? suffix : ''),
      description: src.description,
      ratings: { ...src.ratings },
      status: src.status,
    };
    const sub = subtreeIds(rows, srcId);
    const at = sub.length > 0
      ? Math.max(...sub.map((d) => rows.findIndex((r) => r.id === d))) + 1
      : rows.findIndex((r) => r.id === srcId) + 1;
    rows.splice(at, 0, row);
    for (const child of rows.filter((r) => r.parentId === srcId && r.id !== id)) copy(child.id, id);
    return id;
  };
  return copy(rowId, rows.find((r) => r.id === rowId).parentId);
}

/**
 * Anzeigename einer Kategorie in Kleinschrift: eigene Bezeichnung, sonst die Übersetzung.
 * @param {Record<string, string>} labels @param {string} key @param {(k: string) => string} t
 * @returns {string}
 */
function effectiveLabel(labels, key, t) {
  return (labels[key] || t(`cat.${key}`)).toLowerCase();
}

export const commands = {
  duplicateRow: command({
    params: { rowId: idOf('rows') },
    returns: number({ integer: true }),
    run({ rowId }) {
      const rows = cloneJSON(this.model.rows);
      const id = duplicateInto(rows, this.model.snapshots, rowId, ` (${this.t('copy')})`);
      setFields(this.model, { rows });
      return id;
    },
  }),
  saveSnapshot: command({
    params: { name: text({ trim: true, optional: true }) },
    returns: number({ integer: true }),
    run({ name = '' }) {
      const lang = this._ui.i18n.getLanguage();
      const id = nextId(this.model.snapshots);
      const snap = {
        id,
        name: name || this.t('snapshotDefaultName', { date: dateText(new Date(), lang) }),
        date: new Date().toISOString(),
        data: cloneJSON({ problem: this.model.problem, experts: this.model.experts, rows: this.model.rows }),
      };
      setFields(this.model, { snapshots: [snap, ...cloneJSON(this.model.snapshots)] });
      return id;
    },
  }),
  setCategoryLabels: command({
    params: { labels: map(text(), text()) },
    current() {
      return { labels: { ...this.model.catLabels } };
    },
    run({ labels }) {
      const next = { ...this.model.catLabels };
      for (const [key, name] of Object.entries(labels)) {
        requireEnum('labels', key, CAT_KEYS);
        next[key] = name.trim();
      }
      const shown = CAT_KEYS.map((key) => effectiveLabel(next, key, this.t));
      requireForm('labels', labels, new Set(shown).size === shown.length,
        'names that differ between the categories, case-insensitive; an empty name shows the standard name');
      setFields(this.model, { catLabels: next });
    },
  }),
  setFilter: command({
    params: { category: oneOf(['', 'man', 'machine', 'environment', 'material', 'measurement', 'method']) },
    run({ category }) {
      this.state.filter = category;
    },
  }),
  setParetoSource: command({
    params: { snapshotId: idOf('snapshots', { nullable: true }) },
    run({ snapshotId }) {
      this.state.paretoSnapId = snapshotId;
    },
  }),
  compareSnapshot: command({
    params: { snapshotId: idOf('snapshots') },
    returns: object({
      added: list(text()),
      removed: list(text()),
      changed: list(object({ stableId: text(), oldScore: number(), newScore: number(), delta: number() })),
    }),
    run({ snapshotId }) {
      this.state.compareSnapId = snapshotId;
      const { added, removed, changed } = compareRows(this.model.rows, this.model.snapshots.find((s) => s.id === snapshotId).data.rows);
      return {
        added,
        removed,
        changed: changed.map((d) => ({ stableId: d.stableId, oldScore: d.before, newScore: d.after, delta: d.delta })),
      };
    },
  }),
  closeCompare: command({
    run() {
      this.state.compareSnapId = null;
    },
  }),
};
