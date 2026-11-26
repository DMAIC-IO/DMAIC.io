/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'msa-typ1',
  version: '1.1.0',
  icon: 'module.msa-typ1',
  phase: 'measure',
  group: 'msa',
  cycles: {
    dmaic: { phase: 'measure' },
    dmadv: { phase: 'measure' },
    eightd: { phase: 'problem' },
  },
  load: () => import('./viewmodel/viewmodel.js'),
};
