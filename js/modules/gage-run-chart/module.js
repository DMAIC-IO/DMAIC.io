/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'gage-run-chart',
  version: '2.0.0',
  icon: 'module.gage-run-chart',
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
