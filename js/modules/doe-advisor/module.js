/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'doe-advisor',
  version: '1.0.0',
  icon: 'module.doe-advisor',
  phase: 'improve',
  group: 'plan',
  cycles: {
    dmaic: { phase: 'improve' },
    dmadv: { phase: 'design' },
    eightd: { phase: 'corrective' },
  },
  load: () => import('./viewmodel/viewmodel.js'),
};
