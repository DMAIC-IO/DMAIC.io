/**
 * D.Mike — Multi-Vari: Model.
 *
 * Messwertspalte, **geordnete** Faktorzeilen (2 bis 4), Modellform, Schätzer
 * und Darstellungsschalter. Die Reihenfolge der Faktoren legt Achse, Serie,
 * Panel-Spalte und Panel-Zeile fest und zugleich, was im geschachtelten Modell
 * in was steckt; darum hat jede Zeile eine eigene `id`. Keine Statistik, kein
 * i18n.
 *
 * Gespeichert: `{ _schema, measurement, factors, modelForm, estimator,
 * showPoints, connectMeans, showGroupMean, showRefLine, exampleWorksheetId }`.
 * Die Zeilenzahl sichert die Invariante `factorCount` — beim Laden repariert,
 * beim Schreiben abgelehnt. `moveFactor.toIdx` ist der ENDINDEX.
 */
import {
  defineModel, command, list, object, map, text, idOf, index, oneOf, boolean, number, columnRef,
} from '../../../core/model.js';
import { uid } from '../../../core/uid.js';
import MultiVariChart from '../../../widgets/multi-vari-chart/schema.js';
import { from0 } from './migrations.js';

const MIN_ROWS = 2;
const MAX_ROWS = 4;

export class State extends defineModel({
  version: '1.0',
  fields: {
    measurement: columnRef({ types: ['numeric', 'percent', 'currency'] }),
    factors: list(object({ id: text(), ref: columnRef() }), {
      default: [{ id: 'f1', ref: null }, { id: 'f2', ref: null }],
    }),
    modelForm: oneOf(['nested', 'crossed'], { default: 'nested' }),
    estimator: oneOf(['anova', 'reml'], { default: 'anova' }),
    showPoints: boolean({ default: true }),
    connectMeans: boolean({ default: true }),
    showGroupMean: boolean({ default: true }),
    showRefLine: boolean({ default: true }),
    exampleWorksheetId: text({ nullable: true }),
  },
  view: {
    stripEdits: map(number({ integer: true, min: 0 }), MultiVariChart.edits()),
  },
  migrations: { '0→1.0': from0 },
  commands: {
    addFactor: command({
      returns: text(),
      run() {
        const id = uid();
        this.factors.push({ id, ref: null });
        return id;
      },
    }),
    removeFactor: command({
      params: { id: idOf('factors') },
      run({ id }) {
        this.factors = this.factors.filter(f => f.id !== id);
      },
    }),
    moveFactor: command({
      params: {
        fromIdx: index('factors', { existing: true }),
        toIdx: index('factors', { afterRemovalFrom: 'factors' }),
      },
      run({ fromIdx, toIdx }) {
        const [moved] = this.factors.splice(fromIdx, 1);
        this.factors.splice(toIdx, 0, moved);
      },
    }),
    setFactorColumn: command({
      params: { id: idOf('factors'), ref: columnRef() },
      run({ id, ref }) {
        this.factors.find(f => f.id === id).ref = ref;
      },
    }),
  },
  invariants: {
    factorIds: {
      fields: ['factors'],
      test(m) {
        const ids = m.factors.map(f => f.id);
        return ids.every(id => id !== '') && new Set(ids).size === ids.length;
      },
      repair(m) {
        const rows = m._v.factors;
        const taken = new Set(rows.map(f => f.id));
        const seen = new Set();
        m._v.factors = rows.filter((f) => {
          if (f.id === '') {
            do { f.id = uid(); } while (taken.has(f.id));
            taken.add(f.id);
          }
          if (seen.has(f.id)) return false;
          seen.add(f.id);
          return true;
        });
      },
    },
    factorCount: {
      fields: ['factors'],
      test(m) {
        return m.factors.length >= MIN_ROWS && m.factors.length <= MAX_ROWS;
      },
      repair(m) {
        const rows = m._v.factors.slice(0, MAX_ROWS);
        const taken = new Set(rows.map(f => f.id));
        while (rows.length < MIN_ROWS) {
          let id = uid();
          while (taken.has(id)) id = uid();
          taken.add(id);
          rows.push({ id, ref: null });
        }
        m._v.factors = rows;
      },
    },
  },
}) {}
