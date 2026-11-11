/**
 * D.Mike — Datenimport: Model.
 *
 * Gespeichert werden die Beschreibung der gewählten Quelle, die Parser-Optionen
 * je Format und das aktive Blatt. Rohdaten und Parse-Ergebnis leben im Viewmodel.
 */
import { defineModel, command, number, boolean, text, oneOf, object } from '../../../core/model.js';
import { from0 } from './migrations.js';

/** Profile für CSV-Exporte von Messmaschinen; Schlüssel wie `options.csv.preset`. */
const PRESETS = {
  generic:               { delimiter: 'auto',      encoding: 'utf-8',        skipRows: 0, hasHeader: true },
  'zeiss-calypso':       { delimiter: 'semicolon', encoding: 'windows-1252', skipRows: 4, hasHeader: true },
  'hexagon-pcdmis':      { delimiter: 'comma',     encoding: 'utf-8',        skipRows: 4, hasHeader: true },
  'mitutoyo-measurlink': { delimiter: 'comma',     encoding: 'utf-8',        skipRows: 0, hasHeader: true },
};

/** Formate, die als Text (ohne Datei) eingelesen werden können. */
const TEXT_FORMATS = ['csv', 'json', 'aqdef'];

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    file: object({
      name: text(),
      size: number({ integer: true, min: 0 }),
      formatId: oneOf(['mpx', 'csv', 'xlsx', 'json', 'aqdef'], { nullable: true }),
      source: oneOf(['file', 'text'], { default: 'file' }),
    }, { nullable: true }),
    options: object({
      csv: object({
        preset: oneOf(['generic', 'zeiss-calypso', 'hexagon-pcdmis', 'mitutoyo-measurlink'], { default: 'generic' }),
        delimiter: oneOf(['auto', 'comma', 'semicolon', 'tab', 'pipe'], { default: 'auto' }),
        encoding: oneOf(['utf-8', 'windows-1252', 'iso-8859-1'], { default: 'utf-8' }),
        hasHeader: boolean({ default: true }),
        skipRows: number({ integer: true, min: 0, default: 0 }),
      }),
      xlsx: object({ hasHeader: boolean({ default: true }) }),
      aqdef: object({ encoding: oneOf(['windows-1252', 'iso-8859-1', 'utf-8'], { default: 'windows-1252' }) }),
    }),
    activeSheet: number({ integer: true, min: 0, default: 0 }),
  },
  derived: {
    /**
     * Beschreibbare Optionspfade des Formats der gewählten Quelle. Bei einer
     * Textquelle fehlt die Kodierung; ohne Datei oder bei JSON/MPX ist die Liste leer.
     *
     * @this {any}
     * @returns {string[]}
     */
    activeParams() {
      const f = this.file;
      if (!f) return [];
      if (f.formatId === 'csv') {
        const keys = ['preset', 'delimiter', 'encoding', 'hasHeader', 'skipRows'];
        return keys.filter((k) => !(f.source === 'text' && k === 'encoding')).map((k) => `options.csv.${k}`);
      }
      if (f.formatId === 'xlsx') return ['options.xlsx.hasHeader'];
      if (f.formatId === 'aqdef') return ['options.aqdef.encoding'];
      return [];
    },
    /**
     * Formate, die `importText` annimmt.
     *
     * @returns {string[]}
     */
    textFormats() { return [...TEXT_FORMATS]; },
  },
  commands: {
    applyPreset: command({
      params: { preset: oneOf(['generic', 'zeiss-calypso', 'hexagon-pcdmis', 'mitutoyo-measurlink']) },
      run({ preset }) {
        this.options.csv = { ...this.options.csv, ...PRESETS[preset], preset };
      },
    }),
  },
});
