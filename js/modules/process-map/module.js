/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'process-map',
  version: '1.0.0',
  icon: 'module.process-map',
  phase: 'measure',
  group: 'flowcharts',
  cycles: {
    dmaic: { phase: 'measure' },
    dmadv: { phase: 'measure' },
    eightd: { phase: 'problem', allowedPhases: ['problem', 'rootcause'] },
  },
  load: () => import('./viewmodel/viewmodel.js'),
};
