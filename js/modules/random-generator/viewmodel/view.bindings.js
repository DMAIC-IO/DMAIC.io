// erzeugt von tools/build/build.mjs — nicht von Hand ändern
/** @typedef {import('../../../widgets/widget-props.types.js').WidgetProps} WidgetProps */
/** @type {NonNullable<typeof import('./viewmodel.js').default['__view']>} */ const vm = /** @type {any} */ (null);
/** @type {NonNullable<typeof import('./viewmodel.js').default['__asyncTasks']>} */ const tasks = /** @type {any} */ (null);
/** @type {WidgetProps['histogram-chart']['config']} */ export const b0 = vm.computed.histogramChart(); // resources/view.html:444 x-widget-config
/** @type {WidgetProps['histogram-chart']['legacyEditKey']} */ export const b1 = vm.legacyHistogramKey; // resources/view.html:445 x-widget-legacy-edit-key
/** @type {WidgetProps['pareto-chart']['config']} */ export const b2 = vm.computed.paretoChart(); // resources/view.html:559 x-widget-config
/** @type {WidgetProps['pareto-chart']['legacyEditKey']} */ export const b3 = vm.legacyParetoKey; // resources/view.html:560 x-widget-legacy-edit-key
/** @type {import('../../../core/async-task.js').AsyncTaskDef} */ export const b4 = tasks.toWorksheet; // resources/view.html:405 x-async-task
/** @type {import('../../../core/async-task.js').AsyncTaskDef} */ export const b5 = tasks.toWorksheet; // resources/view.html:525 x-async-task
