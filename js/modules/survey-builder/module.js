/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'survey-builder',
  version: '2.0.0',
  icon: 'module.survey-builder',
  phase: 'define',
  group: 'customer',
  allowedPhases: ['define'],
  cycles: {
    dmaic: { phase: 'define', allowedPhases: ['define'] },
    dmadv: { phase: 'define', allowedPhases: ['define'] },
  },
  uses: ['kano', 'voc-ctx-tree', 'worksheet'],
  load: () => import('./viewmodel/viewmodel.js'),
};
