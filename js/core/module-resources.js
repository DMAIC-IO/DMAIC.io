/**
 * D.Mike — Bestandteile von Modulen in neuer Form nachladen (module-resources.js)
 *
 * Die Build-Liste `#module-resources` (index.html, tools/build/module-assets.mjs)
 * nennt je umgestelltem Modul die gehashten URLs: Templates
 * (js/chunks/templates/…), CSS (js/chunks/styles/…) und die Dateien unter
 * `resources/` mit Versionsparameter. `prepare(id)` lädt vor dem ersten
 * `init()` Templates, CSS sowie `i18n/ui.<lang>.json` **und**
 * `i18n/context-help.<lang>.json` der aktiven Sprache — je Modul einmal; ein
 * Fehlschlag wird nicht gespeichert, der nächste Versuch lädt neu.
 * `help(id, lang)` und `references(id)` laden für das Hilfe-Panel
 * `i18n/help.<lang>.json` und `data/references.json`, je Schlüssel einmal.
 *
 * Templates kommen per XHR mit `responseType = 'document'`: unter der CSP
 * (require-trusted-types-for 'script') werfen DOMParser und innerHTML.
 */

import { nonReactive } from './non-reactive.js';
import { withoutSchema } from './json-file.js';
import { helpDefFromFile } from './module-help-files.js';
import { resolveReferences } from './references-books.js';

/**
 * @typedef {object} ModuleResourceEntry
 * @property {string} templates  URL der Template-Datei
 * @property {string} [style]  URL der CSS-Datei
 * @property {Record<string, string>} files  Pfad unter resources/ → URL mit ?v=
 */

/**
 * Die Liste `#module-resources` lesen.
 * @param {Document} [doc]
 * @returns {Record<string, ModuleResourceEntry>} leer, wenn der Block fehlt oder kaputt ist
 */
