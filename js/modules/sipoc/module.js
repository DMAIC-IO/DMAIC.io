/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'sipoc',
  version: '1.0.0',
  icon: 'module.sipoc',
  phase: 'define',
  group: 'scope',
  cycles: {
    dmaic: { phase: 'define' },
    dmadv: { phase: 'define' },
    eightd: { phase: 'problem' },
  },
  load: () => import('./viewmodel/viewmodel.js'),
  tile: () => import('./tile/tile.js'),
};
