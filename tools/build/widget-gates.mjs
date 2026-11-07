/**
 * Gates für `x-widget` (tools/build/widget-gates.mjs)
 *
 * Wie `module-gates.mjs` ein Regex-Scan der Templates: Befunde sind Strings
 * `template: <pfad>: <attr="wert">: <text>` ohne Zeile. Geprüft werden das
 * registrierte Widget, erklärte und gebundene Eingaben, `x-widget-value` nur
 * bei Widgets mit Wert, Feldart gegen Feldart bei `model.`/`state.` und
 * Getter/`computed` des view-Blocks bei allen übrigen Namen.
 */
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { viewNamesDetailOf } from './module-gates.mjs';
import { renderBindingCheck } from './model-types.mjs';

/** Ein Treffer = ein Wirts-Tag mit `x-widget`; das Tag trägt die Eingaben. */
export const WIDGET_TAG = /<[^>]*\bx-widget\s*=\s*"([^"]*)"[^>]*>/g;
const ATTR = /\bx-widget-([a-z][a-z0-9-]*)\s*=\s*"([^"]*)"/g;
const X_FOR = /\bx-for\s*=\s*"\s*\(?\s*([A-Za-z_$][\w$]*)/g;
const camel = (k) => k.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const kebab = (c) => c.replace(/[A-Z]/g, (x) => `-${x.toLowerCase()}`);

/**
 * Gleiche Feldart (Listen rekursiv über `item`, Objekte nur über `kind`).
 * @param {object} a @param {object} b @returns {boolean}
 */
export function sameKind(a, b) {
  if (a.kind !== b.kind) return false;
  return a.kind === 'list' ? sameKind(a.item, b.item) : true;
}

/** @param {object} s @returns {string} */
const kindName = (s) => (s.kind === 'list' ? `list(${kindName(s.item)})` : s.kind);

/**
 * Alle Widget-Schemas unter js/widgets/<name>/schema.js; ohne den Ordner leer.
 * @param {string} appDir Wurzel von app/dev
 * @returns {Promise<Map<string, any>>}
 */
export async function loadWidgetSchemas(appDir) {
  const dir = join(appDir, 'js', 'widgets');
  const out = new Map();
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    const file = join(dir, name, 'schema.js');
    if (!existsSync(file)) throw new Error(`widgets/${name}: schema.js fehlt`);
    const w = (await import(pathToFileURL(file).href)).default;
    if (w?.name !== name) throw new Error(`widgets/${name}/schema.js: name ${JSON.stringify(w?.name)} ≠ Ordner`);
    out.set(name, w);
  }
  return out;
}

/**
 * Gate x-widget.
 * @param {{ path: string, text: string }[]} templates
 * @param {{ widgets: Map<string, any>, schema: { fields: object, view: object }|null, stateSchema: { fields: object }|null, viewNames: Set<string> }} ctx
 * @returns {string[]}
 */
export function checkWidgetBindings(templates, { widgets, schema, stateSchema, viewNames }) {
  const out = [];
  for (const { path, text } of templates) {
    const aliases = new Set([...text.matchAll(X_FOR)].map((m) => m[1]));
    for (const tag of text.matchAll(WIDGET_TAG)) {
      const name = tag[1].trim();
      const P = `template: ${path}:`;
      const w = widgets.get(name);
      if (!w) { out.push(`${P} x-widget="${name}": unbekanntes Widget`); continue; }
      const bound = new Map([...tag[0].matchAll(ATTR)].map((m) => [m[1], m[2].trim()]));
      for (const [attr, p] of bound) {
        const shown = `x-widget-${attr}="${p}"`;
        let spec;
        if (attr === 'value') {
          if (!w.value) { out.push(`${P} ${shown}: ${name} hat keinen Wert`); continue; }
          spec = w.value;
        } else {
          spec = w.props[camel(attr)];
          if (!spec) { out.push(`${P} ${shown}: ${name} hat keine Eingabe ${camel(attr)}`); continue; }
        }
        out.push(...checkPath(P, shown, p, spec, { schema, stateSchema, viewNames, aliases }));
      }
      for (const [prop, s] of Object.entries(w.props)) {
        if (s.optional !== true && !bound.has(kebab(prop))) out.push(`${P} x-widget="${name}": Pflicht-Eingabe x-widget-${kebab(prop)} fehlt`);
      }
    }
  }
  return out;
}

