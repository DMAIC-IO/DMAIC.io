/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'five-why',
  version: '1.0.0',
  icon: 'module.five-why',
  phase: 'define',
  group: 'causes',
  cycles: {
    dmaic: { phase: 'define' },
    dmadv: { phase: 'define', allowedPhases: ['define', 'analyze'] },
    eightd: { phase: 'rootcause', allowedPhases: ['problem', 'rootcause'] },
  },
  load: () => import('./viewmodel/viewmodel.js'),
};
