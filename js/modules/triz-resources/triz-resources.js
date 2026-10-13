/**
 * D.Mike — Ressourcen-Checkliste (TRIZ) (triz-resources.js)
 *
 * @agent  Vollständig über das Viewmodel steuerbar: das betrachtete System
 *   und jedes der 18 Ressourcenfelder — Notiz und Füllstand. Der Oberfläche
 *   bleiben nur die Anzeigeentscheidungen (Icon, Kategoriename, Platzhalter).
 */
import {createModule} from '../../core/template-module.js';
import {agentReadMixin} from '../../core/agent/agent-read-mixin.js';
import {requireEnum} from '../../core/agent/agent-argcheck.js';
import {State, CATEGORIES, LEVELS, CELL_STATUSES} from './triz-resources-model.js';

/**
 * Kategorie → Icon-Name. Steht hier und nicht in i18n: das Icon ist keine
 * Übersetzung, und zwei Sprachdateien müssten sonst denselben Wert pflegen.
 * @type {Record<string, string>}
 */
const CATEGORY_ICONS = {
    substance: 'domain.substance',
    field: 'domain.field',
    space: 'domain.geometry',
    time: 'domain.time',
    info: 'domain.info',
    function: 'domain.function',
};

export default createModule({
    config: {
        id: 'triz-resources',
        engine: 'alpine',
        phase: 'improve',
        icon: 'module.triz-resources',
        version: '0.1.0',
        meta: import.meta,
    },
    Model: State,
    data(module, _t) {
        return {
            ...agentReadMixin(module),

            /** @noagent view transform — Kategorie auf Icon-Namen. */
            catIcon: (k) => CATEGORY_ICONS[k] ?? 'status.info',
            /** @noagent view transform — übersetzter Kategoriename. */
            catName: (k) => _t(`category.${  k  }.name`),
            /** @noagent view transform — übersetzter Platzhalter der Kategorie. */
            catPrompt: (k) => _t(`category.${  k  }.prompt`),
            /** @noagent view transform — Füllstand auf Icon-Namen. */
            fillIcon: (s) => ({ full: 'fill.100', partial: 'fill.50', unused: 'fill.25' }[s] || 'fill.0'),
            /** @noagent view transform — Füllstand auf CSS-Variantenklasse. */
            statusSuffix: (s) => `triz-res__status--${  s}`,

            // ── Zustands-Sinks ────────────────────────────────────────────
            // Die Zelle ist über ihre beiden Koordinaten adressiert, nicht
            // über ein Zellobjekt: ein Agent hat aus `read()` nur die
            // Kategorie- und Ebenenschlüssel, kein `Cell` (Plan-Regel B).
            // Beide Koordinaten gehen durch `requireEnum`, weil
            // `cells[catKey][lvlKey]` bei einem Wert daneben auf `undefined`
            // liefe — der Aufruf würfe dann einen nackten TypeError statt
            // einer Meldung, die die gültigen Schlüssel nennt.

            /**
             * Setzt das betrachtete System, dessen Ressourcen aufgenommen
             * werden.
             * @agent
             * @param {string} text Name oder kurze Beschreibung des Systems
             * @returns {void}
             */
            setSystem(text) { this.model.system = String(text ?? ''); },

            /**
             * Setzt die Notiz eines Ressourcenfeldes.
             * @agent
             * @param {string} catKey Ressourcenkategorie
             * @param {string} lvlKey Systemebene
             * @param {string} text die Notiz
             * @returns {void}
             * @throws {Error} wenn catKey keine Kategorie oder lvlKey keine
             *   Ebene der Matrix ist
             */
            setCellNotes(catKey, lvlKey, text) {
                requireEnum('catKey', catKey, CATEGORIES);
                requireEnum('lvlKey', lvlKey, LEVELS);
                this.model.cells[catKey][lvlKey].notes = String(text ?? '');
            },

            /**
             * Setzt den Füllstand eines Ressourcenfeldes absolut.
             * @agent
             * @param {string} catKey Ressourcenkategorie
             * @param {string} lvlKey Systemebene
             * @param {string} status der Füllstand
             * @returns {void}
             * @throws {Error} wenn catKey, lvlKey oder status nicht zur
             *   jeweiligen Wertemenge gehört
             */
            setCellStatus(catKey, lvlKey, status) {
                requireEnum('catKey', catKey, CATEGORIES);
                requireEnum('lvlKey', lvlKey, LEVELS);
                requireEnum('status', status, CELL_STATUSES);
                this.model.cells[catKey][lvlKey].status = status;
            },

            /**
             * Schaltet den Füllstand eines Ressourcenfeldes einen Schritt
             * weiter: unknown, unused, partial, full, wieder unknown.
             * @agent
             * @param {string} catKey Ressourcenkategorie
             * @param {string} lvlKey Systemebene
             * @returns {void}
             * @throws {Error} wenn catKey keine Kategorie oder lvlKey keine
             *   Ebene der Matrix ist
             */
            cycleStatus(catKey, lvlKey) {
                requireEnum('catKey', catKey, CATEGORIES);
                requireEnum('lvlKey', lvlKey, LEVELS);
                const cell = this.model.cells[catKey][lvlKey];
                cell.cycleStatus();
            },
        };
    }
});
