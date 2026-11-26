/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'voc-ctx-tree',
  version: '1.0.0',
  icon: 'module.voc-ctx-tree',
  phase: 'define',
  group: 'customer',
  singleton: true,
  allowedPhases: ['define'],
  cycles: {
    dmaic: { phase: 'define', allowedPhases: ['define'] },
    dmadv: { phase: 'define', allowedPhases: ['define'] },
    eightd: { phase: 'problem', allowedPhases: ['problem'] },
  },
  load: () => import('./viewmodel/viewmodel.js'),
  tile: () => import('./tile/tile.js'),
};
