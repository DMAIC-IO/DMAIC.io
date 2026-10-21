/** Model for the bug report description step (optionally with screenshot editor). */
export class Model {
  description = '';
  hasScreenshot = false;

  /**
   * Start every open with an empty description.
   * @param {{hasScreenshot?: boolean}} [init]
   * @returns {Model}
   */
  apply(init = {}) {
    this.description = '';
    this.hasScreenshot = init.hasScreenshot === true;
    return this;
  }

  /** @returns {boolean} always true — an empty description is allowed */
  validate() { return true; }

  /** @returns {string} trimmed description (may be empty) */
  result() { return this.description.trim(); }
}
