/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'lessons-learned',
  version: '1.0.0',
  icon: 'module.lessons-learned',
  phase: 'control',
  allowedPhases: ['control'],
  cycles: {
    dmaic: { phase: 'control', allowedPhases: ['control'] },
    dmadv: { phase: 'verify', allowedPhases: ['verify'] },
    eightd: { phase: 'recognize', allowedPhases: ['recognize'] },
  },
  load: () => import('./viewmodel/viewmodel.js'),
  tile: () => import('./tile/tile.js'),
};
