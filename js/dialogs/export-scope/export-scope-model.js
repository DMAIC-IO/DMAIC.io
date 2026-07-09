/** Model for the export-scope dialog: current vs. all projects. */
export class Model {
  /** @type {'current'|'all'} */
  scope = 'current';
  /** @type {number} */
  projectCount = 0;

  apply(init = {}) {
    this.scope = 'current';
    this.projectCount = init.projectCount ?? 0;
    return this;
  }

  validate() { return true; }

  /** @returns {'current'|'all'} */
  result() { return this.scope; }
}
