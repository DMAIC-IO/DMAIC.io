/**
 * @type {readonly string[]} die vier Trennungsprinzipien des physikalischen
 *   Widerspruchs, in Anzeigereihenfolge
 */
export const PRINCIPLES = ['time', 'space', 'condition', 'system'];

function emptyPrincipleNotes() {
  return { time: '', space: '', condition: '', system: '' };
}

export class State {
  static VERSION = '1.0';
  static ID = 'triz-physical-contradiction';

  _schema = { name: State.ID, version: State.VERSION };
  /** @type {string} der technische Parameter, der die beiden gegensätzlichen Anforderungen trägt */
  parameter = '';

  /** @type {string} die Anforderung A — die eine Seite des Widerspruchs */
  requirementA = '';

  /** @type {string} die Anforderung Nicht-A — die entgegengesetzte Seite des Widerspruchs */
  requirementNotA = '';

  /** @type {string} die Problemnotiz: warum beide Anforderungen zugleich unmöglich sind */
  problemNote = '';

  /** @type {Record<string, string>} je Trennungsprinzip (time, space, condition, system) eine Notiz */
  principleNotes = emptyPrincipleNotes();

  /** @type {string|null} das gewählte Trennungsprinzip (time, space, condition, system) oder null */
  selectedPrinciple = null;

  /** @type {string} die Lösungsnotiz zum gewählten Trennungsprinzip */
  solutionNote = '';

  swap() {
    const a = this.requirementA;
    this.requirementA = this.requirementNotA;
    this.requirementNotA = a;
  }

  hasContent() {
    if (this.parameter || this.requirementA || this.requirementNotA || this.problemNote) return true;
    if (this.solutionNote) return true;
    if (this.selectedPrinciple) return true;
    for (const p of PRINCIPLES) {
      if (this.principleNotes[p]) return true;
    }
    return false;
  }

  toJSON() {
    return {
      _schema: { ...this._schema },
      parameter: this.parameter,
      requirementA: this.requirementA,
      requirementNotA: this.requirementNotA,
      problemNote: this.problemNote,
      principleNotes: { ...this.principleNotes },
      selectedPrinciple: this.selectedPrinciple,
      solutionNote: this.solutionNote,
    };
  }

  static fromJSON(d) {
    const s = new State();
    if (!d) return s;
    s.parameter = typeof d.parameter === 'string' ? d.parameter : '';
    s.requirementA = typeof d.requirementA === 'string' ? d.requirementA : '';
    s.requirementNotA = typeof d.requirementNotA === 'string' ? d.requirementNotA : '';
    s.problemNote = typeof d.problemNote === 'string' ? d.problemNote : '';
    const pn = d.principleNotes;
    s.principleNotes = {
      time:      typeof pn?.time      === 'string' ? pn.time      : '',
      space:     typeof pn?.space     === 'string' ? pn.space     : '',
      condition: typeof pn?.condition === 'string' ? pn.condition : '',
      system:    typeof pn?.system    === 'string' ? pn.system    : '',
    };
    s.selectedPrinciple = PRINCIPLES.includes(d.selectedPrinciple) ? d.selectedPrinciple : null;
    s.solutionNote = typeof d.solutionNote === 'string' ? d.solutionNote : '';
    return s;
  }
}
