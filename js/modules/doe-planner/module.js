/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'doe-planner',
  version: '4.0.0',
  icon: 'module.doe-planner',
  phase: 'improve',
  group: 'plan',
  cycles: {
    dmaic: { phase: 'improve' },
    dmadv: { phase: 'design' },
    eightd: { phase: 'corrective' },
  },
  uses: ['worksheet', 'regression'],
  load: () => import('./viewmodel/viewmodel.js'),
};
