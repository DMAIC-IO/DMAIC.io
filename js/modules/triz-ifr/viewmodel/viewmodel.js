/**
 * D.Mike — Ideales Endresultat (TRIZ): Viewmodel.
 *
 * Die sieben Textfelder liegen im Model (domain/model.js) und binden im
 * Template über `x-model`; die Agentenfläche entsteht aus dem Schema
 * (`read`, `instance.set`). Hier bleiben nur die ids der Eingabefelder je
 * Instanz und der Hinweis auf die Ressourcen-Checkliste.
 */
import { createModule } from '../../../core/template-module.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';

export default createModule({
  descriptor,
  Model: State,
  history: true,
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    return {
      /**
       * id eines Eingabefelds, eindeutig je Instanz: `<label for>` zeigt so
       * auch bei mehreren offenen Instanzen auf das eigene Feld.
       * @param {string} name Kurzname des Felds (`system`, `useful`, `harmful`)
       * @returns {string}
       */
      fieldId(name) { return `triz-ifr-${name}-${ctx.instanceId}`; },

      /**
       * Zeigt den Hinweis, wie die Ressourcen-Checkliste hinzukommt. Ändert
       * kein Model.
       * @returns {void}
       */
      openResources() { ctx.notify(this.t('openResourcesHint'), 'info'); },
    };
  },
});
