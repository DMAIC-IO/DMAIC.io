/**
 * D.Mike — Modulbeschreibung (module-descriptor.js)
 *
 * Der Vertrag von `js/modules/<id>/module.js` (Spec 2026-11-03 §5) — nur
 * Kommentare, kein Laufzeitcode. Jede `module.js` trägt
 * `@type {import('../../core/module-descriptor.js').ModuleDescriptor}`;
 * `tools/build/typecheck.mjs` prüft sie dagegen, `tools/build/module-gates.mjs`
 * prüft Form und Verweise.
 *
 * Hilfe, Referenzen, i18n, Beispiele, CSS und Template sind KEINE Felder: sie
 * liegen an festen Pfaden unter `resources/`.
 */

/**
 * @typedef {object} ModuleDescriptor
 * @property {string} id  = Ordnername unter `js/modules/`
 * @property {string} version  `x.y.z`
 * @property {string} icon  Name aus `assets/icons/icon-map.json`
 * @property {string} [phase]  Platzierung wie heute im Manifest (`'data'` = zyklusunabhängig)
 * @property {string} [group]  Abschnitt im Phasenmenü (`dataGroups.<group>`)
 * @property {Record<string, { phase: string, allowedPhases?: string[] }>} [cycles]  Phase je Zyklus
 * @property {string[]} [allowedPhases]  Altlast neben `cycles`, unverändert übernommen
 * @property {boolean} [singleton]  höchstens eine Instanz je Projekt
 * @property {boolean} [hiddenFromMenu]  nicht im Phasenmenü
 * @property {string[]} [uses]  weiche Abhängigkeiten: nur Vorladen und Build-Prüfung (D15)
 * @property {string[]} [exampleRefs]  Beispiele anderer Module (D16)
 * @property {() => Promise<{ default: object }>} load  `() => import('./viewmodel/viewmodel.js')`
 * @property {() => Promise<{ default: object }>} [tile]  `() => import('./tile/tile.js')`
 */

export {};
