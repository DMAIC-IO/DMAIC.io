export class Label {
  val = ''

  toJSON() {
    return this.val
  }

  static fromJSON(d) {
    const l = new Label()
    l.val = typeof d === 'string' ? d : ''
    return l
  }
}

export class Cell {
  text = ''
  image = null

  toJSON() {
    return { text: this.text, image: this.image }
  }

  static fromJSON(d) {
    const c = new Cell()
    if (d) {
      c.text = typeof d.text === 'string' ? d.text : ''
      c.image = typeof d.image === 'string' ? d.image : null
    }
    return c
  }
}

const ROWS = 3
const COLS = 3

function emptyLabels() {
  const labels = {}
  for (let i = 0; i < COLS; i++) labels[i] = new Label()
  return labels
}

function emptyRows() {
  const rows = {}
  for (let r = 0; r < ROWS; r++) {
    const cells = {}
    for (let c = 0; c < COLS; c++) cells[c] = new Cell()
    rows[r] = { rowLabel: new Label(), cells }
  }
  return rows
}

export class State {
  static VERSION = '1.0'
  static ID = 'triz-9-windows'

  _schema = { name: State.ID, version: State.VERSION }
  systemTitle = ''
  colLabels = emptyLabels()
  rows = emptyRows()

  hasContent() {
    if (this.systemTitle) return true
    for (const r in this.rows) {
      for (const c in this.rows[r].cells) {
        if (this.rows[r].cells[c].text) return true
      }
    }
    return false
  }

  clearCellImage(r, c) {
    this.rows[r].cells[c].image = null
  }

  toJSON() {
    const colLabels = Object.values(this.colLabels).map(l => l.toJSON())
    const rowLabels = Object.values(this.rows).map(r => r.rowLabel.toJSON())
    const cells = Object.values(this.rows).map(r =>
      Object.values(r.cells).map(c => c.toJSON())
    )
    return {
      _schema: { ...this._schema },
      systemTitle: this.systemTitle,
      colLabels,
      rowLabels,
      cells,
    }
  }

  static imagePaths(json) {
    const out = [];
    (json.cells || []).forEach((row, r) => {
      (row || []).forEach((cell, c) => {
        if (cell && cell.image) out.push(['cells', r, c, 'image']);
      });
    });
    return out;
  }

  static fromJSON(d) {
    const s = new State()
    if (!d) return s

    s.systemTitle = typeof d.systemTitle === 'string' ? d.systemTitle : ''

    const numCols = Object.keys(s.colLabels).length
    if (Array.isArray(d.colLabels) && d.colLabels.length === numCols) {
      d.colLabels.forEach((v, i) => {
        s.colLabels[i] = Label.fromJSON(v)
      })
    }

    const numRows = Object.keys(s.rows).length
    if (Array.isArray(d.rowLabels) && d.rowLabels.length === numRows) {
      d.rowLabels.forEach((v, i) => {
        s.rows[i].rowLabel = Label.fromJSON(v)
      })
    }

    if (Array.isArray(d.cells) && d.cells.length === numRows) {
      d.cells.forEach((rowData, r) => {
        if (!(r in s.rows)) return
        if (Array.isArray(rowData)) {
          rowData.forEach((cellData, c) => {
            if (c in s.rows[r].cells) s.rows[r].cells[c] = Cell.fromJSON(cellData)
          })
        }
      })
    }

    return s
  }
}
