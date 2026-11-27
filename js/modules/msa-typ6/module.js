/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'msa-typ6',
  version: '1.1.0',
  icon: 'module.msa-typ6',
  phase: 'measure',
  group: 'msa',
  cycles: {
    dmaic: { phase: 'measure' },
    dmadv: { phase: 'measure' },
    eightd: { phase: 'problem' },
  },
  uses: ['worksheet', 'msa-typ1'],
  load: () => import('./viewmodel/viewmodel.js'),
};
