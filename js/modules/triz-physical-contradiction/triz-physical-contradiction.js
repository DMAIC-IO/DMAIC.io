import { createModule } from '../../core/template-module.js';
import { State } from './triz-physical-contradiction-model.js';

const PRINCIPLE_NUM = { time: 1, space: 2, condition: 3, system: 4 };

/** @type {Record<string, string>} */
const PRINCIPLE_ICONS = {
  time: 'domain.time',
  space: 'domain.space',
  condition: 'domain.condition',
  system: 'domain.system',
};

export default createModule({
  config: {
    id: 'triz-physical-contradiction',
    engine: 'alpine',
    phase: 'improve',
    icon: 'module.triz-physical-contradiction',
    version: '0.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // unique IDs for label/input pairing (per instance)
      paramId: `triz-pc-param-${  module._context.instanceId}`,
      reqAId: `triz-pc-a-${  module._context.instanceId}`,
      reqBId: `triz-pc-b-${  module._context.instanceId}`,
      problemNoteId: `triz-pc-note-${  module._context.instanceId}`,
      radioName: `triz-pc-selected-${  module._context.instanceId}`,

      // Principle helpers (i18n for dynamic keys — cannot use string concatenation in template)
      principleNum: (key) => PRINCIPLE_NUM[key] || '',
      principleIcon: (key) => PRINCIPLE_ICONS[key] ?? 'status.info',
      principleName: (key) => _t(`principles.${  key  }.name`),
      principleQuestion: (key) => _t(`principles.${  key  }.question`),
      principleExample: (key) => _t(`principles.${  key  }.example`),

      // CSS class for selected principle
      principleSelectedClass: (key, selected) =>
        key === selected ? 'is-selected' : '',

      // Pipe filter for chosen principle name in solution section
      chosenPrincipleName: (key) =>
        key ? _t(`principles.${  key  }.name`) : '',

      // Radio checked state helper (needed because template engine can't evaluate expressions in x-bind:)
      isChecked: (key, selected) => key === selected,

      // Event handlers
      swap() {
        this.model.swap();
      },

      selectPrinciple(key) {
        this.model.selectedPrinciple = key;
      },

      principleNoteChanged(key, event) {
        this.model.principleNotes[key] = event.target.value;
      },
    };
  },
});
