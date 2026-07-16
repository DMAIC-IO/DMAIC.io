const FIELDS = ['M', 'A', 'T', 'C', 'E', 'Mg'];
const LINKS  = ['useful', 'insufficient', 'excessive', 'harmful', 'missing'];

export function diagnose(s1, s2, field, link) {
  const hasS1 = Boolean(s1?.trim());
  const hasS2 = Boolean(s2?.trim());
  if (!hasS1 || !hasS2) {
    return { situation: 'partial', suggestedClasses: [1] };
  }
  if (!field || link === 'missing') {
    return { situation: 'incomplete', suggestedClasses: [1] };
  }
  switch (link) {
    case 'useful':        return { situation: 'complete-useful',        suggestedClasses: [2, 3] };
    case 'insufficient':  return { situation: 'complete-insufficient',  suggestedClasses: [2] };
    case 'excessive':     return { situation: 'complete-excessive',     suggestedClasses: [2, 5] };
    case 'harmful':       return { situation: 'complete-harmful',       suggestedClasses: [1, 5] };
    default:              return { situation: 'incomplete',             suggestedClasses: [1] };
  }
}

export class State {
  static VERSION = '1.0'
  static ID = 'triz-sufield'

  _schema = { name: State.ID, version: State.VERSION }
  s1 = ''
  s2 = ''
  field = ''
  link = ''
  problemNote = ''
  notes = {}
  selected = {}
  filterMode = 'auto'
  expandedClasses = []

  hasContent() {
    return Boolean(this.s1 || this.s2 || this.field || this.link
      || this.problemNote
      || Object.keys(this.notes).length
      || Object.keys(this.selected).length)
  }

  toJSON() {
    return {
      _schema: { ...this._schema },
      s1: this.s1,
      s2: this.s2,
      field: this.field,
      link: this.link,
      problemNote: this.problemNote,
      notes: { ...this.notes },
      selected: { ...this.selected },
      filterMode: this.filterMode,
      expandedClasses: [...this.expandedClasses],
    }
  }

  static fromJSON(d) {
    const s = new State()
    if (!d) return s
    s.s1 = typeof d.s1 === 'string' ? d.s1 : ''
    s.s2 = typeof d.s2 === 'string' ? d.s2 : ''
    s.field = FIELDS.includes(d.field) ? d.field : ''
    s.link = LINKS.includes(d.link) ? d.link : ''
    s.problemNote = typeof d.problemNote === 'string' ? d.problemNote : ''
    s.notes = (d.notes && typeof d.notes === 'object') ? { ...d.notes } : {}
    s.selected = (d.selected && typeof d.selected === 'object') ? { ...d.selected } : {}
    s.filterMode = d.filterMode === 'all' ? 'all' : 'auto'
    s.expandedClasses = Array.isArray(d.expandedClasses)
      ? d.expandedClasses.filter(n => Number.isInteger(n))
      : []
    return s
  }
}
