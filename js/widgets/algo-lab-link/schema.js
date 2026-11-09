/** Knopf zum Algorithm Lab: öffnet die Dokumentation eines Algorithmus. */
import { defineWidget, text } from '../../core/model.js';

export default defineWidget({
  name: 'algo-lab-link',
  props: { algoId: text({ nullable: true }) },
});
