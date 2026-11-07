/** Datensatz-Picker: Bedienelement der Feldart `datasets`. */
import { defineWidget, datasets } from '../../core/model.js';

export default defineWidget({ name: 'dataset-picker', value: datasets({}), forKind: 'datasets' });
