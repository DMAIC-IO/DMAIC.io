/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'todo',
  version: '1.0.0',
  icon: 'module.todo',
  phase: 'define',
  group: 'team',
  allowedPhases: ['define'],
  cycles: {
    dmaic: { phase: 'define', allowedPhases: ['define'] },
    dmadv: { phase: 'define', allowedPhases: ['define'] },
    eightd: { phase: 'team', allowedPhases: ['team', 'containment'] },
  },
  load: () => import('./viewmodel/viewmodel.js'),
  tile: () => import('./tile/tile.js'),
};
