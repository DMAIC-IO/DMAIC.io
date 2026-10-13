/**
 * @type {readonly string[]} die sechs Feldarten: M mechanisch, A akustisch,
 *   T thermisch, C chemisch, E elektrisch, Mg magnetisch
 */
export const FIELDS = ['M', 'A', 'T', 'C', 'E', 'Mg'];
/**
 * @type {readonly string[]} die fünf Arten der Verknüpfung zwischen den
 *   beiden Stoffen
 */
export const LINKS  = ['useful', 'insufficient', 'excessive', 'harmful', 'missing'];
/** @type {readonly string[]} die beiden Listenfilter der Standardlösungen */
export const FILTER_MODES = ['auto', 'all'];

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

  /** @type {string} der Stoff S1 — der Stoff, der die Wirkung auslöst */
  s1 = ''

  /** @type {string} der Stoff S2 — der Stoff, auf den gewirkt wird */
  s2 = ''

  /** @type {string} die Feldart zwischen den Stoffen: M, A, T, C, E oder Mg; leer, solange keine gewählt ist */
  field = ''

  /** @type {string} die Verknüpfung: useful, insufficient, excessive, harmful oder missing; leer, solange keine gewählt ist */
  link = ''

  /** @type {string} die Problemnotiz zum Stoff-Feld-Modell */
  problemNote = ''

  /** @type {Record<string, string>} je vermerkter Standardlösung eine Notiz, adressiert über ihre id (zum Beispiel 2.2.5) */
  notes = {}

  /** @type {Record<string, boolean>} die vorgemerkten Standardlösungen, adressiert über ihre id; nur vorgemerkte stehen darin */
  selected = {}

  /** @type {string} der Listenfilter: auto zeigt nur die zur Diagnose passenden Klassen, all alle fünf */
  filterMode = 'auto'

  /** @type {number[]} die Nummern der aufgeklappten Standardklassen (1 bis 5) */
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
    s.filterMode = FILTER_MODES.includes(d.filterMode) ? d.filterMode : 'auto'
    s.expandedClasses = Array.isArray(d.expandedClasses)
      ? d.expandedClasses.filter(n => Number.isInteger(n))
      : []
    return s
  }
}
