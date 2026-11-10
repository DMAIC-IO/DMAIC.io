/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'msa-typ5',
  version: '1.2.0',
  icon: 'module.msa-typ5',
  phase: 'measure',
  group: 'msa',
  uses: ['worksheet'],
  cycles: {
    dmaic: { phase: 'measure' },
    dmadv: { phase: 'measure' },
    eightd: { phase: 'problem' },
  },
  load: () => import('./viewmodel/viewmodel.js'),
};
