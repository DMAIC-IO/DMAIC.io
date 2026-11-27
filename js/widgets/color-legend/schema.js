/** Farblegende zu einem Heat-/Konturbild: Titel und Stufen (Farbe, Wert), fertig formatiert. */
import { defineWidget, list, object, text } from '../../core/model.js';

export default defineWidget({
  name: 'color-legend',
  props: {
    legend: object({
      title: text(),
      helpKey: text({ optional: true }),
      items: list(object({ color: text(), value: text() })),
    }, { nullable: true }),
  },
});
