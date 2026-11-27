/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'glm-regression',
  version: '2.0.0',
  icon: 'module.glm-regression',
  phase: 'improve',
  allowedPhases: ['analyze', 'improve'],
  group: 'evaluate',
  uses: ['worksheet'],
  cycles: {
    dmaic: { phase: 'improve', allowedPhases: ['analyze', 'improve'] },
    dmadv: { phase: 'design', allowedPhases: ['analyze', 'design', 'verify'] },
    eightd: { phase: 'corrective', allowedPhases: ['rootcause', 'corrective'] },
  },
  load: () => import('./viewmodel/viewmodel.js'),
};
