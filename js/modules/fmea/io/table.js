/**
 * D.Mike — FMEA Export: die Risiken als Zeilen (für `exports.table()`); der
 * Exporter macht daraus CSV und XLSX.
 */
import { rpn, ap, projS, projO, projD, projAp } from '../domain/rating.js';

/**
 * Kopfzeile wie der Altexport, dann je Maßnahme eine Zeile (ein Risiko ohne
 * Maßnahme eine). Die Risikospalten und die Zielwerte stehen nur in der
 * ersten Zeile eines Risikos. Spalten: #, Prozessschritt, Fehlermodus,
 * Folge, Ursache, Vermeidung, Entdeckung, besonderes Merkmal, Begründung,
 * S, O, D, RPN, AP, Maßnahme, Verantwortlich, Zieldatum, Umgesetzt, ΔS, ΔO,
 * ΔD, Ziel-S, Ziel-O, Ziel-D, Ziel-RPN, Ziel-AP. Leere Werte sind `''`.
 * @param {{ risks: ReadonlyArray<any> }} m
 * @param {(key: string) => string} t Übersetzer des Moduls
 * @returns {Array<Array<string|number>>}
 */
export function toRows(m, t) {
  const yes = t('csvYes');
  const no = t('csvNo');
  /** @type {Array<Array<string|number>>} */
  const rows = [[
    '#', t('step'), t('failureMode'), t('effect'), t('cause'),
    t('preventionControl'), t('currentControls'), t('specialChar'), t('justification'),
    'S', 'O', 'D', 'RPN', 'AP',
    t('action'), t('responsible'), t('dueDate'), t('done'), 'ΔS', 'ΔO', 'ΔD',
    'Proj.S', 'Proj.O', 'Proj.D', 'Proj.RPN', 'Proj.AP',
  ]];
  m.risks.forEach((risk, idx) => {
    const s = risk.sev ?? 0, o = risk.occ ?? 0, d = risk.det ?? 0;
    const value = rpn(risk);
    // Ziel-S/O/D leer bei unbewerteter Stufe, wie die Tabelle sie zeigt.
    const ps = s ? projS(risk) : '', po = o ? projO(risk) : '', pd = d ? projD(risk) : '';
    const prpn = (s && o && d) ? Number(ps) * Number(po) * Number(pd) : '';
    const head = [idx + 1, risk.step, risk.failureMode, risk.effect, risk.cause,
      risk.prevention, risk.control, risk.specialChar, risk.justification,
      s || '', o || '', d || '', value || '', ap(risk) || ''];
    const blankHead = head.map(() => '');
    const pap = projAp(risk) || '';
    if (!risk.actions.length) {
      rows.push([...head, '', '', '', '', '', '', '', ps, po, pd, prpn, pap]);
      return;
    }
    risk.actions.forEach((/** @type {any} */ a, /** @type {number} */ ai) => {
      const actionCols = [a.text, a.resp, a.date, a.done ? yes : no, a.deltaS, a.deltaO, a.deltaD];
      rows.push(ai === 0
        ? [...head, ...actionCols, ps, po, pd, prpn, pap]
        : [...blankHead, ...actionCols, '', '', '', '', '']);
    });
  });
  return rows;
}
