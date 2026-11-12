/**
 * D.Mike — Ishikawa: Formulare, deren Form von den Parametern abweicht.
 *
 * Kategorien umbenennen: der Dialog zeigt je Kategorie ein Feld, das
 * Kommando `setCategoryLabels` nimmt alle als ein Objekt `labels`.
 */
import { defineForm, text } from '../../../core/model.js';

export const catRename = defineForm({
  fields: {
    man: text({ trim: true }),
    machine: text({ trim: true }),
    environment: text({ trim: true }),
    material: text({ trim: true }),
    measurement: text({ trim: true }),
    method: text({ trim: true }),
  },
  fromParams({ labels = {} }) {
    return { ...labels };
  },
  toParams(values) {
    return { labels: { ...values } };
  },
});
