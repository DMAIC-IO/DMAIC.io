/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'dmaic-calendar',
  version: '1.0.0',
  icon: 'module.dmaic-calendar',
  phase: 'define',
  group: 'team',
  singleton: true,
  allowedPhases: ['define'],
  cycles: {
    dmaic: { phase: 'define', allowedPhases: ['define'] },
    dmadv: { phase: 'define', allowedPhases: ['define'] },
    eightd: { phase: 'team', allowedPhases: ['team'] },
  },
  load: () => import('./viewmodel/viewmodel.js'),
  tile: () => import('./tile/tile.js'),
};
