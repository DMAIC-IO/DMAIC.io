/** Rich-Text-Editor: Bedienelement für `richText()` (Fett, Kursiv, Zeilenumbruch als Markdown). */
import { defineWidget, richText } from '../../core/model.js';

export default defineWidget({ name: 'rich-text', value: richText(), forKind: 'richText' });
