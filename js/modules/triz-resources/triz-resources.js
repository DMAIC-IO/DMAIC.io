import {createModule} from '../../core/template-module.js';
import {State} from './triz-resources-model.js';

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
            catIcon: (k) => _t(`category.${  k  }.icon`),
            catName: (k) => _t(`category.${  k  }.name`),
            catPrompt: (k) => _t(`category.${  k  }.prompt`),

            glyph: (s) => ({full: '●', partial: '◑', unused: '◔'}[s] || '○'),
            statusSuffix: (s) => `triz-res__status--${  s}`,

            cycleStatus(catKey, lvlKey) {
                const cell = this.model.cells[catKey][lvlKey];
                cell.cycleStatus();
            },
        };
    }
});
