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
       * Setzt das betrachtete System. Schreibt dasselbe Feld wie
       * `x-model="model.system"` in der Vorlage.
       * @agent
       * @param {string} text Name oder kurze Beschreibung des Systems
       * @returns {void}
       */
      setSystem(text) { this.model.system = String(text ?? ''); },

      /**
       * Setzt die nützliche Funktion, die das System erfüllen soll.
       * Schreibt dasselbe Feld wie `x-model="model.usefulFunction"` in der
       * Vorlage.
       * @agent
       * @param {string} text die nützliche Funktion
       * @returns {void}
       */
      setUsefulFunction(text) { this.model.usefulFunction = String(text ?? ''); },

      /**
       * Setzt die schädliche Wirkung oder den Kompromiss, den das System
       * heute mitbringt. Schreibt dasselbe Feld wie
       * `x-model="model.harmfulEffect"` in der Vorlage.
       * @agent
       * @param {string} text die schädliche Wirkung
       * @returns {void}
       */
      setHarmfulEffect(text) { this.model.harmfulEffect = String(text ?? ''); },

      /**
       * Setzt die IFR-1-Formulierung: das System bleibt, die schädliche
       * Wirkung verschwindet ohne neuen Mechanismus. Schreibt dasselbe Feld
       * wie `x-model="model.ifr1"` in der Vorlage.
       * @agent
       * @param {string} text die IFR-1-Formulierung
       * @returns {void}
       */
      setIfr1(text) { this.model.ifr1 = String(text ?? ''); },

      /**
       * Setzt die IFR-2-Formulierung: die nützliche Funktion entsteht, ohne
       * dass das System überhaupt existiert. Schreibt dasselbe Feld wie
       * `x-model="model.ifr2"` in der Vorlage.
       * @agent
       * @param {string} text die IFR-2-Formulierung
       * @returns {void}
       */
      setIfr2(text) { this.model.ifr2 = String(text ?? ''); },

      /**
       * Setzt die IFR-3-Formulierung: eine vorhandene Ressource aus dem
       * Supersystem übernimmt die Funktion. Schreibt dasselbe Feld wie
       * `x-model="model.ifr3"` in der Vorlage.
       * @agent
       * @param {string} text die IFR-3-Formulierung
       * @returns {void}
       */
      setIfr3(text) { this.model.ifr3 = String(text ?? ''); },

      /**
       * Setzt die Liste der Hindernisse, die das System heute vom IFR
       * trennen. Schreibt dasselbe Feld wie `x-model="model.obstacles"` in
       * der Vorlage.
       * @agent
       * @param {string} text die Hindernisse, eines je Zeile
       * @returns {void}
       */
      setObstacles(text) { this.model.obstacles = String(text ?? ''); },
    };
  },
});
