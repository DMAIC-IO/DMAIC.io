/** Model for the bug report opt-in: both boxes always start unchecked. */
export class Model {
  screenshot = false;
  project = false;

  /**
   * Reset both boxes — every open starts unchecked (spec decision 2).
   * @returns {Model}
   */
  apply() {
    this.screenshot = false;
    this.project = false;
    return this;
  }

  /** @returns {boolean} always true — every combination is a valid choice */
  validate() { return true; }

  /** @returns {{screenshot: boolean, project: boolean}} */
  result() { return { screenshot: this.screenshot === true, project: this.project === true }; }
}
