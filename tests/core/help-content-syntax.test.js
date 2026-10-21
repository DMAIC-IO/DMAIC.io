/**
 * Hilfetexte sind Inline-Markdown, kein HTML.
 *
 * js/core/help-renderer.js baut jeden String über parseInline() zu Textknoten
 * auf — rohes HTML wird also nie als Auszeichnung interpretiert, sondern
 * wörtlich angezeigt. Der Static-Handbook-Generator escaped ebenfalls.
 * Vier MSA-Hilfetexte waren dennoch mit `<sub>`, `<em>`, `<strong>` und
 * `<code>` geschrieben; Leser sahen dort `b<sub>ij</sub>` im Klartext —
 * 552 Tag-Vorkommen auf 8 Handbuchseiten.
 *
 * Unterstützt sind: **fett**, *kursiv*, $latex$ und {{term:id|label}}.
 */
import { suite, test, assertEqual } from '../test-utils.js';
import MODULE_MANIFEST from '../../js/modules/manifest.js';

/** Alle Strings einer Hilfedefinition mit ihrem Pfad. */
function collectStrings(node, path = [], out = []) {
  if (node == null) return out;
  if (typeof node === 'string') { out.push({ path: path.join('.'), value: node }); return out; }
  if (Array.isArray(node)) { node.forEach((v, i) => collectStrings(v, [...path, i], out)); return out; }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) collectStrings(v, [...path, k], out);
  }
  return out;
}

const HTML_TAG = /<\/?(?:sub|sup|em|strong|code|b|i|u|br|span|div|p|ul|li|table)\b[^>]*>/i;

suite('Hilfetexte: unterstützte Auszeichnung', () => {
  test('kein Hilfetext enthält rohes HTML', async () => {
    const offenders = [];
    for (const entry of MODULE_MANIFEST) {
      let help;
      try {
        help = (await import(`../../js/modules/${entry.id}/${entry.id}-help.js`)).default;
      } catch {
        continue;   // Modul ohne eigenen Hilfetext
      }
      for (const { path, value } of collectStrings(help)) {
        const m = value.match(HTML_TAG);
        if (m) offenders.push(`${entry.id} (${path}): ${m[0]}`);
      }
    }
    assertEqual(offenders.length, 0,
      `Rohes HTML in Hilfetexten — stattdessen **fett**, *kursiv* oder $latex$ verwenden:\n  `
      + offenders.slice(0, 12).join('\n  '));
  });
});

/*
 * js/core/help-renderer.js liest ausschließlich `sections.<id>.<lang>`.
 * distribution-fit und contour-plot lagen im Altformat `{ de: {…}, en: {…} }`
 * vor — die Dateien existierten, das Hilfe-Panel blieb trotzdem leer.
 */
suite('Hilfetexte: Format, das der Renderer liest', () => {
  test('jedes Modul hat Abschnitte mit nicht-leeren DE- und EN-Blöcken', async () => {
    const offenders = [];
    for (const entry of MODULE_MANIFEST) {
      let help;
      try {
        help = (await import(`../../js/modules/${entry.id}/${entry.id}-help.js`)).default;
      } catch {
        offenders.push(`${entry.id}: keine Hilfedatei`);
        continue;
      }
      const sections = Object.entries(help?.sections ?? {});
      if (!sections.length) { offenders.push(`${entry.id}: keine sections`); continue; }
      for (const [key, section] of sections) {
        for (const lang of ['de', 'en']) {
          if (!section?.[lang]?.blocks?.length) offenders.push(`${entry.id}.${key}.${lang}: keine Blöcke`);
        }
      }
    }
    assertEqual(offenders.length, 0, `Hilfe fehlt oder ist unlesbar:\n  ${offenders.slice(0, 12).join('\n  ')}`);
  });
});
