/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'raci-matrix',
  version: '1.0.0',
  icon: 'module.raci-matrix',
  phase: 'define',
  group: 'team',
  allowedPhases: ['define'],
  cycles: {
    dmaic: { phase: 'define', allowedPhases: ['define'] },
    dmadv: { phase: 'define', allowedPhases: ['define'] },
    eightd: { phase: 'team', allowedPhases: ['team'] },
  },
  load: () => import('./viewmodel/viewmodel.js'),
  tile: () => import('./tile/tile.js'),
};
