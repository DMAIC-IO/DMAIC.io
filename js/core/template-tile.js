/**
 * D.Mike — Dashboard-Kachel in der Form des Moduls (template-tile.js)
 *
 * `createTile({ descriptor, Model, Settings, view, size, titlePrefix })`
 * liefert ein Objekt im Kachel-Vertrag des Dashboards (template, settings,
 * viewModel, size, titlePrefix oder titlePrefixKey (i18n-Schlüssel), kind, titleKey;
 * `template` nennt die Datei unter resources/ (Vorgabe tile.html), `kind` die Art bei mehreren Kacheln je Modul; enumerate/refreshOn/mount/dispose werden
 * durchgereicht). `viewModel(args)` baut je Rendern einen Scope: einen
 * eingefrorenen Schnappschuss des Models (`readModel`), die geprüften
 * Einstellungen (`readSettings`), `t` mit dem Präfix `modules.<id>` und die
 * Glieder aus `view(ctx)`. Je `derived` des Models ein Getter auf dem Scope
 * (je Rendern höchstens einmal ausgewertet, ein Fehler als `{ error }`).
 * `ctx.source` liest fremde Instanzen (`core/source.js`), `x-widget`
 * zeichnet über den Kachel-`chartManager` (`_ui.services`).
 * Die Marke `_templateTile` sagt dem Host
 * (pages/dashboard/tile-render.js), dass der Scope selbst gebunden wird.
 *
 * Importiert weder Alpine noch template-module.js — sonst zöge das
 * Dashboard den Modul-Chunk mit.
 */
import { readModel, readSettings, isSettings, defaultOf, activeContext, schemaOf } from './model.js';
import { derivedReader } from './derived.js';
import { deferredSource, NO_SOURCE } from './source-reader.js';

/**
 * Was `view(ctx)` einer Kachel bekommt. `source` liest fremde Instanzen
 * (derselbe Leser wie in den Gettern der `derived`; der Host baut bei
 * `refreshOn` neu auf). Wirft `source.read` `not_loaded`, stößt die Kachel
 * `source.ensureLoaded(instanceId)` an, ohne zu warten, und zeichnet, was sie
 * hat; im Dashboard zeichnet der Host sie nach dem Laden neu.
 * @typedef {{ i18n: any, theme: string|undefined, instanceId: string|null, moduleId: string,
 *   source: import('./source-reader.js').Source }} TileContext
 */
/**
 * `this` in den Gliedern eines Kachel-`view`-Blocks.
 * @template M, T
 * @typedef {{ model: M, settings: T, t: (key: string, params?: object) => string }} TileThis
 */
/**
 * Der `view`-Block einer Kachel.
 * @template M, T
 * @typedef {(ctx: TileContext) => Record<string, any> & ThisType<Record<string, any> & TileThis<M, T>>} TileViewFn
 */

/** Name der Marke am Scope einer Kachel in dieser Form. */
export const TEMPLATE_TILE = '_templateTile';

/** Schlüssel, die der Kern selbst auf den Scope legt; kein `derived` darf so heißen. */
const SCOPE_KEYS = ['model', 'settings', 't', 'moduleId', TEMPLATE_TILE, '_ui'];

/** Hooks des alten Vertrags, die unverändert durchgehen. */
const PASS_THROUGH = ['enumerate', 'refreshOn', 'mount', 'dispose'];

/**
 * Der Leser einer Kachel: `args.source` (Dashboard), sonst über den
 * `stateManager` (`createSource`, erst beim ersten Lesen), ohne beides ein
 * Leser ohne Arbeitsblätter (`read` wirft `not_loaded`, `list` ist leer).
 * @param {{ source?: import('./source-reader.js').Source, stateManager?: any }} args
 * @returns {import('./source-reader.js').Source}
 */
function sourceOf(args) {
  if (args.source) return args.source;
  return args.stateManager ? deferredSource(args.stateManager) : NO_SOURCE;
}

/**
 * Ein Feld aus `defineSettings` als Feld des Einstellungsdialogs.
 * @param {string} id @param {string} name @param {any} s
 * @returns {object}
 */
function settingsField(id, name, s) {
  const base = `modules.${id}.tile.settings.${name}`;
  const label = [`${base}.label`, `dashboard.tileSettings.${name}`];
  const helpKey = `${base}.help`;
  const def = defaultOf(s);
  if (s.kind === 'number') {
    return { type: 'number', min: s.min, max: s.max, ...(s.integer === true ? { step: 1 } : {}), default: def, label, helpKey };
  }
  if (s.kind === 'oneOf') {
    return {
      type: 'select',
      options: [...s.values],
      optionLabels: Object.fromEntries(s.values.map((v) => [v, `${base}.options.${v}`])),
      default: def, label, helpKey,
    };
  }
  return { type: 'boolean', default: def, label, helpKey };
}

