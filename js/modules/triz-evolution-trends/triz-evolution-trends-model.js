export const TRENDS = [
  { id: 'aggregation',     stages: 4 },
  { id: 'dynamism',        stages: 5 },
  { id: 'scale',           stages: 4 },
  { id: 'automation',      stages: 4 },
  { id: 'completeness',    stages: 4 },
  { id: 'controllability', stages: 4 },
  { id: 'matching',        stages: 4 },
  { id: 'uneven',          stages: 0 },
];

export class Trend {
  stage = -1
  notes = ''

  constructor(id) {
    this.id = id
  }

  get availableStages() {
    const tc = TRENDS.find(t => t.id === this.id)
    return tc ? Array.from({ length: tc.stages }, (_, i) => i) : []
  }

  get hasStages() {
    return this.availableStages.length > 0
  }

  toJSON() {
    return { stage: this.stage, notes: this.notes }
  }

  static fromJSON(id, d) {
    const t = new Trend(id)
    if (!d) return t
    const tc = TRENDS.find(x => x.id === id)
    const maxStage = tc ? tc.stages - 1 : -1
    const sv = Number(d.stage)
    t.stage = Number.isInteger(sv) && sv >= -1 && sv <= maxStage ? sv : -1
    t.notes = typeof d.notes === 'string' ? d.notes : ''
    return t
  }
}

function initTrends() {
  const out = {}
  for (const t of TRENDS) out[t.id] = new Trend(t.id)
  return out
}

export class State {
  system = ''
  trends = initTrends()

  hasContent() {
    if (this.system) return true
    for (const t of Object.values(this.trends)) {
      if (t.notes) return true
      if (t.hasStages && t.stage >= 0) return true
    }
    return false
  }

  toJSON() {
    const out = {}
    for (const [id, t] of Object.entries(this.trends)) out[id] = t.toJSON()
    return { _schema: { name: 'triz-evolution-trends', version: '1.0' }, system: this.system, trends: out }
  }

  static fromJSON(d) {
    const s = new State()
    if (!d) return s
    s.system = typeof d.system === 'string' ? d.system : ''
    if (d.trends && typeof d.trends === 'object') {
      for (const id of Object.keys(d.trends)) {
        if (s.trends[id]) s.trends[id] = Trend.fromJSON(id, d.trends[id])
      }
    }
    return s
  }
}
