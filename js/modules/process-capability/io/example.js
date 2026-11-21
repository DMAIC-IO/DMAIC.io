/**
 * D.Mike — Process Capability: Beispielform. Rein.
 *
 * Die Beispiele des Katalogs liefern eine CSV-Form (`columns[0].values`) und
 * `meta.spec`. Die Werte werden eingebettet; was das Beispiel nicht nennt,
 * nehmen die Vorgaben des Models.
 */
import { State } from '../domain/model.js';

/**
 * Beispiel in die Form des Models übersetzen.
 * @param {Record<string, any>} data Beispielinhalt (CSV- oder Generatorform)
 * @param {Record<string, any>} meta Katalogeintrag (`title`, `spec`, `columns`, `id`)
 * @param {{ lang?: string }} [helpers] `lang`: aktive Sprache für den Titel
 * @returns {Record<string, any>}
 */
export function fromExample(data, meta, { lang = 'en' } = {}) {
  const col = data?.columns?.[0];
  const values = Array.isArray(col?.values)
    ? col.values.filter((v) => typeof v === 'number' && Number.isFinite(v)) : [];
  if (values.length === 0) throw new Error('no numeric values');
  const title = meta?.title;
  const label = title?.[lang] || title?.en || meta?.id || '';
  const spec = meta?.spec || {};
  /** @type {Record<string, any>} */
  const params = {};
  if (typeof spec.lsl === 'number') params.lsl = spec.lsl;
  if (typeof spec.usl === 'number') params.usl = spec.usl;
  if (typeof spec.target === 'number') params.target = spec.target;
  if (title) params.name = label;
  const unit = col.unit || meta?.columns?.[0]?.unit;
  if (unit) params.unit = unit;
  const base = new State().toJSON();
  return {
    ...base,
    params: { ...base.params, ...params },
    embeddedValues: values,
    embeddedLabel: label,
  };
}
