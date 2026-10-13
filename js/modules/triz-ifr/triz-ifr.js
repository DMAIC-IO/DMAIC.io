/**
 * D.Mike — Ideales Endresultat (TRIZ) (triz-ifr.js)
 *
 * @agent  Vollständig über das Viewmodel steuerbar: System, nützliche
 *   Funktion, schädliche Wirkung, die drei IFR-Stufen und die
 *   Hindernisliste. Der Hinweis auf die Ressourcen-Checkliste bleibt der
 *   Oberfläche vorbehalten.
 */
import { createModule } from '../../core/template-module.js';
import { agentReadMixin } from '../../core/agent/agent-read-mixin.js';
import { requireText } from '../../core/agent/agent-argcheck.js';
import { State } from './triz-ifr-model.js';

export default createModule({
  config: {
    id: 'triz-ifr',
    engine: 'alpine',
    phase: 'improve',
    icon: 'module.triz-ifr',
    version: '0.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      ...agentReadMixin(module),

      /**
       * @noagent zeigt einen Hinweis in der Oberfläche; der Agent liest den
       * Zustand über `read()`.
       */
      openResources() {
        module._context.notify?.(_t('openResourcesHint'), 'info');
      },

      // ── Zustands-Sinks: ein Setter je Textfeld (Plan E7) ──────────────
      // Bewusst sieben benannte Setter statt eines generischen
      // `setField(name, text)`: nur so trägt jeder Parameter in
      // `module.describe` seinen eigenen Hilfesatz, statt die Bedeutung in
      // eine Fehlermeldung über einen `name`-Parameter zu verschieben.

      /**
       * Setzt das betrachtete System, auf das sich alle
       * IFR-Formulierungen beziehen.
       * @agent
       * @param {string} text Name oder kurze Beschreibung des Systems
       * @returns {void}
       * @throws {Error} wenn `text` keine Zeichenkette ist
       */
      setSystem(text) { this.model.system = requireText('text', text); },

      /**
       * Setzt die nützliche Funktion, die das System erfüllen soll.
       * @agent
       * @param {string} text die nützliche Funktion
       * @returns {void}
       * @throws {Error} wenn `text` keine Zeichenkette ist
       */
      setUsefulFunction(text) { this.model.usefulFunction = requireText('text', text); },

      /**
       * Setzt die schädliche Wirkung oder den Kompromiss, den das System
       * heute mitbringt.
       * @agent
       * @param {string} text die schädliche Wirkung
       * @returns {void}
       * @throws {Error} wenn `text` keine Zeichenkette ist
       */
      setHarmfulEffect(text) { this.model.harmfulEffect = requireText('text', text); },

      /**
       * Setzt die IFR-1-Formulierung: das System bleibt, die schädliche
       * Wirkung verschwindet ohne neuen Mechanismus.
       * @agent
       * @param {string} text die IFR-1-Formulierung
       * @returns {void}
       * @throws {Error} wenn `text` keine Zeichenkette ist
       */
      setIfr1(text) { this.model.ifr1 = requireText('text', text); },

      /**
       * Setzt die IFR-2-Formulierung: die nützliche Funktion entsteht, ohne
       * dass das System überhaupt existiert.
       * @agent
       * @param {string} text die IFR-2-Formulierung
       * @returns {void}
       * @throws {Error} wenn `text` keine Zeichenkette ist
       */
      setIfr2(text) { this.model.ifr2 = requireText('text', text); },

      /**
       * Setzt die IFR-3-Formulierung: eine bereits vorhandene Ressource aus
       * dem Supersystem übernimmt die Funktion.
       * @agent
       * @param {string} text die IFR-3-Formulierung
       * @returns {void}
       * @throws {Error} wenn `text` keine Zeichenkette ist
       */
      setIfr3(text) { this.model.ifr3 = requireText('text', text); },

      /**
       * Setzt die Liste der Hindernisse, die das System heute vom IFR
       * trennen — sie ist die eigentliche Aufgabenliste.
       * @agent
       * @param {string} text die Hindernisse, eines je Zeile
       * @returns {void}
       * @throws {Error} wenn `text` keine Zeichenkette ist
       */
      setObstacles(text) { this.model.obstacles = requireText('text', text); },
    };
  },
});
