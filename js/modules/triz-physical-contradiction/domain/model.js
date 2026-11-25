/**
 * D.Mike — TRIZ physikalischer Widerspruch: Model.
 *
 * Ein Parameter mit zwei gegensätzlichen Anforderungen A und Nicht-A, eine
 * Problemnotiz, je Trennungsprinzip eine Notiz, das gewählte Prinzip und eine
 * Lösungsnotiz. Gespeichert: `{ _schema, parameter, requirementA,
 * requirementNotA, problemNote, principleNotes: { time, space, condition,
 * system }, selectedPrinciple, solutionNote }`.
 */
import { defineModel, command, text, record, oneOf } from '../../../core/model.js';
import { from0 } from './migrations.js';

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    /** der technische Parameter, der die beiden gegensätzlichen Anforderungen trägt */
    parameter: text(),
    /** die Anforderung A — die eine Seite des Widerspruchs */
    requirementA: text(),
    /** die Anforderung Nicht-A — die entgegengesetzte Seite des Widerspruchs */
    requirementNotA: text(),
    /** die Problemnotiz: warum beide Anforderungen zugleich unmöglich sind */
    problemNote: text(),
    /**
     * je Trennungsprinzip eine Notiz: Trennung in der Zeit, im Raum, nach
     * Bedingung und auf Systemebene
     */
    principleNotes: record(['time', 'space', 'condition', 'system'], text()),
    /** das gewählte Trennungsprinzip; leer, solange keines gewählt ist */
    selectedPrinciple: oneOf(['time', 'space', 'condition', 'system'], { nullable: true }),
    /** die Lösungsnotiz zum gewählten Trennungsprinzip */
    solutionNote: text(),
  },
  view: {},
  commands: {
    swap: command({
      params: {},
      run() {
        const a = this.requirementA;
        this.requirementA = this.requirementNotA;
        this.requirementNotA = a;
      },
    }),
  },
});
