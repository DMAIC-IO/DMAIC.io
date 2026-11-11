/**
 * D.Mike — Flowchart: Glieder für den Unterschritt-Teil (substeps-view.js)
 *
 * Die Methoden, die `substeps.view.part.html` im Scope erwartet, einmal für
 * alle Flowchart-Module. Das Modul breitet sie in seinem view-Block aus:
 *
 *   view() { return { ...substepsView(), stepNum(i) { … } }; }
 *
 * `this` ist die Komponente wie in jedem view-Glied: gelesen werden
 * `this.model.expanded` (ids der aufgeklappten Schritte) und `this.t`
 * (Schlüssel `substepsLabel` des Moduls), jeweils beim Aufruf.
 */

/**
 * @returns {{
 *   isExpanded: (id: string) => boolean,
 *   expandArg: (id: string) => 'true'|'false',
 *   ariaExpanded: (id: string) => 'true'|'false',
 *   substepsBarClass: (step: { substeps: unknown[] }) => string,
 *   substepsBarLabel: (step: { substeps: unknown[] }) => string,
 *   substepNum: (i: number, j: number) => string,
 * }} Glieder für den view-Block
 */
export function substepsView() {
  return {
    /**
     * Steht der Schritt in `expanded`?
     * @this {{ model: { expanded: string[] } }} @param {string} id @returns {boolean}
     */
    isExpanded(id) {
      return this.model.expanded.includes(id);
    },

    /**
     * Argument `expanded` für `setExpanded` als Attributtext: schaltet um.
     * @this {any} @param {string} id @returns {'true'|'false'}
     */
    expandArg(id) {
      return this.isExpanded(id) ? 'false' : 'true';
    },

    /** @this {any} @param {string} id @returns {'true'|'false'} Wert für `aria-expanded` */
    ariaExpanded(id) {
      return this.isExpanded(id) ? 'true' : 'false';
    },

    /**
     * Klasse der Aufklappleiste: hervorgehoben, wenn der Schritt Unterschritte hat.
     * @param {{ substeps: unknown[] }} step @returns {string}
     */
    substepsBarClass(step) {
      return step.substeps.length > 0 ? 'fc-substeps-bar--has' : '';
    },

    /**
     * Beschriftung der Leiste, mit Anzahl, sobald es Unterschritte gibt.
     * @this {{ t: (key: string) => string }} @param {{ substeps: unknown[] }} step @returns {string}
     */
    substepsBarLabel(step) {
      const n = step.substeps.length;
      return n > 0 ? `${this.t('substepsLabel')} (${n})` : this.t('substepsLabel');
    },

    /**
     * Nummer eines Unterschritts: „Schritt.Unterschritt“, beide ab 1.
     * @param {number} i Index des Schritts @param {number} j Index des Unterschritts @returns {string}
     */
    substepNum(i, j) {
      return `${i + 1}.${j + 1}`;
    },
  };
}
