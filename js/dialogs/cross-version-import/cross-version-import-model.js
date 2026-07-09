/**
 * Model for the cross-version-import dialog.
 * State: list of older-version snapshots + the chosen versionMM.
 */
export class Model {
  /** @type {{versionMM:string,label:string,projectCount:number}[]} */
  versions = [];
  /** @type {string} */
  selected = '';

  apply(init = {}) {
    this.versions = Array.isArray(init.versions) ? init.versions : [];
    this.selected = this.versions.length ? this.versions[0].versionMM : '';
    return this;
  }

  validate() { return Boolean(this.selected); }

  /** @returns {string} chosen versionMM */
  result() { return this.selected; }
}
