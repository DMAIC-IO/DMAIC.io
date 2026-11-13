/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'project-charter',
  version: '1.0.0',
  icon: 'module.project-charter',
  phase: 'define',
  group: 'scope',
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
