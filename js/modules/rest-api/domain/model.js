/**
 * D.Mike — REST API: Model.
 *
 * Endpunkte für GET-Abrufe, je mit Name, URL, Kopfzeilen, Spaltenzuordnungen
 * (JSON-Pfad → Spalte), Schreibmodus und Zeitplan; dazu der Endpunkt, den die
 * Ansicht zeigt. Zuordnungen und Schreibmodus werden gespeichert, aber noch
 * nicht angewendet. Die Antwort eines Abrufs ist flüchtig und steht nie im
 * Model. Ohne DOM, ohne Netz, ohne i18n.
 *
 * Gespeichert: `{ _schema, endpoints, activeId }`. Eindeutige ids, je
 * Endpunkt jede Spalte höchstens einmal und ein vorhandener aktiver Endpunkt
 * sind Invarianten — beim Laden repariert, beim Schreiben abgelehnt.
 * `selectEndpoint` ist ein Kommando nur der Oberfläche (Parameter
 * `agentWrite: false`); der Agent schreibt `activeId` nicht.
 *
 * Header-Werte stehen im Klartext im Model (der Abruf sendet sie). Der
 * Platzhalter `MASK` (`domain/headers.js`), mit dem Lesefläche und Export
 * geheime Werte zeigen, ist nie ein gültiger Wert (Invariante `noMaskedValue`):
 * ein importiertes Projekt mit Platzhalter lädt mit leerem Wert, und
 * `secretHeadersEmpty` nennt die geheimen Header, die neu zu füllen sind.
 */
import {
  defineModel, command, list, object, text, number, boolean, oneOf, idOf, columnRef,
} from '../../../core/model.js';
import { requireIndex } from '../../../core/validate.js';
import { uid } from '../../../core/uid.js';
import { from0 } from './migrations.js';
import { MASK, isSecretHeader, unmaskedValue } from './headers.js';

/** @typedef {{ endpointId: string, index: number, key: string }} SecretGap */

/** Kleinster und größter Abstand des Zeitplans. */
export const INTERVAL_MIN = 1;
export const INTERVAL_MAX = 999;

/**
 * Schlüssel eines Spaltenbezugs für Vergleiche.
 * @param {{ instanceId: string, sheetId?: string, columnId: string }} ref
 * @returns {string}
 */
export function columnKey(ref) {
  return `${ref.instanceId}|${ref.sheetId ?? ''}|${ref.columnId}`;
}

/**
 * True, wenn keine Spalte in den Zuordnungen doppelt vorkommt.
 * @param {ReadonlyArray<{ columnRef: object|null }>} mappings
 * @returns {boolean}
 */
function columnsFree(mappings) {
  const keys = mappings.filter((m) => m.columnRef).map((m) => columnKey(/** @type {any} */ (m.columnRef)));
  return new Set(keys).size === keys.length;
}

/**
 * Der Endpunkt zu einer id; `idOf` hat sie schon geprüft.
 * @param {any} m @param {string} id @returns {any}
 */