/**
 * Die Felder des Einstellungsdialogs zu einem Schema aus `defineSettings`.
 * @param {string} id Modul-Id
 * @param {{ schema: { fields: Record<string, object> } }} Settings
 * @returns {Record<string, object>}
 */
export function tileSettingsOf(id, Settings) {
  return Object.fromEntries(Object.entries(Settings.schema.fields).map(([name, s]) => [name, settingsField(id, name, s)]));
}

/**
 * Eine Kachel in der Form des Moduls.
 * @template V
 * @param {{ descriptor: { id: string }, Model: any, Settings?: any, view?: (ctx: TileContext) => V,
 *   size?: object, titlePrefix?: string, titlePrefixKey?: string, kind?: string, titleKey?: string, template?: string, enumerate?: Function, refreshOn?: any,
 *   mount?: Function, dispose?: Function }} base
 * @returns {Record<string, any> & { readonly __view?: V }} Objekt im Kachel-Vertrag des Dashboards
 */
export function createTile(base) {
  const { descriptor, Model, Settings, view, size, titlePrefix, titlePrefixKey, kind, titleKey, template } = base;
  if (!descriptor?.id) throw new Error('createTile: descriptor with id required');
  const id = descriptor.id;
  if (!Model) throw new Error(`createTile(${id}): Model required`);
  if (Settings !== undefined && !isSettings(Settings)) throw new Error(`createTile(${id}): Settings must come from defineSettings`);
  if (view !== undefined && typeof view !== 'function') throw new Error(`createTile(${id}): view must be a function`);
  const prefix = `modules.${id}`;
  const derived = Object.keys(schemaOf(Model)?.derived ?? {});
  for (const name of derived) {
    if (SCOPE_KEYS.includes(name)) throw new Error(`createTile(${id}): ${name} collides with derived`);
  }

  /** @type {Record<string, any>} */
  const tile = {
    template: `js/modules/${id}/resources/${template ?? 'tile.html'}`,
    /**
     * Scope der Kachel für dieses Rendern.
     * @param {{ state: unknown, settings: unknown, i18n: any, theme?: string, instanceId?: string|null, source?: import('./source-reader.js').Source, chartManager?: object, stateManager?: { getProjectCycle?: () => string } }} args
     * @returns {object}
     */
    viewModel(args) {
      const { i18n } = args;
      const model = readModel(Model, args.state, activeContext(args.stateManager));
      const scope = {
        model: Object.freeze(model),
        settings: Object.freeze(Settings ? readSettings(Settings, args.settings) : {}),
        t: typeof i18n.tf === 'function' ? i18n.tf(prefix) : (key, params) => i18n.t(`${prefix}.${key}`, params),
      };
      Object.defineProperty(scope, 'moduleId', { value: id, enumerable: true });
      Object.defineProperty(scope, TEMPLATE_TILE, { value: true });
      // Griff für x-widget (core/widget-directive.js): die Dienste, darunter der Kachel-chartManager des Hosts.
      Object.defineProperty(scope, '_ui', { value: Object.freeze({
        services: Object.freeze({
          eventBus: null, stateManager: args.stateManager ?? null, i18n, chartManager: args.chartManager ?? null,
          instanceId: args.instanceId ?? null, moduleId: id,
        }),
      }) });
      const source = sourceOf(args);
      // Ein Getter je derived; ein Memo je Rendern für alle Namen (der Scope ist ein Schnappschuss):
      // jeder Eintrag läuft höchstens einmal, auch wenn mehrere andere ihn lesen, und nur, wenn gelesen.
      let read = null;
      for (const name of derived) {
        Object.defineProperty(scope, name, {
          enumerable: true,
          get() {
            read ??= derivedReader(model, source, scope.t);
            try { return read(name); } catch (err) { return { error: /** @type {Error} */ (err).message }; }
          },
        });
      }
      const members = view ? view({ i18n, theme: args.theme, instanceId: args.instanceId ?? null, moduleId: id, source }) : {};
      for (const name of Object.getOwnPropertyNames(members)) {
        if (derived.includes(name)) throw new Error(`createTile(${id}): ${name} collides with derived`);
      }
      return Object.defineProperties(scope, Object.getOwnPropertyDescriptors(members));
    },
  };
  if (size !== undefined) tile.size = size;
  if (titlePrefix !== undefined) tile.titlePrefix = titlePrefix;
  if (titlePrefixKey !== undefined) tile.titlePrefixKey = titlePrefixKey;
  if (kind !== undefined) tile.kind = kind;
  if (titleKey !== undefined) tile.titleKey = titleKey;
  if (Settings) tile.settings = tileSettingsOf(id, Settings);
  for (const key of PASS_THROUGH) if (base[key] !== undefined) tile[key] = base[key];
  return tile;
}
