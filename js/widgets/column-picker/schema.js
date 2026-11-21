/** Spalten-Picker: Bedienelement für `columnRef` und `list(columnRef)`. */
import { defineWidget, columnRef, list } from '../../core/model.js';

export default defineWidget({
  name: 'column-picker',
  props: {
    exclude: list(columnRef({ nullable: false }), { optional: true, nullable: true }),
    sameSheetAs: columnRef({ optional: true }),
  },
  value: columnRef(),
  forKind: 'columnRef',
});
