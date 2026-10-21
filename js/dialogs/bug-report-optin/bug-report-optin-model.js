/** Model for the bug report opt-in: all boxes always start unchecked. */
export class Model {
  screenshot = false;
  project = false;
  errors = false;

  /**
   * Reset all boxes — every open starts unchecked (spec decision 2).
   * @returns {Model}
   */
  apply() {
    this.screenshot = false;
    this.project = false;
    this.errors = false;
    return this;
  }

  /** @returns {boolean} always true — every combination is a valid choice */
  validate() { return true; }

  /** @returns {{screenshot: boolean, project: boolean, errors: boolean}} */
  result() {
    return { screenshot: this.screenshot === true, project: this.project === true, errors: this.errors === true };
  }
}
