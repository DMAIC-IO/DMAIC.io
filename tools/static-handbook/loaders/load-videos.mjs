/**
 * Lädt den Videospiegel `videos/index.json`.
 *
 * Fehlt die Datei, ist das **kein Fehler**: sie entsteht erst, wenn das erste
 * Video gerendert wurde, und ein Handbuch ohne Videos ist ein gültiges
 * Handbuch. Dasselbe Verhalten hat `loadExamples` in `load-sources.mjs`.
 *
 * Eine Datei, die da ist, muss dagegen die erwartete Form haben: ein kaputter
 * oder veralteter Spiegel wird gemeldet und nicht zu „keine Videos" geglättet
 * — sonst baut das Handbuch still ohne die Videoabschnitte durch.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseMirror } from '../../../js/core/videos-registry.js';

/**
 * @param {string} repoRoot
 * @returns {Promise<{ entries: object[] }>}
 */
export async function loadVideos(repoRoot) {
  const file = path.join(repoRoot, 'videos/index.json');
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    if (err?.code === 'ENOENT') return { entries: [] };
    throw err;
  }
  return { entries: parseMirror(JSON.parse(text)) };
}