const endpointOf = (m, id) => m.endpoints.find((/** @type {{ id: string }} */ e) => e.id === id);

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    /**
     * die Endpunkte in Listenreihenfolge, je mit id, Name, URL, Kopfzeilen,
     * Spaltenzuordnungen, Schreibmodus und Zeitplan
     */
    endpoints: list(object({
      id: text({ nonEmpty: true }),
      name: text(),
      url: text(),
      headers: list(object({ key: text(), value: text() })),
      mappings: list(object({ jsonPath: text(), columnRef: columnRef() })),
      writeMode: oneOf(['replace', 'append', 'prepend'], { default: 'replace' }),
      schedule: object({
        enabled: boolean(),
        intervalValue: number({ integer: true, min: 1, max: 999, default: 5 }),
        intervalUnit: oneOf(['minutes', 'hours'], { default: 'minutes' }),
      }),
    })),
  },
  view: {
    /** der Endpunkt, den die Ansicht zeigt */
    activeId: text({ nullable: true, agentWrite: false }),
  },
  invariants: {
    uniqueIds: {
      fields: ['endpoints'],
      test(m) {
        return new Set(m.endpoints.map((/** @type {{ id: string }} */ e) => e.id)).size === m.endpoints.length;
      },
      repair(m) {
        const seen = new Set();
        m._v.endpoints = m._v.endpoints.map((/** @type {{ id: string }} */ e) => {
          let id = e.id;
          while (seen.has(id)) id += '_';
          seen.add(id);
          return id === e.id ? e : { ...e, id };
        });
      },
    },
    mappingColumnFree: {
      fields: ['endpoints'],
      test(m) {
        return m.endpoints.every((/** @type {{ mappings: any[] }} */ e) => columnsFree(e.mappings));
      },
      repair(m) {
        m._v.endpoints = m._v.endpoints.map((/** @type {{ mappings: any[] }} */ e) => {
          if (columnsFree(e.mappings)) return e;
          const seen = new Set();
          return {
            ...e,
            mappings: e.mappings.map((mp) => {
              if (!mp.columnRef) return mp;
              const key = columnKey(mp.columnRef);
              if (seen.has(key)) return { ...mp, columnRef: null };
              seen.add(key);
              return mp;
            }),
          };
        });
      },
    },
    noMaskedValue: {
      fields: ['endpoints'],
      test(m) {
        return m.endpoints.every((/** @type {{ headers: any[] }} */ e) => e.headers.every((h) => h.value !== MASK));
      },
      repair(m) {
        m._v.endpoints = m._v.endpoints.map((/** @type {{ headers: any[] }} */ e) => (
          e.headers.some((h) => h.value === MASK)
            ? { ...e, headers: e.headers.map((h) => ({ ...h, value: unmaskedValue(h.value) })) }
            : e));
      },
    },
    knownActive: {
      fields: ['activeId'],
      test(m) {
        return m.activeId === null || m.endpoints.some((/** @type {{ id: string }} */ e) => e.id === m.activeId);
      },
      repair(m) {
        m._v.activeId = m._v.endpoints.length ? m._v.endpoints[0].id : null;
      },
    },
  },
  commands: {
    addEndpoint: command({
      returns: text(),
      run() {
        const id = uid();
        this.endpoints.push({
          id, name: '', url: '', headers: [], mappings: [], writeMode: 'replace',
          schedule: { enabled: false, intervalValue: 5, intervalUnit: 'minutes' },
        });
        this.activeId = id;
        return id;
      },
    }),
    selectEndpoint: command({
      params: { endpointId: idOf('endpoints', { agentWrite: false }) },
      run({ endpointId }) {
        if (this.activeId !== endpointId) this.activeId = endpointId;
      },
    }),
    renameEndpoint: command({
      params: { endpointId: idOf('endpoints'), name: text() },
      run({ endpointId, name }) { endpointOf(this, endpointId).name = name; },
    }),
    removeEndpoint: command({
      params: { endpointId: idOf('endpoints') },
      confirm({ endpointId }) {
        const ep = endpointOf(this, endpointId);
        if (!ep) return null;
        const name = ep.name || ep.url;
        return name ? { key: 'confirm.removeEndpoint', params: { name } } : { key: 'confirm.removeEndpointUnnamed' };
      },
      run({ endpointId }) {
        this.endpoints = this.endpoints.filter((e) => e.id !== endpointId);
        if (this.activeId === endpointId) this.activeId = this.endpoints[0]?.id ?? null;
      },
    }),
    addHeader: command({
      params: { endpointId: idOf('endpoints') },
      returns: number({ integer: true }),
      run({ endpointId }) {
        const ep = endpointOf(this, endpointId);
        ep.headers.push({ key: '', value: '' });
        return ep.headers.length - 1;
      },
    }),
    setHeader: command({
      params: { endpointId: idOf('endpoints'), index: number({ integer: true, min: 0 }), key: text(), value: text() },
      run({ endpointId, index, key, value }) {
        const ep = endpointOf(this, endpointId);
        requireIndex('index', index, ep.headers.length, { existing: true });
        ep.headers[index] = { key, value };
      },
    }),
    removeHeader: command({
      params: { endpointId: idOf('endpoints'), index: number({ integer: true, min: 0 }) },
      run({ endpointId, index }) {
        const ep = endpointOf(this, endpointId);
        requireIndex('index', index, ep.headers.length, { existing: true });
        ep.headers.splice(index, 1);
      },
    }),
    addMapping: command({
      params: { endpointId: idOf('endpoints') },
      returns: number({ integer: true }),
      run({ endpointId }) {
        const ep = endpointOf(this, endpointId);
        ep.mappings.push({ jsonPath: '', columnRef: null });
        return ep.mappings.length - 1;
      },
    }),
    setMapping: command({
      params: {
        endpointId: idOf('endpoints'), index: number({ integer: true, min: 0 }), jsonPath: text(), ref: columnRef(),
      },
      run({ endpointId, index, jsonPath, ref }) {
        const ep = endpointOf(this, endpointId);
        requireIndex('index', index, ep.mappings.length, { existing: true });
        ep.mappings[index] = { jsonPath, columnRef: ref ?? null };
      },
    }),
    removeMapping: command({
      params: { endpointId: idOf('endpoints'), index: number({ integer: true, min: 0 }) },
      run({ endpointId, index }) {
        const ep = endpointOf(this, endpointId);
        requireIndex('index', index, ep.mappings.length, { existing: true });
        ep.mappings.splice(index, 1);
      },
    }),
  },
  derived: {
    /**
     * Die ids der Endpunkte mit eingeschaltetem Zeitplan, aber ohne URL; für
     * sie läuft kein Zeitgeber.
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    scheduleWithoutUrl() {
      return this.endpoints.filter((e) => e.schedule.enabled && e.url === '').map((e) => e.id);
    },
    /**
     * Die Header mit geheimem Namen (Zugangsdaten) ohne Wert, je mit
     * Endpunkt, Position und Namen — etwa nach dem Import eines Projekts,
     * dessen Export die Werte maskiert hatte.
     * @this {import('./model.types.js').StateModel}
     * @returns {SecretGap[]}
     */
    secretHeadersEmpty() {
      return this.endpoints.flatMap((e) => e.headers
        .map((h, index) => ({ endpointId: e.id, index, key: h.key, value: h.value }))
        .filter((h) => h.value === '' && isSecretHeader(h.key))
        .map(({ endpointId, index, key }) => ({ endpointId, index, key })));
    },
  },
});
