/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'response-optimization',
  version: '1.0.0',
  icon: 'module.response-optimization',
  phase: 'improve',
  group: 'optimize',
  uses: ['regression', 'glm-regression'],
  cycles: {
    dmaic: { phase: 'improve' },
    dmadv: { phase: 'design' },
    eightd: { phase: 'corrective' },
  },
  load: () => import('./viewmodel/viewmodel.js'),
};