/** @returns {string[]} */
function checkPath(P, shown, path, spec, { schema, stateSchema, viewNames, aliases }) {
  const parts = path.split('.');
  const [head, field] = parts;
  if (head === 'model' || head === 'state') {
    const all = head === 'model' ? { ...(schema?.fields ?? {}), ...(schema?.view ?? {}) } : (stateSchema?.fields ?? {});
    const s = all[field];
    if (!s) return [`${P} ${shown}: ${field} ist weder Feld noch Ansichtsfeld`];
    if (parts.length === 2 && !sameKind(s, spec)) return [`${P} ${shown}: Feldart ${kindName(s)} passt nicht zu ${kindName(spec)}`];
    return [];
  }
  if (head === 'props' || aliases.has(head) || viewNames.has(head)) return [];
  return [`${P} ${shown}: ${head} ist weder Getter noch computed des view-Blocks`];
}

/**
 * Bindungen von `x-widget-*` auf Getter/`computed` der obersten Ebene eines
 * Templates, für die Prüfdatei (Zeile = Zeile des Attributs im Template).
 * @param {{ path: string, text: string }[]} templates
 * @param {{ getters: string[], computed: string[], data: string[] }} names
 * @returns {{ widget: string, prop: string, path: string, computed: boolean, where: string }[]}
 */
export function collectBindings(templates, names) {
  const known = new Set([...names.getters, ...names.computed, ...names.data]);
  const computed = new Set(names.computed);
  const out = [];
  for (const { path, text } of templates) {
    const aliases = new Set([...text.matchAll(X_FOR)].map((m) => m[1]));
    for (const tag of text.matchAll(WIDGET_TAG)) {
      const widget = tag[1].trim();
      for (const m of tag[0].matchAll(ATTR)) {
        const p = m[2].trim();
        const head = p.split('.')[0];
        if (m[1] === 'value' || !known.has(head) || aliases.has(head)) continue;
        const line = text.slice(0, tag.index + m.index).split('\n').length;
        out.push({ widget, prop: camel(m[1]), path: p, computed: computed.has(head) && !names.getters.includes(head), where: `${path}:${line} x-widget-${m[1]}` });
      }
    }
  }
  return out;
}

/**
 * Prüfdateien der Widget-Bindungen eines Moduls: `viewmodel/view.bindings.js`
 * (view.html und *.part.html) und `tile/<n>.bindings.js` je Kachel-Template.
 * Ohne Bindungen steht `text` auf `null` (Datei soll fehlen).
 * @param {string} appDir @param {string} id @param {Map<string, any>} widgets
 * @returns {{ out: string, text: string|null }[]}
 */
export function bindingChecks(appDir, id, widgets) {
  const base = join(appDir, 'js', 'modules', id);
  const res = join(base, 'resources');
  if (widgets.size === 0 || !existsSync(res)) return [];
  const read = (f) => readFileSync(join(base, f), 'utf8');
  const jobs = [];
  const files = readdirSync(res).filter((f) => f.endsWith('.html')).sort();
  const views = files.filter((f) => f === 'view.html' || f.endsWith('.part.html'));
  if (existsSync(join(base, 'viewmodel', 'viewmodel.js'))) {
    jobs.push({ out: join(base, 'viewmodel', 'view.bindings.js'), vmImport: './viewmodel.js', js: 'viewmodel/viewmodel.js', templates: views });
  }
  for (const f of files) {
    const m = /^tile(?:\.([a-z0-9-]+))?\.html$/.exec(f);
    if (!m) continue;
    const n = m[1] ?? 'tile';
    if (existsSync(join(base, 'tile', `${n}.js`))) {
      jobs.push({ out: join(base, 'tile', `${n}.bindings.js`), vmImport: `./${n}.js`, js: `tile/${n}.js`, templates: [f] });
    }
  }
  return jobs.map(({ out, vmImport, js, templates }) => {
    const bindings = collectBindings(templates.map((f) => ({ path: `resources/${f}`, text: read(`resources/${f}`) })), viewNamesDetailOf(read(js)));
    return { out, text: bindings.length ? renderBindingCheck({ vmImport, bindings }) : null };
  });
}
