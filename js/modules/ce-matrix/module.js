/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'ce-matrix',
  version: '1.0.0',
  icon: 'module.ce-matrix',
  phase: 'analyze',
  group: 'causes',
  cycles: {
    dmaic: { phase: 'analyze' },
    dmadv: { phase: 'analyze' },
    eightd: { phase: 'rootcause' },
  },
  load: () => import('./viewmodel/viewmodel.js'),
};
