/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'fmea',
  version: '1.3.0',
  icon: 'module.fmea',
  phase: 'analyze',
  group: 'causes',
  cycles: {
    dmaic: { phase: 'analyze' },
    dmadv: { phase: 'analyze', allowedPhases: ['analyze', 'design'] },
    eightd: { phase: 'prevent', allowedPhases: ['rootcause', 'corrective', 'prevent'] },
  },
  load: () => import('./viewmodel/viewmodel.js'),
  tile: () => import('./tile/tile.js'),
};
