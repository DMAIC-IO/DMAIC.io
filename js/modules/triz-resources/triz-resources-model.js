/** @type {readonly string[]} die sechs Ressourcenkategorien, in Zeilenreihenfolge */
export const CATEGORIES = ['substance', 'field', 'space', 'time', 'info', 'function']

/** @type {readonly string[]} die drei Systemebenen, in Spaltenreihenfolge */
export const LEVELS = ['sub', 'sys', 'super']

/**
 * Die erklärte Wertemenge von `Cell.status`, in der Reihenfolge, die
 * `cycleStatus()` durchläuft. Exportiert, weil das Viewmodel sie für
 * `requireEnum` braucht — ein Agent kann einen Wert daneben erzeugen, die
 * vier Knopfzustände der Oberfläche können es nicht.
 * @type {readonly string[]}
 */
export const CELL_STATUSES = ['unknown', 'unused', 'partial', 'full']

export class Cell {
  /** @type {string} die Notiz zu dieser Ressource */
  notes = ''

  /** @type {string} der Füllstand: unknown, unused, partial oder full */
  status = 'unknown'

  cycleStatus() {
    const idx = CELL_STATUSES.indexOf(this.status)
    this.status = CELL_STATUSES[(idx + 1) % CELL_STATUSES.length]
  }

  toJSON() {
    return { notes: this.notes, status: this.status }
  }

  static fromJSON(d) {
    const c = new Cell()
    if (d) {
      c.notes = typeof d.notes === 'string' ? d.notes : ''
      c.status = CELL_STATUSES.includes(d.status) ? d.status : 'unknown'
    }
    return c
  }
}

function emptyGrid() {
  const g = {}
  for (const cat of CATEGORIES) {
    g[cat] = {}
    for (const lvl of LEVELS) g[cat][lvl] = new Cell()
  }
  return g
}

export class State {
  static VERSION = '1.0';
  static ID = "triz-resources";

  _schema = { name: State.ID, version: State.VERSION }

  /** @type {string} das betrachtete System, dessen Ressourcen aufgenommen werden */
  system = ''

  /**
   * @type {Record<string, Record<string, {notes: string, status: string}>>} die
   *   6x3-Matrix der Ressourcenfelder: sechs Kategorien (substance, field,
   *   space, time, info, function) mal drei Ebenen (sub, sys, super). Jedes
   *   Feld trägt `notes` und `status` (unknown, unused, partial, full).
   */
  cells = emptyGrid()

  hasContent() {
    if (this.system) return true
    for (const cat of CATEGORIES) {
      for (const lvl of LEVELS) {
        const cell = this.cells[cat]?.[lvl]
        if (cell?.notes || (cell?.status && cell.status !== 'unknown')) return true
      }
    }
    return false
  }

  toJSON() {
    const result = {
      _schema: {...this._schema},
      system: this.system,
      cells: (() => {
        const out = {}
        for (const cat of CATEGORIES) {
          out[cat] = {}
          for (const lvl of LEVELS) out[cat][lvl] = this.cells[cat][lvl].toJSON()
        }
        return out
      })()
    };
    return result;
  }

  static fromJSON(d) {
    const s = new State()
    if (!d) return s

    const ver = d._schema?.version || '0.0'
    if (ver !== State.VERSION) {
      // d = handleMigrations(MIGRATIONS)
    }

    s.system = typeof d.system === 'string' ? d.system : ''
    if (d.cells && typeof d.cells === 'object') {
      for (const cat of CATEGORIES) {
        for (const lvl of LEVELS) {
          const src = d.cells[cat]?.[lvl]
          if (src) s.cells[cat][lvl] = Cell.fromJSON(src)
        }
      }
    }
    return s
  }
}
// function handleMigrations(data,migrations){
//   migrations.keys().forEach(version => {
//     if(data._schema.version===version){
//       data = migrations[version](data);
//     }
//   })
//   return data;
// }
// const MIGRATIONS={
//   "0.0":(old)=>{
//     return old
//   }
// }
