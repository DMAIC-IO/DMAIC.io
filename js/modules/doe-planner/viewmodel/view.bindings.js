// erzeugt von tools/build/build.mjs — nicht von Hand ändern
/** @typedef {import('../../../widgets/widget-props.types.js').WidgetProps} WidgetProps */
/** @type {NonNullable<typeof import('./viewmodel.js').default['__view']>} */ const vm = /** @type {any} */ (null);
/** @type {NonNullable<typeof import('./viewmodel.js').default['__asyncTasks']>} */ const tasks = /** @type {any} */ (null);
/** @type {WidgetProps['datagrid']['table']} */ export const b0 = vm.computed.previewTable().table; // resources/view.html:612 x-widget-table
/** @type {WidgetProps['datagrid']['columns']} */ export const b1 = vm.computed.previewTable().columns; // resources/view.html:612 x-widget-columns
/** @type {WidgetProps['datagrid']['rev']} */ export const b2 = vm.computed.previewTable().rev; // resources/view.html:613 x-widget-rev
/** @type {WidgetProps['datagrid']['config']} */ export const b3 = vm.previewConfig; // resources/view.html:613 x-widget-config
/** @type {import('../../../core/async-task.js').AsyncTaskDef} */ export const b4 = tasks.createDatasheet; // resources/view.html:531 x-async-task
/** @type {import('../../../core/async-task.js').AsyncTaskDef} */ export const b5 = tasks.transferToRegression; // resources/view.html:563 x-async-task
/** @type {import('../../../core/async-task.js').AsyncTaskDef} */ export const b6 = tasks.augment; // resources/view.html:582 x-async-task
/** @type {import('../../../core/async-task.js').AsyncTaskDef} */ export const b7 = tasks.createDatasheet; // resources/view.html:597 x-async-task
