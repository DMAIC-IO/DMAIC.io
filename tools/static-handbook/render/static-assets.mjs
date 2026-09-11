/**
 * Die statischen Assets des Handbuchs — eine Liste, ein Kopiervorgang.
 *
 * Bewusst getrennt von build.mjs: dort ruft main() beim Import unbedingt den
 * kompletten Generatorlauf aus, das Modul ist also nicht importierbar und
 * damit nicht testbar. Wer ein Asset ergänzt, ergänzt es hier — der Test
 * daneben prüft, dass es im Ausgabeordner ankommt.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);

/** @type {Array<{src: string, dest: string}>} src absolut, dest relativ zum Ausgabeordner. */
export const STATIC_ASSETS = [
  { src: path.join(HERE, 'handbook.css'),           dest: 'assets/handbook.css' },
  { src: path.join(HERE, 'assets/logo.svg'),        dest: 'assets/logo.svg' },
  { src: path.join(HERE, 'assets/ribbon-foot.svg'), dest: 'assets/ribbon-foot.svg' },
  { src: path.join(HERE, 'assets/favicon.svg'),     dest: 'assets/favicon.svg' },
  { src: path.join(HERE, 'assets/nav-drawer.js'),   dest: 'assets/nav-drawer.js' },
];

/**
 * Alle statischen Assets in den Ausgabeordner kopieren.
 * @param {string} outDir Wurzel des Handbuch-Ausgabeordners
 * @returns {Promise<void>}
 */
export async function copyStaticAssets(outDir) {
  await mkdir(path.join(outDir, 'assets'), { recursive: true });
  for (const asset of STATIC_ASSETS) {
    await copyFile(asset.src, path.join(outDir, asset.dest));
  }
}
