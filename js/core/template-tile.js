/**
 * D.Mike — Dashboard-Kachel in der Form des Moduls (template-tile.js)
 *
 * `createTile({ descriptor, Model, Settings, view, size, titlePrefix })`
 * liefert ein Objekt im Kachel-Vertrag des Dashboards (template, settings,
 * viewModel, size, titlePrefix; enumerate/refreshOn/mount/dispose werden
 * durchgereicht). `viewModel(args)` baut je Rendern einen Scope: einen
 * eingefrorenen Schnappschuss des Models (`readModel`), die geprüften
 * Einstellungen (`readSettings`), `t` mit dem Präfix `modules.<id>` und die
 * Glieder aus `view(ctx)`. Die Marke `_templateTile` sagt dem Host
 * (pages/dashboard/tile-render.js), dass der Scope selbst gebunden wird.
 *
 * Importiert weder Alpine noch template-module.js — sonst zöge das
 * Dashboard den Modul-Chunk mit.
 */
import { readModel, readSettings, isSettings, defaultOf } from './model.js';

/**
 * Was `view(ctx)` einer Kachel bekommt.
 * @typedef {{ i18n: any, theme: string|undefined, instanceId: string|null, moduleId: string }} TileContext
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

/** Hooks des alten Vertrags, die unverändert durchgehen. */
const PASS_THROUGH = ['enumerate', 'refreshOn', 'mount', 'dispose'];

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
 * @param {{ descriptor: { id: string }, Model: any, Settings?: any, view?: (ctx: TileContext) => object,
 *   size?: object, titlePrefix?: string, enumerate?: Function, refreshOn?: any,
 *   mount?: Function, dispose?: Function }} base
 * @returns {Record<string, any>} Objekt im Kachel-Vertrag des Dashboards
 */
export function createTile(base) {
  const { descriptor, Model, Settings, view, size, titlePrefix } = base;
  if (!descriptor?.id) throw new Error('createTile: descriptor with id required');
  const id = descriptor.id;
  if (!Model) throw new Error(`createTile(${id}): Model required`);
  if (Settings !== undefined && !isSettings(Settings)) throw new Error(`createTile(${id}): Settings must come from defineSettings`);
  if (view !== undefined && typeof view !== 'function') throw new Error(`createTile(${id}): view must be a function`);
  const prefix = `modules.${id}`;

  /** @type {Record<string, any>} */
  const tile = {
    template: `js/modules/${id}/resources/tile.html`,
    /**
     * Scope der Kachel für dieses Rendern.
     * @param {{ state: unknown, settings: unknown, i18n: any, theme?: string, instanceId?: string|null }} args
     * @returns {object}
     */
    viewModel(args) {
      const { i18n } = args;
      const scope = {
        model: Object.freeze(readModel(Model, args.state)),
        settings: Object.freeze(Settings ? readSettings(Settings, args.settings) : {}),
        t: typeof i18n.tf === 'function' ? i18n.tf(prefix) : (key, params) => i18n.t(`${prefix}.${key}`, params),
      };
      Object.defineProperty(scope, TEMPLATE_TILE, { value: true });
      const members = view ? view({ i18n, theme: args.theme, instanceId: args.instanceId ?? null, moduleId: id }) : {};
      return Object.defineProperties(scope, Object.getOwnPropertyDescriptors(members));
    },
  };
  if (size !== undefined) tile.size = size;
  if (titlePrefix !== undefined) tile.titlePrefix = titlePrefix;
  if (Settings) tile.settings = tileSettingsOf(id, Settings);
  for (const key of PASS_THROUGH) if (base[key] !== undefined) tile[key] = base[key];
  return tile;
}
