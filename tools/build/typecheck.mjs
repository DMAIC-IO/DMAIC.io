/**
 * D.Mike — Typprüfung (typecheck.mjs)
 *
 * `tsc --checkJs --noEmit` über die umgestellten Module, über die
 * TypeScript-Programm-API statt CLI und ohne tsconfig.json:
 * gemeldet werden NUR Befunde in den geprüften Dateien. Fehler in
 * importiertem, noch nicht umgestelltem Kerncode zählen nicht — sonst wäre
 * die Prüfung vom ersten Tag an rot.
 *
 * Geprüft: TYPED_CORE und jede .js-Datei der Module in CONVERTED_MODULES.
 * Aufruf: `npm run typecheck` (dlvr-Werkzeug `tsc`, Stage 1-commit). Läuft
 * bewusst NICHT unter test:build.
 */
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { CONVERTED_MODULES } from './converted-modules.mjs';
import { listModuleFiles } from './module-gates.mjs';

/** Kerndateien, die immer geprüft werden. */
export const TYPED_CORE = Object.freeze(['js/core/model.js', 'js/core/validate.js', 'js/core/module-descriptor.js']);

const OPTIONS = {
  allowJs: true,
  checkJs: true,
  noEmit: true,
  strict: false,
  target: ts.ScriptTarget.ES2022,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  skipLibCheck: true,
  types: [],
};

/**
 * Die zu prüfenden Dateien, absolut.
 * @param {string} appDir @param {readonly string[]} [converted]
 * @returns {string[]}
 */
export function typecheckFiles(appDir, converted = CONVERTED_MODULES) {
  const mods = converted.flatMap((id) => listModuleFiles(appDir, id)
    .filter((p) => p.endsWith('.js'))
    .map((p) => join(appDir, 'js', 'modules', id, p)));
  const props = join(appDir, 'js', 'widgets', 'widget-props.types.js');
  return [...TYPED_CORE.map((f) => join(appDir, f)), ...(existsSync(props) ? [props] : []), ...mods];
}

/**
 * Typbefunde, nur für `files`.
 * @param {string[]} files absolute Pfade
 * @param {object} [extraOptions] zusätzliche Compiler-Optionen (Tests)
 * @returns {string[]} `<pfad>(<zeile>,<spalte>): TS<code>: <text>`
 */
export function typecheck(files, extraOptions = {}) {
  const wanted = new Set(files.map((f) => resolve(f)));
  const program = ts.createProgram(files, { ...OPTIONS, ...extraOptions });
  return ts.getPreEmitDiagnostics(program)
    .filter((d) => !d.file || wanted.has(resolve(d.file.fileName)))
    .map((d) => {
      if (!d.file) return `typecheck: TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`;
      const { line, character } = d.file.getLineAndCharacterOfPosition(d.start ?? 0);
      const text = ts.flattenDiagnosticMessageText(d.messageText, ' ');
      return `${relative(process.cwd(), d.file.fileName)}(${line + 1},${character + 1}): TS${d.code}: ${text}`;
    });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const appDir = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
  const files = typecheckFiles(appDir);
  const findings = typecheck(files);
  for (const f of findings) console.error(f);
  console.log(`typecheck: ${files.length} Dateien, ${findings.length} Befunde`);
  process.exit(findings.length > 0 ? 1 : 0);
}
