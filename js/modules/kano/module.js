/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'kano',
  version: '1.0.0',
  icon: 'module.kano',
  phase: 'define',
  group: 'customer',
  allowedPhases: ['define'],
  cycles: {
    dmaic: { phase: 'define', allowedPhases: ['define'] },
    dmadv: { phase: 'define', allowedPhases: ['define'] },
  },
  load: () => import('./viewmodel/viewmodel.js'),
  uses: ['voc-ctx-tree'],
  tile: () => import('./tile/tile.js'),
};
