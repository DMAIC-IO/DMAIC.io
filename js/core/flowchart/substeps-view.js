/**
 * D.Mike — Flowchart: Glieder für den Unterschritt-Teil (substeps-view.js)
 *
 * Die Methoden, die `substeps.view.part.html` im Scope erwartet, einmal für
 * alle Flowchart-Module. Das Modul breitet sie in seinem view-Block aus:
 *
 *   view() { return { ...substepsView(), stepNum(i) { … } }; }
 *
 * `this` ist die Komponente wie in jedem view-Glied: gelesen werden
 * `this.model.expanded` (ids der aufgeklappten Schritte), `this.t`
 * (Schlüssel `substepsLabel` des Moduls) und `this.state.substepPreview`
 * (Vorschau der Geste `substepGesture`), jeweils beim Aufruf.
 */

/**
 * @returns {{
 *   isExpanded: (id: string) => boolean,
 *   expandArg: (id: string) => 'true'|'false',
 *   ariaExpanded: (id: string) => 'true'|'false',
 *   substepsBarClass: (step: { substeps: unknown[] }) => string,
 *   substepsBarLabel: (step: { substeps: unknown[] }) => string,
 *   substepNum: (i: number, j: number) => string,
 *   substepItemClass: (step: { id: string, substeps: Array<{ id: string }> }, j: number) => string,
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

    /**
     * Zielmarke der Unterschritt-Geste am Unterschritt, an dessen Stelle der
     * gezogene landet: nach oben `is-drop-target` (Linie darüber), nach unten
     * `fc-substep-item--drop-after` (Linie darunter); an der alten Stelle und
     * ohne Geste `''`.
     * @this {{ state: { substepPreview: { group: string, index: number, id: string }|null } }}
     * @param {{ id: string, substeps: Array<{ id: string }> }} step @param {number} j Index des Unterschritts
     * @returns {string}
     */
    substepItemClass(step, j) {
      const p = this.state.substepPreview;
      if (!p || p.group !== step.id || p.index !== j) return '';
      const from = step.substeps.findIndex((s) => s.id === p.id);
      if (from === j) return '';
      return from < j ? 'fc-substep-item--drop-after' : 'is-drop-target';
    },
  };
}
