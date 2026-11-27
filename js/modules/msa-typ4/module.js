/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'msa-typ4',
  version: '1.1.0',
  icon: 'module.msa-typ4',
  phase: 'measure',
  group: 'msa',
  cycles: {
    dmaic: { phase: 'measure' },
    dmadv: { phase: 'measure' },
    eightd: { phase: 'problem' },
  },
  uses: ['worksheet'],
  load: () => import('./viewmodel/viewmodel.js'),
};
