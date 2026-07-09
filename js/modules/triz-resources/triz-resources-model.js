export const CATEGORIES = ['substance', 'field', 'space', 'time', 'info', 'function']
export const LEVELS = ['sub', 'sys', 'super']
const CYCLE = ['unknown', 'unused', 'partial', 'full']

export class Cell {
  notes = ''
  status = 'unknown'

  cycleStatus() {
    const idx = CYCLE.indexOf(this.status)
    this.status = CYCLE[(idx + 1) % CYCLE.length]
  }

  toJSON() {
    return { notes: this.notes, status: this.status }
  }

  static fromJSON(d) {
    const c = new Cell()
    if (d) {
      c.notes = typeof d.notes === 'string' ? d.notes : ''
      c.status = CYCLE.includes(d.status) ? d.status : 'unknown'
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
  system = ''
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
