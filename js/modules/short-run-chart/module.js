/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'short-run-chart',
  version: '2.0.0',
  icon: 'module.short-run-chart',
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
