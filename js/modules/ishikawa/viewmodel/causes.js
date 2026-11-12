/**
 * D.Mike — Ishikawa: view-Teil Ursachen.
 *
 * Expertenteam, Ursachenbaum mit Bewertungen, Filter, Kategorienamen,
 * Zusammenfassung und Pareto. Die Tabelle zeigt die Zeilen in
 * Baumreihenfolge (`visibleRows`): ohne eingeklappte Teilbäume, gefiltert
 * nach der wirksamen Kategorie. Schreiben läuft über die Kommandos des
 * Models; was eine Eingabe erst prüfen oder umrechnen muss (Bewertung,
 * Expertenname), über die Handler hier. Nach `addSubRow` (Oberfläche oder
 * Agent) klappt der Elternknoten auf.
 */
import { ordered, subtreeIds, depthOf, effCat } from '../domain/tree.js';
import { scoreOf, paretoItems } from '../domain/scores.js';
import { CAT_KEYS } from '../domain/constants.js';

/** Tiefste Stufe der Tiefenklassen im CSS (`ishikawa__depth-<n>`). */
const MAX_DEPTH_CLASS = 3;

/**
 * Eine Zeile der Tabelle.
 * @typedef {object} VisibleRow
 * @property {import('../domain/model.types.js').StateFields['rows'][number]} row die Zeile des Models
 * @property {number} depth Tiefe im Baum (Hauptursache 0)
 * @property {string} num Nummer im Baum (`1`, `1.2`)
 * @property {boolean} hasKids hat Unterursachen
 * @property {boolean} collapsed ist eingeklappt
 * @property {string} effCat wirksame Kategorie, `''` ohne
 * @property {number|null} score Mittel der Bewertungen
 */

/**
 * Nummern im Baum: Hauptursachen 1, 2, …; Kinder `<Eltern>.<n>`.
 * @param {ReadonlyArray<{ id: number, parentId: number|null }>} ord Zeilen in Baumreihenfolge
 * @returns {Map<number, string>}
 */
function numbering(ord) {
  const ids = new Set(ord.map((r) => r.id));
  const nums = new Map();
  const count = new Map();
  for (const r of ord) {
    const parent = r.parentId !== null && ids.has(r.parentId) ? r.parentId : null;
    const n = (count.get(parent) ?? 0) + 1;
    count.set(parent, n);
    nums.set(r.id, parent === null ? String(n) : `${nums.get(parent)}.${n}`);
  }
  return nums;
}

/**
 * Initialen eines Namens: erste Buchstaben der ersten zwei Wörter, sonst die
 * ersten zwei Zeichen.
 * @param {string} name @returns {string}
 */
function initials(name) {
  const text = (name || '').trim();
  const parts = text.split(/\s+/);
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : text.substring(0, 2).toUpperCase();
}

/**
 * Stufe eines Scores: ab 6 hoch, ab 3 mittel, sonst niedrig.
 * @param {number} score @returns {'low'|'mid'|'high'}
 */
function scoreLevel(score) {
  if (score >= 6) return 'high';
  return score >= 3 ? 'mid' : 'low';
}

