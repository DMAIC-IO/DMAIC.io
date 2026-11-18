/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'attribute-control-chart',
  version: '1.1.0',
  icon: 'module.attribute-control-chart',
  phase: 'control',
  group: 'charts',
  allowedPhases: ['control'],
  cycles: {
    dmaic: { phase: 'control', allowedPhases: ['control'] },
    dmadv: { phase: 'verify', allowedPhases: ['verify'] },
    eightd: { phase: 'implementation', allowedPhases: ['implementation', 'prevent'] },
  },
  load: () => import('./viewmodel/viewmodel.js'),
  uses: ['worksheet'],
  tile: () => import('./tile/tile.js'),
};
