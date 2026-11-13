/** Diagramm-Widget `node-links`: Einhänger; Knoten und Bedienleiste gibt es nicht. */
import widget from './schema.js';
import { chartMount } from '../chart-mount.js';

/** @param {any} c geprüfte Konfiguration @returns {any} Form des Typs */
export const toChart = (c) => ({ ...c, nodes: [], showModebar: false });

export const mount = chartMount(widget, toChart);
