/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'chart-suggestion',
  version: '2.0.0',
  icon: 'module.chart-suggestion',
  phase: 'data',
  group: 'visualize',
  // Begleiter der Datensammlung: angelegt über „Diagramm vorschlagen“ dort,
  // nicht über das Phasenmenü.
  hiddenFromMenu: true,
  uses: ['worksheet'],
  load: () => import('./viewmodel/viewmodel.js'),
};
