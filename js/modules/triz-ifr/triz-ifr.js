import { createModule } from '../../core/template-module.js';
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
      openResources() {
        module._context.notify?.(_t('openResourcesHint'), 'info');
      },
    };
  },
});
