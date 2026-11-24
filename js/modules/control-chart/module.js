/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'control-chart',
  version: '2.0.0',
  icon: 'module.control-chart',
  phase: 'control',
  group: 'charts',
  allowedPhases: ['control'],
  cycles: {
    dmaic: { phase: 'control', allowedPhases: ['control'] },
    dmadv: { phase: 'verify', allowedPhases: ['verify'] },
    eightd: { phase: 'implementation', allowedPhases: ['implementation', 'prevent'] },
  },
  uses: ['worksheet'],
  load: () => import('./viewmodel/viewmodel.js'),
};