export function readModuleResources(doc = document) {
  const el = doc.getElementById('module-resources');
  if (!el) return {};
  try {
    const value = JSON.parse(el.textContent);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

/**
 * Eine HTML-Datei als Dokument laden (XHR, responseType 'document').
 * @param {string} url
 * @returns {Promise<Document>}
 */
export function fetchDocument(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.responseType = 'document';
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response) resolve(xhr.response);
      else reject(new Error(`[module-resources] ${url}: HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error(`[module-resources] ${url}: Netzwerkfehler`));
    xhr.send();
  });
}

/**
 * @param {string} url
 * @returns {Promise<any>}
 */
export async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`[module-resources] ${url}: HTTP ${response.status}`);
  return response.json();
}

/**
 * Ein Stylesheet ans Ende von <head> hängen (nach css/app.min.css) und auf
 * das Laden warten.
 * @param {string} url
 * @param {Document} [doc]
 * @returns {Promise<HTMLLinkElement>}
 */
export function loadStylesheet(url, doc = document) {
  return new Promise((resolve, reject) => {
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.onload = () => resolve(link);
    link.onerror = () => {
      link.remove();
      reject(new Error(`[module-resources] ${url}: Stylesheet nicht geladen`));
    };
    doc.head.append(link);
  });
}

export class ModuleResources {
  /**
   * @param {object} opts
   * @param {Record<string, ModuleResourceEntry>} opts.manifest  readModuleResources()
   * @param {import('./i18n.js').I18n} opts.i18n
   * @param {Document} [opts.doc]
   * @param {{ fetchJson?: Function, fetchDocument?: Function, loadStylesheet?: Function }} [opts.loaders]
   */
  constructor({ manifest, i18n, doc = document, loaders = {} }) {
    this._manifest = manifest;
    this._i18n = i18n;
    this._doc = doc;
    this._fetchJson = loaders.fetchJson ?? fetchJson;
    this._fetchDocument = loaders.fetchDocument ?? fetchDocument;
    this._loadStylesheet = loaders.loadStylesheet ?? ((url) => loadStylesheet(url, doc));
    /** @type {Map<string, Promise<void>>} id → laufendes oder fertiges prepare */
    this._prepared = new Map();
    /** @type {Map<string, Promise<void>>} `${id}:${lang}` → UI-Texte */
    this._texts = new Map();
    /** @type {Map<string, Promise<void>>} id → Stylesheet (nie doppelt anhängen) */
    this._styles = new Map();
    /** @type {Map<string, Promise<object|null>>} `${id}:${lang}` → Hilfe */
    this._help = new Map();
    /** @type {Map<string, Promise<object[]>>} id → Referenzen */
    this._references = new Map();
    // Nicht reaktiv: die Instanz hängt über ModuleRegistry._resources am
    // stateManager und hält i18n, dessen _stateManager zurückführt. Hält ein
    // Viewmodel den Modulkontext als Datenfeld, stiege Alpines
    // initInterceptors sonst endlos durch diesen Kreis (Stapelüberlauf).
    nonReactive(this);
  }

  /**
   * @param {string} id
   * @returns {boolean} ob das Modul in der Liste steht (neue Form)
   */
  has(id) {
    return Object.hasOwn(this._manifest, id);
  }

  /**
   * @param {string} id
   * @param {string} file  Pfad unter resources/, z. B. 'i18n/help.de.json'
   * @returns {string|undefined}
   */
  url(id, file) {
    return this._manifest[id]?.files?.[file];
  }

  /**
   * Templates, CSS und UI-Texte der aktiven Sprache laden — einmal je Modul.
   * @param {string} id
   * @returns {Promise<void>}
   */
  prepare(id) {
    if (!this.has(id)) return Promise.reject(new Error(`[module-resources] ${id}: nicht in #module-resources`));
    let pending = this._prepared.get(id);
    if (!pending) {
      const pendingLang = this._i18n.getPendingLanguage?.();
      pending = Promise.all([
        this._templates(id),
        this._style(id),
        this._uiTexts(id, this._i18n.getLanguage()),
        // Läuft gerade ein Sprachwechsel, hat dessen Haken _prepared evtl.
        // schon durchlaufen: Texte der Zielsprache gleich mitladen.
        ...(pendingLang && pendingLang !== this._i18n.getLanguage() ? [this._uiTexts(id, pendingLang)] : []),
      ]).then(() => {});
      pending.catch(() => this._prepared.delete(id));
      this._prepared.set(id, pending);
    }
    return pending;
  }

  /**
   * UI-Texte aller vorbereiteten Module für `lang` laden (Sprachwechsel).
   * @param {string} lang
   * @returns {Promise<void>}
   */
  async loadLanguage(lang) {
    await Promise.all([...this._prepared.keys()].map((id) => this._uiTexts(id, lang)));
  }

  /**
   * Das Handbuch eines Moduls in einer Sprache (Hilfe-Panel, module.describe).
   * @param {string} id
   * @param {string} lang
   * @returns {Promise<object|null>} `{ moduleId, sections: { <sec>: { [lang]: { title, blocks } } } }`, ohne Datei null
   */
  help(id, lang) {
    const url = this.url(id, `i18n/help.${lang}.json`);
    if (!url) return Promise.resolve(null);
    return this._once(this._help, `${id}:${lang}`,
      () => this._fetchJson(url).then((file) => helpDefFromFile(id, lang, withoutSchema(file))));
  }

  /**
   * Die Referenzen eines Moduls, Buchverweise aufgelöst.
   * @param {string} id
   * @returns {Promise<object[]>} ohne Datei []
   */
  references(id) {
    const url = this.url(id, 'data/references.json');
    if (!url) return Promise.resolve([]);
    return this._once(this._references, id,
      () => this._fetchJson(url).then((file) => resolveReferences(file?.references ?? [])));
  }

  /**
   * Einmal laden je Schlüssel; ein Fehlschlag wird nicht gespeichert.
   * @template T
   * @param {Map<string, Promise<T>>} cache
   * @param {string} key
   * @param {() => Promise<T>} load
   * @returns {Promise<T>}
   */
  _once(cache, key, load) {
    let pending = cache.get(key);
    if (!pending) {
      pending = load();
      pending.catch(() => cache.delete(key));
      cache.set(key, pending);
    }
    return pending;
  }

  /** @param {string} id */
  async _templates(id) {
    const loaded = await this._fetchDocument(this._manifest[id].templates);
    for (const tpl of loaded.querySelectorAll('template[data-tpl]')) {
      const key = tpl.getAttribute('data-tpl');
      if (this._doc.querySelector(`template[data-tpl="${CSS.escape(key)}"]`)) continue;
      this._doc.body.append(this._doc.adoptNode(tpl));
    }
  }

  /** @param {string} id */
  _style(id) {
    const url = this._manifest[id].style;
    if (!url) return Promise.resolve();
    return this._once(this._styles, id, () => Promise.resolve(this._loadStylesheet(url)).then(() => {}));
  }

  /**
   * UI-Texte und Kontexthilfe einer Sprache laden und gemeinsam einmischen.
   * @param {string} id
   * @param {string} lang
   * @returns {Promise<void>}
   */
  _uiTexts(id, lang) {
    return this._once(this._texts, `${id}:${lang}`, async () => {
      const urls = [`i18n/ui.${lang}.json`, `i18n/context-help.${lang}.json`]
        .map((file) => this.url(id, file)).filter(Boolean);
      const trees = await Promise.all(urls.map((url) => this._fetchJson(url)));
      for (const tree of trees) this._i18n.mergeModule(id, lang, withoutSchema(tree));
    });
  }
}
