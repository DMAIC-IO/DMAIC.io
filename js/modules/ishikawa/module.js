/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'ishikawa',
  version: '2.1.0',
  icon: 'module.ishikawa',
  phase: 'analyze',
  group: 'causes',
  allowedPhases: ['measure', 'analyze', 'improve'],
  cycles: {
    dmaic: { phase: 'analyze', allowedPhases: ['measure', 'analyze', 'improve'] },
    dmadv: { phase: 'analyze', allowedPhases: ['measure', 'analyze', 'design'] },
    eightd: { phase: 'rootcause', allowedPhases: ['problem', 'rootcause', 'corrective'] },
  },
  load: () => import('./viewmodel/viewmodel.js'),
  tile: () => import('./tile/tile.js'),
};