/** @type {import('./state.types.js').IshikawaViewFn} */
export const causesView = (ctx) => {
  /** @type {((e: { instanceId?: string, command?: string, args?: any }) => void)|null} */
  let onCommand = null;
  return {
    init() {
      // Nach einer neuen Unterursache klappt der Elternknoten auf — gleich, wer sie anlegt.
      onCommand = (e) => this.afterCommand(e);
      ctx.eventBus?.on?.('command:executed', onCommand);
    },
    destroy() {
      if (onCommand) ctx.eventBus?.off?.('command:executed', onCommand);
      onCommand = null;
    },

    /**
     * Handler nach jedem Kommando dieser Instanz: `addSubRow` klappt den
     * Elternknoten auf, `removeRow` räumt eingeklappte ids weg.
     * @param {{ instanceId?: string, command?: string, args?: any }} e
     */
    afterCommand(e) {
      if (e?.instanceId !== ctx.instanceId) return;
      if (e.command === 'addSubRow') this.afterAddSubRow(e.args?.parentId);
      else if (e.command === 'removeRow') {
        const ids = new Set(this.model.rows.map((r) => r.id));
        this.state.collapsed = this.state.collapsed.filter((id) => ids.has(id));
      }
    },

    /** Den Elternknoten einer neuen Unterursache aufklappen. @param {number} parentId */
    afterAddSubRow(parentId) {
      if (this.state.collapsed.includes(parentId)) this.state.collapsed = this.state.collapsed.filter((id) => id !== parentId);
    },

    /** Die sechs Kategorien in Anzeigereihenfolge. */
    get cats() { return CAT_KEYS; },

    /** Anzeigename einer Kategorie: eigener Name, sonst die Übersetzung. @param {string} key @returns {string} */
    catLabel(key) {
      const own = this.model.catLabels[key];
      return own && own.trim() ? own.trim() : this.t(`cat.${key}`);
    },

    /** Farbe einer Kategorie; ohne Kategorie die Randfarbe. @param {string} key @returns {string} */
    catColor(key) {
      return CAT_KEYS.includes(key) ? `var(--ishikawa-cat-${key})` : 'var(--color-border-secondary)';
    },

    /** Farbstreifen links (Filter, Kategoriezelle). @param {string} key @returns {string} */
    catStripe(key) { return `border-left:3px solid ${this.catColor(key)}`; },

    /** Ursachen mit dieser wirksamen Kategorie. @param {string} key @returns {number} */
    catCount(key) {
      const rows = this.model.rows;
      return rows.filter((r) => effCat(rows, r) === key).length;
    },

    /** Anteil der Kategorie an allen Ursachen in Prozent. @param {string} key @returns {number} */
    catBarPct(key) {
      const total = this.model.rows.length;
      return total > 0 ? this.catCount(key) / total * 100 : 0;
    },

    /** Stil eines Abschnitts im Kategorienbalken. @param {string} key @returns {string} */
    catBarStyle(key) { return `width:${this.catBarPct(key)}%;background:${this.catColor(key)}`; },

    /** Initialen eines Experten. @param {string} name @returns {string} */
    ini(name) { return initials(name); },

    // ── Experten ───────────────────────────────────────────────

    /**
     * Enter übernimmt, Escape stellt den Namen wieder her.
     * @param {number} id @param {KeyboardEvent} $event
     */
    expertEditKey(id, $event) {
      const input = /** @type {HTMLInputElement} */ ($event.target);
      if ($event.key === 'Enter') { $event.preventDefault(); input.blur(); } else if ($event.key === 'Escape') {
        const exp = this.model.experts.find((x) => x.id === id);
        if (exp) input.value = exp.name;
        input.blur();
      }
    },

    /**
     * Namensfeld eines Experten verlassen: leer oder unverändert stellt den
     * Namen wieder her; ein vergebener Name meldet sich und bleibt im Feld.
     * @param {number} id @param {Event} $event
     */
    commitExpertRename(id, $event) {
      const input = /** @type {HTMLInputElement} */ ($event.target);
      const exp = this.model.experts.find((e) => e.id === id);
      if (!exp) return;
      const name = (input.value || '').trim();
      if (!name || name === exp.name) { input.value = exp.name; return; }
      try {
        this.model.renameExpert({ expertId: /** @type {any} */ (id), name });
      } catch (err) {
        if (err?.param !== 'name') throw err;
        ctx.notify(this.t('expertDuplicate'));
        input.value = exp.name;
        input.focus();
        input.select();
      }
    },

    // ── Baum ──────────────────────────────────────────────────

    /** @returns {VisibleRow[]} Zeilen der Tabelle in Baumreihenfolge, gefiltert, ohne eingeklappte Teilbäume */
    get visibleRows() {
      const rows = this.model.rows;
      const ord = ordered(rows);
      const nums = numbering(ord);
      const collapsed = new Set(this.state.collapsed);
      const hidden = new Set();
      for (const id of collapsed) for (const d of subtreeIds(rows, id)) hidden.add(d);
      const kids = new Set(rows.map((r) => r.parentId));
      const filter = this.state.filter;
      const out = [];
      for (const row of ord) {
        if (hidden.has(row.id)) continue;
        const cat = effCat(rows, row);
        if (filter && cat !== filter) continue;
        out.push({
          row,
          depth: depthOf(rows, row.id),
          num: nums.get(row.id) ?? '',
          hasKids: kids.has(row.id),
          collapsed: collapsed.has(row.id),
          effCat: cat,
          score: scoreOf(row),
        });
      }
      return out;
    },

    /** Eine Zeile ein- oder aufklappen. @param {number} id */
    toggleCollapse(id) {
      const c = this.state.collapsed;
      this.state.collapsed = c.includes(id) ? c.filter((x) => x !== id) : [...c, id];
    },

    /** Alle aufklappen. */
    expandAll() { this.state.collapsed = []; },

    /** Alle Zeilen mit Unterursachen einklappen. */
    collapseAll() {
      const parents = new Set(this.model.rows.map((r) => r.parentId));
      this.state.collapsed = this.model.rows.filter((r) => parents.has(r.id)).map((r) => r.id);
    },

    /** Titel des Klappknopfs. @param {VisibleRow} vr @returns {string} */
    toggleTitle(vr) { return this.t(vr.collapsed ? 'toggleRowExpand' : 'toggleRowCollapse'); },

    /** Icon des Klappknopfs. @param {VisibleRow} vr @returns {string} */
    toggleIcon(vr) { return vr.collapsed ? 'nav.expand-right' : 'nav.expand-down'; },

    /**
     * Klassen einer Zeile: Tiefe und Vorschau der Geste (gezogener Teilbaum,
     * Einfügemarke an der Zielzeile).
     * @param {VisibleRow} vr @returns {string}
     */
    rowClass(vr) {
      const out = [`ishikawa__depth-${Math.min(vr.depth, MAX_DEPTH_CLASS)}`];
      const p = this.state.dragPreview;
      if (p && p.kind === 'tree') {
        if (p.ids.includes(vr.row.id)) out.push('dmike-table__row--dragging');
        else {
          const rest = this.visibleRows.map((v) => v.row.id).filter((id) => id !== p.ids[0]);
          if (rest[p.index] === vr.row.id) out.push('dmike-table__row--drop-target');
        }
      }
      return out.join(' ');
    },

    /** Leere Tabelle: Spalten über die ganze Breite. @returns {number} */
    get emptyColspan() { return 8 + this.model.experts.length; },

    /** Text der leeren Tabelle. @returns {string} */
    get emptyMessage() { return this.t(this.model.rows.length ? 'noCategoryHyp' : 'emptyHint'); },

    /** Erste Option der Kategorieauswahl: geerbt oder „wählen“. @param {VisibleRow} vr @returns {string} */
    categoryPlaceholder(vr) {
      return !vr.row.category && vr.effCat ? `↳ ${this.catLabel(vr.effCat)}` : this.t('catChoose');
    },

    /** Platzhalter der Beschreibung. @param {VisibleRow} vr @returns {string} */
    descPlaceholder(vr) { return this.t(vr.depth ? 'subCausePlaceholder' : 'causePlaceholder'); },

    /** Trägt eine andere Ursache denselben Namen (ohne Groß/Klein)? @param {{ id: number, name: string }} row @returns {boolean} */
    isNameDup(row) {
      const key = (row.name || '').trim().toLowerCase();
      return key !== '' && this.model.rows.some((r) => r.id !== row.id && (r.name || '').trim().toLowerCase() === key);
    },

    /** Klasse der Statusauswahl. @param {string} status @returns {string} */
    statusClass(status) { return status === 'testing' ? 'ishikawa__status-test' : `ishikawa__status-${status}`; },

    /** Hauptursache anhängen und ihren Namen fokussieren. */
    addRowAndFocus() {
      const { id } = this.model.addRow({});
      this.focusRow(id);
    },

    /** Unterursache anlegen und ihren Namen fokussieren. @param {number} parentId */
    addSubAndFocus(parentId) {
      const { id } = this.model.addSubRow({ parentId: /** @type {any} */ (parentId) });
      this.focusRow(id);
    },

    /** Namensfeld einer Zeile nach dem Zeichnen fokussieren. @param {number} id */
    focusRow(id) {
      this.$nextTick(() => {
        /** @type {HTMLInputElement|null} */
        const input = this.$root.querySelector(`tr[data-id="${id}"] .ishikawa__name-input`);
        input?.focus();
      });
    },

    // ── Bewertungen ───────────────────────────────────────────

    /** Wert im Bewertungsfeld; ohne Bewertung leer. @param {{ ratings: Record<string, number> }} row @param {number} expertId @returns {number|string} */
    ratingVal(row, expertId) { return row.ratings[expertId] ?? ''; },

    /** Farbklasse einer Bewertung; ohne Bewertung leer. @param {number|undefined|null} v @returns {string} */
    ratingClass(v) { return typeof v === 'number' ? `ishikawa__rating--${v}` : ''; },

    /** Nur Ziffern im Bewertungsfeld. @param {KeyboardEvent} $event */
    ratingKeydown($event) {
      if (['e', 'E', '+', '-', '.', ','].includes($event.key)) $event.preventDefault();
    },

    /**
     * Getippte Bewertung übernehmen: auf 0–9 begrenzt, leer oder keine Zahl
     * löscht sie; das Feld zeigt danach den gespeicherten Wert.
     * @param {number} rowId @param {number} expertId @param {Event} $event
     */
    ratingChanged(rowId, expertId, $event) {
      const input = /** @type {HTMLInputElement} */ ($event.target);
      const n = parseInt(input.value, 10);
      const value = Number.isNaN(n) ? null : Math.max(0, Math.min(9, n));
      this.model.setRating({ rowId: /** @type {any} */ (rowId), expertId: /** @type {any} */ (expertId), value });
      input.value = String(value ?? '');
    },

    /** Klasse des Score-Abzeichens. @param {number} score @returns {string} */
    scoreClass(score) { return `ishikawa__score-${scoreLevel(score)}`; },

    /** Balken unter dem Score: Stufe und Breite in Prozent. @param {number} score @returns {{ level: string, pct: number }} */
    scoreBar(score) { return { level: scoreLevel(score), pct: score / 9 * 100 }; },

    /** Klasse des Score-Balkens. @param {number} score @returns {string} */
    scoreBarClass(score) { return `ishikawa__score-bar--${scoreLevel(score)}`; },

    /** Breite des Score-Balkens. @param {number} score @returns {string} */
    scoreBarStyle(score) { return `width:${this.scoreBar(score).pct}%`; },

    // ── Verknüpfte Experimente ─────────────────────────────────

    /** Experimente, die diese Ursache prüfen. @param {{ stableId: string }} row @returns {number} */
    linkedExpCount(row) {
      return this.model.experiments.filter((x) => x.hypothesisIds.includes(row.stableId)).length;
    },

    /** Titel des Verknüpfungsknopfs. @param {{ stableId: string }} row @returns {string} */
    linkExpTitle(row) {
      const count = this.linkedExpCount(row);
      return count > 0 ? this.t('linkedExperimentsTooltip', { count }) : this.t('linkExperimentsTitle');
    },

    /** Klassen des Verknüpfungsknopfs. @param {{ stableId: string }} row @returns {string} */
    linkExpClass(row) {
      return this.linkedExpCount(row) > 0 ? 'ishikawa__icon-btn--exp ishikawa__icon-btn--linked' : 'ishikawa__icon-btn--exp';
    },

    // ── Zusammenfassung ───────────────────────────────────────

    /** „(2 Haupt · 3 Sub)“. @returns {string} */
    get summaryBreakdown() {
      const total = this.model.rows.length;
      const roots = this.model.rows.filter((r) => r.parentId === null).length;
      return `(${roots} ${this.t('main')} · ${total - roots} ${this.t('sub')})`;
    },

    /** Höchster Score, sonst „–“. @returns {string} */
    get topScore() {
      const scores = this.model.rows.map((r) => scoreOf(r)).filter((s) => s !== null);
      return scores.length ? this.num(Math.max(...scores), 1) : '–';
    },

    /** Bestätigte Ursachen. @returns {number} */
    get confirmedCount() { return this.model.rows.filter((r) => r.status === 'confirmed').length; },

    // ── Pareto ────────────────────────────────────────────────

    /** Der Snapshot, den das Pareto zeigt; gelöscht oder keiner: `null` (aktueller Stand). */
    get paretoSnapshot() {
      const id = this.state.paretoSnapId;
      return id === null ? null : (this.model.snapshots.find((s) => s.id === id) ?? null);
    },

    /** Wert der Quellenauswahl: `current` oder `snap-<id>`. @returns {string} */
    get paretoSourceValue() {
      const snap = this.paretoSnapshot;
      return snap ? `snap-${snap.id}` : 'current';
    },

    /**
     * Auswahl der Quelle: `current` oder `snap-<id>`.
     * @param {Event} $event
     */
    paretoSourceChanged($event) {
      const v = /** @type {HTMLSelectElement} */ ($event.target).value;
      const id = v.startsWith('snap-') ? Number(v.slice(5)) : null;
      this.setParetoSource({ snapshotId: /** @type {any} */ (id) });
    },

    /** Kein Eintrag im Pareto. @returns {boolean} */
    get paretoEmpty() { return this.paretoChart === null; },

    computed: {
      /**
       * Pareto der bewerteten Ursachen (aktuell oder aus dem Snapshot):
       * Balken in der Farbe der wirksamen Kategorie, Sammelposten, Summenlinie.
       * @returns {object|null} ohne Bewertung `null`
       */
      paretoChart() {
        const snap = this.paretoSnapshot;
        const items = paretoItems(snap ? snap.data.rows : this.model.rows);
        if (!items.length) return null;
        return {
          items: items.map((d) => (d.category
            ? { name: d.name, value: d.score, color: `var(--ishikawa-cat-${d.category})` }
            : { name: d.name, value: d.score })),
          otherBucket: true,
          title: this.t('paretoTitle'),
          yLabel: this.t('paretoYAxisLabel'),
          rightYLabel: this.t('paretoCumLabel'),
          showXTicks: false,
        };
      },
    },
  };
};
