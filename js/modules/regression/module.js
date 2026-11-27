/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'regression',
  version: '2.0.0',
  icon: 'module.regression',
  phase: 'improve',
  allowedPhases: ['measure', 'analyze', 'improve', 'control'],
  group: 'evaluate',
  uses: ['worksheet', 'doe-planner'],
  cycles: {
    dmaic: { phase: 'improve' },
    dmadv: { phase: 'design', allowedPhases: ['design', 'verify'] },
    eightd: { phase: 'corrective', allowedPhases: ['rootcause', 'corrective'] },
  },
  load: () => import('./viewmodel/viewmodel.js'),
};
