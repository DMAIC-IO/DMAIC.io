/**
 * D.Mike — TRIZ-IFR: Model.
 *
 * Sieben freie Textfelder: das System, seine nützliche Funktion, die
 * schädliche Wirkung, drei Formulierungen des idealen Endresultats und die
 * Hindernisse (eines je Zeile). Gespeichert: `{ _schema, system,
 * usefulFunction, harmfulEffect, ifr1, ifr2, ifr3, obstacles }`; jeder Text
 * bleibt unverändert, auch mit Leerzeichen und Zeilenumbrüchen.
 */
import { defineModel, text } from '../../../core/model.js';
import { from0 } from './migrations.js';

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    /** das betrachtete System — Name oder kurze Beschreibung */
    system: text(),
    /** die nützliche Funktion, die das System erfüllen soll */
    usefulFunction: text(),
    /** die schädliche Wirkung oder der Kompromiss, den das System heute mitbringt */
    harmfulEffect: text(),
    /** IFR-1: das System bleibt, die schädliche Wirkung verschwindet ohne neuen Mechanismus */
    ifr1: text(),
    /** IFR-2: die nützliche Funktion entsteht, ohne dass das System existiert */
    ifr2: text(),
    /** IFR-3: eine vorhandene Ressource aus dem Supersystem übernimmt die Funktion */
    ifr3: text(),
    /** die Hindernisse, die das System heute vom IFR trennen — eines je Zeile */
    obstacles: text(),
  },
  view: {},
});
