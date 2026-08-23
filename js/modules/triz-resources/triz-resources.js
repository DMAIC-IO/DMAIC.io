import {createModule} from '../../core/template-module.js';
import {State} from './triz-resources-model.js';

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
            catIcon: (k) => CATEGORY_ICONS[k] ?? 'status.info',
            catName: (k) => _t(`category.${  k  }.name`),
            catPrompt: (k) => _t(`category.${  k  }.prompt`),

            fillIcon: (s) => ({ full: 'fill.100', partial: 'fill.50', unused: 'fill.25' }[s] || 'fill.0'),
            statusSuffix: (s) => `triz-res__status--${  s}`,

            cycleStatus(catKey, lvlKey) {
                const cell = this.model.cells[catKey][lvlKey];
                cell.cycleStatus();
            },
        };
    }
});
