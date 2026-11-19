/** Diagramm-Widget `node-diagram`: Kästen, Pfeile und Beschriftungen; ohne Bedienleiste. */
import widget from './schema.js';
import { chartMount } from '../chart-mount.js';

/** @param {any} c geprüfte Konfiguration @returns {any} Form des Typs */
export const toChart = (c) => ({ ...c, showModebar: false });

export const mount = chartMount(widget, toChart);
