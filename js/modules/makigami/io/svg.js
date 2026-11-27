/**
 * D.Mike — Makigami Export: die Matrix mit Kennzahlenleiste als SVG-Text
 * (für `exports.image()`, auch PNG). Rein; Texte und Farben reicht das
 * Viewmodel herein. Gleicher Aufbau wie der Bildexport der Altform.
 */
import { escAttr } from '../../../core/html-utils.js';
import { stepLabel, roleName } from './export.js';

const ROW_H = 32;
const COL_W = 150;
const ROLE_COL_W = 200;
const HEADER_H = 40;
const KPI_H = 64;
const KPI_GAP = 24;

/**
 * @typedef {object} SvgTexts
 * @property {string} corner  Text der Ecke (Rollen / Schritte)
 * @property {string} rolePlaceholder  Name einer Rolle ohne Namen
 * @property {string[]} kpiLabels  die vier Beschriftungen der Kennzahlen
 * @property {string[]} kpiValues  die vier Anzeigetexte der Kennzahlen
 */

/**
 * @typedef {{ bg: string, bgSec: string, border: string, text: string, muted: string,
 *   accent: string, accentBg: string }} SvgColors
 */

/**
 * Kürzt einen Text über `max` Zeichen auf `max - 3` plus `…`.
 * @param {string} s @param {number} max @returns {string}
 */
const clip = (s, max) => (s.length > max ? `${s.slice(0, max - 3)}…` : s);

/**
 * Das Bild: Kopf mit Ecke und Schritten, je Rolle eine Zeile mit Punkt je
 * Schritt (gefüllt bei Mitwirkung), darunter vier Kennzahlfelder; ohne
 * Rollen oder Schritte ein Strich.
 * @param {{ roles: ReadonlyArray<import('./export.js').Role>, steps: ReadonlyArray<import('./export.js').Step> }} data
 * @param {SvgTexts} texts @param {SvgColors} C
 * @returns {string}
 */
export function matrixSVG(data, texts, C) {
  const { roles, steps } = data;
  const nCols = Math.max(1, steps.length);
  const nRows = Math.max(1, roles.length);
  const tableW = ROLE_COL_W + nCols * COL_W;
  const tableH = HEADER_H + nRows * ROW_H;
  const totalH = tableH + KPI_GAP + KPI_H;
  const totalW = tableW;

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="12">`);
  parts.push(`<rect width="${totalW}" height="${totalH}" fill="${C.bg}"/>`);

  parts.push(`<rect x="0" y="0" width="${ROLE_COL_W}" height="${HEADER_H}" fill="${C.bgSec}" stroke="${C.border}"/>`);
  parts.push(`<text x="${ROLE_COL_W / 2}" y="${HEADER_H / 2 + 4}" fill="${C.muted}" text-anchor="middle">${escAttr(texts.corner)}</text>`);

  steps.forEach((s, i) => {
    const x = ROLE_COL_W + i * COL_W;
    parts.push(`<rect x="${x}" y="0" width="${COL_W}" height="${HEADER_H}" fill="${C.bgSec}" stroke="${C.border}"/>`);
    parts.push(`<text x="${x + COL_W / 2}" y="${HEADER_H / 2 + 4}" fill="${C.text}" text-anchor="middle">${escAttr(clip(stepLabel(s, i), 28))}</text>`);
  });

  if (roles.length === 0 || steps.length === 0) {
    parts.push(`<text x="${totalW / 2}" y="${HEADER_H + ROW_H / 2 + 4}" fill="${C.muted}" text-anchor="middle">—</text>`);
  } else {
    roles.forEach((r, ri) => {
      const y = HEADER_H + ri * ROW_H;
      parts.push(`<rect x="0" y="${y}" width="${ROLE_COL_W}" height="${ROW_H}" fill="${C.bgSec}" stroke="${C.border}"/>`);
      parts.push(`<text x="12" y="${y + ROW_H / 2 + 4}" fill="${C.text}">${escAttr(clip(roleName(r, texts.rolePlaceholder), 26))}</text>`);
      steps.forEach((s, si) => {
        const x = ROLE_COL_W + si * COL_W;
        parts.push(`<rect x="${x}" y="${y}" width="${COL_W}" height="${ROW_H}" fill="${C.bg}" stroke="${C.border}"/>`);
        const cx = x + COL_W / 2;
        const cy = y + ROW_H / 2;
        parts.push(s.roleIds.includes(r.id)
          ? `<circle cx="${cx}" cy="${cy}" r="8" fill="${C.accent}"/>`
          : `<circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="${C.border}" stroke-width="2"/>`);
      });
    });
  }

  const kpiY = tableH + KPI_GAP;
  const cellW = totalW / 4;
  for (let i = 0; i < 4; i++) {
    const x = i * cellW;
    const isAcc = i === 3;
    parts.push(`<rect x="${x}" y="${kpiY}" width="${cellW}" height="${KPI_H}" fill="${isAcc ? C.accentBg : C.bgSec}" stroke="${isAcc ? C.accent : C.border}"/>`);
    parts.push(`<text x="${x + cellW / 2}" y="${kpiY + 22}" fill="${C.muted}" text-anchor="middle" font-size="10" letter-spacing="0.05em">${escAttr(texts.kpiLabels[i].toUpperCase())}</text>`);
    parts.push(`<text x="${x + cellW / 2}" y="${kpiY + 48}" fill="${C.text}" text-anchor="middle" font-size="18" font-weight="600">${escAttr(texts.kpiValues[i])}</text>`);
  }

  parts.push('</svg>');
  return parts.join('');
}
