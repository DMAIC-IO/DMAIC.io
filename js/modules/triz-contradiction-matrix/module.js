/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'triz-contradiction-matrix',
  version: '0.1.0',
  icon: 'module.triz-contradiction-matrix',
  phase: 'improve',
  cycles: {
    eightd: { phase: 'corrective' },
  },
  load: () => import('./viewmodel/viewmodel.js'),
};
