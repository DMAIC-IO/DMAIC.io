// ERZEUGT von tools/build/catalog.mjs — nicht von Hand ändern.
import legacy from './manifest.js';
import { fromDescriptor } from '../core/module-catalog.js';

/** Ids der Module in der neuen Form (module.js), sortiert. */
export const CONVERTED = Object.freeze([]);

/** Alle Registry-Einträge: alte Form aus manifest.js, neue aus module.js. */
export const MODULES = Object.freeze([...legacy, ...[].map(fromDescriptor)]);
