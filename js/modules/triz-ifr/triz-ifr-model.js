export class State {
  static VERSION = '1.0'
  static ID = 'triz-ifr'

  _schema = { name: State.ID, version: State.VERSION }

  /** @type {string} das betrachtete System — Name oder kurze Beschreibung */
  system = ''

  /** @type {string} die nützliche Funktion, die das System erfüllen soll */
  usefulFunction = ''

  /** @type {string} die schädliche Wirkung oder der Kompromiss, den das System heute mitbringt */
  harmfulEffect = ''

  /** @type {string} IFR-1: das System bleibt, die schädliche Wirkung verschwindet ohne neuen Mechanismus */
  ifr1 = ''

  /** @type {string} IFR-2: die nützliche Funktion entsteht, ohne dass das System überhaupt existiert */
  ifr2 = ''

  /** @type {string} IFR-3: eine vorhandene Ressource aus dem Supersystem übernimmt die Funktion */
  ifr3 = ''

  /** @type {string} die Hindernisse, die das System heute vom IFR trennen — eines je Zeile */
  obstacles = ''

  hasContent() {
    return Boolean(this.system || this.usefulFunction || this.harmfulEffect
      || this.ifr1 || this.ifr2 || this.ifr3 || this.obstacles);
  }

  toJSON() {
    return {
      _schema: { ...this._schema },
      system: this.system,
      usefulFunction: this.usefulFunction,
      harmfulEffect: this.harmfulEffect,
      ifr1: this.ifr1,
      ifr2: this.ifr2,
      ifr3: this.ifr3,
      obstacles: this.obstacles,
    }
  }

  static _fieldsFromJSON(d) {
    return {
      system: typeof d.system === 'string' ? d.system : '',
      usefulFunction: typeof d.usefulFunction === 'string' ? d.usefulFunction : '',
      harmfulEffect: typeof d.harmfulEffect === 'string' ? d.harmfulEffect : '',
      ifr1: typeof d.ifr1 === 'string' ? d.ifr1 : '',
      ifr2: typeof d.ifr2 === 'string' ? d.ifr2 : '',
      ifr3: typeof d.ifr3 === 'string' ? d.ifr3 : '',
      obstacles: typeof d.obstacles === 'string' ? d.obstacles : '',
    }
  }

  static fromJSON(d) {
    const s = new State()
    if (!d) return s
    Object.assign(s, State._fieldsFromJSON(d))
    return s
  }
}
