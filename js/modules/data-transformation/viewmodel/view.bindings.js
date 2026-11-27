// erzeugt von tools/build/build.mjs — nicht von Hand ändern
/** @typedef {import('../../../widgets/widget-props.types.js').WidgetProps} WidgetProps */
/** @type {NonNullable<typeof import('./viewmodel.js').default['__view']>} */ const vm = /** @type {any} */ (null);
/** @type {NonNullable<typeof import('./viewmodel.js').default['__asyncTasks']>} */ const tasks = /** @type {any} */ (null);
/** @type {WidgetProps['histogram-chart']['config']} */ export const b0 = vm.computed.histOrigChart(); // resources/view.html:127 x-widget-config
/** @type {WidgetProps['histogram-chart']['legacyEditKey']} */ export const b1 = vm.legacyHistOrigKey; // resources/view.html:128 x-widget-legacy-edit-key
/** @type {WidgetProps['histogram-chart']['config']} */ export const b2 = vm.computed.histTransChart(); // resources/view.html:132 x-widget-config
/** @type {WidgetProps['histogram-chart']['legacyEditKey']} */ export const b3 = vm.legacyHistTransKey; // resources/view.html:133 x-widget-legacy-edit-key
/** @type {WidgetProps['probability-plot-chart']['config']} */ export const b4 = vm.computed.ppOrigChart(); // resources/view.html:137 x-widget-config
/** @type {WidgetProps['probability-plot-chart']['legacyEditKey']} */ export const b5 = vm.legacyPpOrigKey; // resources/view.html:138 x-widget-legacy-edit-key
/** @type {WidgetProps['probability-plot-chart']['config']} */ export const b6 = vm.computed.ppTransChart(); // resources/view.html:142 x-widget-config
/** @type {WidgetProps['probability-plot-chart']['legacyEditKey']} */ export const b7 = vm.legacyPpTransKey; // resources/view.html:143 x-widget-legacy-edit-key
/** @type {import('../../../core/async-task.js').AsyncTaskDef} */ export const b8 = tasks.analysis; // resources/view.html:114 x-async-task
/** @type {import('../../../core/async-task.js').AsyncTaskDef} */ export const b9 = tasks.toWorksheet; // resources/view.html:186 x-async-task
