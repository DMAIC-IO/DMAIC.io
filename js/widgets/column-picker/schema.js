/** Spalten-Picker: Bedienelement für `columnRef` und `list(columnRef)`. */
import { defineWidget, columnRef } from '../../core/model.js';

export default defineWidget({ name: 'column-picker', value: columnRef(), forKind: 'columnRef' });
