/**
 * Prism bundled from node_modules with the two grammars the Algorithm Lab
 * highlights (JavaScript + Python). `manual:true` stops Prism from
 * auto-highlighting the document on load — the Lab tokenizes explicitly.
 */
import Prism from 'prismjs';
Prism.manual = true;
import 'prismjs/components/prism-javascript.js';
import 'prismjs/components/prism-python.js';
export { Prism };
