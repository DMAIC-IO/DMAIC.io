/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'process-capability',
  version: '2.0.0',
  icon: 'module.process-capability',
  phase: 'measure',
  group: 'capability',
  cycles: {
    dmaic: { phase: 'measure' },
    dmadv: { phase: 'measure', allowedPhases: ['measure', 'verify'] },
    eightd: { phase: 'problem', allowedPhases: ['problem', 'implementation'] },
  },
  uses: ['worksheet'],
  load: () => import('./viewmodel/viewmodel.js'),
  tile: () => import('./tile/tile.js'),
};
