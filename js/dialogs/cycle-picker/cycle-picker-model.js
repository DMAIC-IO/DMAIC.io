/** Model for the cycle-picker dialog. cycles: pre-translated {id,name,short,description}. */
export class Model {
  /** @type {{id:string,name:string,short:string,description:string}[]} */
  cycles = [];
  /** @type {string} */
  selected = '';

  apply(init = {}) {
    this.cycles = Array.isArray(init.cycles) ? init.cycles : [];
    this.selected = init.preselected
      || (this.cycles.length ? this.cycles[0].id : '');
    return this;
  }

  validate() { return Boolean(this.selected); }

  /** @returns {string} chosen cycle id */
  result() { return this.selected; }
}
