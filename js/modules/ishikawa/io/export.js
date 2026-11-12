/**
 * D.Mike — Ishikawa: Export als Tabellen-Mapper. Liefert die Zeilen als
 * Rohform (`any[][]`), Zeile 0 ist die Problemzeile; Zahlen bleiben Zahlen,
 * das Format setzt der Kern.
 */
import { ordered, depthOf, effCat } from '../domain/tree.js';
import { scoreOf } from '../domain/scores.js';

/**
 * Anzeigename einer Kategorie: eigene Bezeichnung, sonst die Übersetzung.
 * @param {Record<string, string>} catLabels @param {string} key
 * @param {(key: string) => string} t @returns {string}
 */
function catName(catLabels, key, t) {
  const custom = (catLabels?.[key] ?? '').trim();
  return custom || t(`cat.${key}`);
}

/**
 * Problem, Ursachenbaum mit Bewertungen je Experte und Score, Fakten.
 * Zeile 0 ist die Problemzeile; danach folgen Leerzeile, Baumkopf,
 * Baumzeilen und, falls vorhanden, Leerzeile, Faktentitel, Faktenkopf, Fakten.
 * Der Score ist auf eine Dezimale gerundet (als Zahl).
 * @param {{ problem: string, experts: Array<{id: number, name: string}>, catLabels: Record<string, string>,
 *   rows: Array<any>, facts: Array<any> }} model
 * @param {{ t: (key: string) => string }} opts
 * @returns {Array<Array<string|number>>}
 */
export function exportTable(model, { t }) {
  const rows = [[t('problemStatement'), model.problem ?? ''], []];
  rows.push(['#', t('level'), t('category'), t('effCat'), t('name'), t('description'),
    ...model.experts.map((e) => e.name), t('avgScore'), t('status')]);
  const nums = {};
  const counters = {};
  for (const r of ordered(model.rows)) {
    const key = r.parentId === null ? '_' : r.parentId;
    counters[key] = (counters[key] || 0) + 1;
    nums[r.id] = r.parentId === null ? `${counters[key]}` : `${nums[r.parentId] || '?'}.${counters[key]}`;
    const d = depthOf(model.rows, r.id);
    const eff = effCat(model.rows, r);
    const score = scoreOf(r);
    rows.push([
      nums[r.id],
      d === 0 ? t('main') : t('sub'),
      r.category ? catName(model.catLabels, r.category, t) : '',
      eff ? catName(model.catLabels, eff, t) : '',
      r.name || '',
      `${'  '.repeat(d)}${r.description || ''}`,
      ...model.experts.map((e) => r.ratings[e.id] ?? ''),
      score === null ? '' : Math.round(score * 10) / 10,
      r.status ? t(`status.${r.status}`) : '',
    ]);
  }
  if (model.facts.length) {
    rows.push([]);
    rows.push([t('tabFacts')]);
    rows.push(['#', t('factName'), t('factDescription'), t('factDate'), t('factOwner')]);
    model.facts.forEach((f, i) => rows.push([i + 1, f.name ?? '', f.description ?? '', f.date ?? '', f.owner ?? '']));
  }
  return rows;
}
