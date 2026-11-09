/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'morphological-box',
  version: '1.0.0',
  icon: 'module.morphological-box',
  phase: 'improve',
  group: 'solutions',
  cycles: {
    dmaic: { phase: 'improve' },
    dmadv: { phase: 'design' },
    eightd: { phase: 'corrective' },
  },
  load: () => import('./viewmodel/viewmodel.js'),
};
