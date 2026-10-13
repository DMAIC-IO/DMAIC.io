/**
 * D.Mike — Survey report (survey-report.js)
 *
 * Builds the self-contained HTML report ("Bericht exportieren"). Bars are
 * plain HTML/CSS widths, not chart-framework SVG: the chart framework
 * resolves colours from the active app theme, and the report must print
 * the same in light and dark mode (plan deviation 1). Strings only; no DOM.
 *
 * Spec: docs/superpowers/specs/2026-10-10-survey-builder-design.md §7.3
 */

import { escAttr } from '../../core/html-utils.js';
import { documentOrder, findQuestion } from './survey-conditions.js';
import {
  filterResponses, questionStats, responseRate, ratingRanking,
  kanoOverview, freeTextSummary, groupComparison,
} from './survey-stats.js';

export const REPORT_CSS = `
body { font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1f2328; background: #fff; margin: 0; }
main { max-width: 960px; margin: 0 auto; padding: 32px 24px; }
h1 { font-size: 24px; margin: 0 0 4px; }
h2 { font-size: 18px; margin: 32px 0 8px; border-bottom: 1px solid #d0d7de; padding-bottom: 4px; }
h3 { font-size: 15px; margin: 20px 0 6px; }
.meta { color: #57606a; margin: 0; }
table { border-collapse: collapse; width: 100%; margin: 6px 0 12px; }
th, td { border: 1px solid #d0d7de; padding: 4px 8px; text-align: left; vertical-align: top; }
th { background: #f6f8fa; font-weight: 600; }
td.num { text-align: right; font-variant-numeric: tabular-nums; }
.bar { background: #eaeef2; height: 10px; border-radius: 2px; min-width: 120px; }
.bar__fill { background: #0969da; height: 10px; border-radius: 2px; }
.deviates { background: #fff8c5; font-weight: 600; }
.differs { background: #fff8c5; }
.few { color: #9a6700; font-size: 12px; }
ul.texts { margin: 4px 0 12px; padding-left: 20px; }
.who { color: #57606a; }
article { break-inside: avoid; }
@media print {
  main { max-width: none; padding: 0; }
  h2 { break-after: avoid; }
  .bar, .bar__fill, .deviates, .differs, th { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}
`;

/**
 * Replace `{key}` placeholders.
 * @param {string} template
 * @param {Object<string, *>} params
 * @returns {string}
 */
const fill = (template, params) => String(template ?? '').replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`));

/**
 * Report strings in the app language.
 * @param {import('../../core/i18n.js').I18n} i18n
 * @returns {Promise<object>}
 */
export async function reportStrings(i18n) {
  const lang = i18n.getLanguage();
  const report = await i18n.section('modules.survey-builder.report', lang);
  const kano = await i18n.section('modules.kano', lang);
  const cat = Object.fromEntries(['M', 'O', 'A', 'I', 'R', 'Q'].map((c) => [c, kano[`cat${c}`] || c]));
  return { ...report, cat };
}

/**
 * Build the complete HTML report document.
 * @param {{survey: object, recipients: object[], responses: object[], answeredRecipientIds: string[]}} data
 * @param {object} strings reportStrings() result
 * @param {{locale: string, withNames: boolean, filter: object|null, groupBy: string|null, vocKeys: string[], generatedAt: string}} options
 * @returns {string} complete HTML document
 */
export function buildReportHtml(data, strings, options) {
  const { survey, recipients } = data;
  const locale = options.locale || 'de-DE';
  const lang = locale.toLowerCase().startsWith('en') ? 'en' : 'de';
  const e = escAttr;
  const num = (v, dec) => (v === null || v === undefined ? '—'
    : Number(v).toLocaleString(locale, { minimumFractionDigits: dec, maximumFractionDigits: dec }));
  const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)} %`);
  const date = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale, { timeZone: 'UTC' });
  };
  const bar = (share) => `<div class="bar"><div class="bar__fill" style="width:${Math.round((share || 0) * 100)}%"></div></div>`;
  const showNames = !survey.anonymous && Boolean(options.withNames);
  const names = new Map(recipients.map((r) => [r.id, r.name]));
  const who = (recipientId) => (showNames && names.get(recipientId) ? ` <span class="who">— ${e(names.get(recipientId))}</span>` : '');
  const catLabel = (c) => (c ? e(strings.cat?.[c] || c) : '—');

  const responses = filterResponses(survey, data.responses, options.filter);
  const title = survey.title || strings.untitled || '';
  const out = [];

  // ── Header ──
  out.push(`<h1>${e(title)}</h1>`);
  const times = responses.map((r) => r.submittedAt).filter(Boolean).sort();
  if (times.length) out.push(`<p class="meta">${e(fill(strings.period, { from: date(times[0]), to: date(times[times.length - 1]) }))}</p>`);
  if (options.generatedAt) out.push(`<p class="meta">${e(fill(strings.generated, { date: date(options.generatedAt) }))}</p>`);
  if (options.filter) {
    const fq = findQuestion(survey, options.filter.questionId);
    const fo = fq?.options?.find((o) => o.id === options.filter.optionId);
    if (fq && fo) out.push(`<p class="meta">${e(fill(strings.filter, { question: fq.text, option: fo.text }))}</p>`);
  }

  // ── Response rate ──
  const rate = responseRate(data);
  out.push('<section data-section="rate">', `<h2>${e(strings.rateTitle)}</h2>`);
  out.push(`<p>${e(fill(strings.rateLine, { sent: rate.sent, answered: rate.answered, rate: pct(rate.rate) }))}</p>`);
  if (rate.withoutRecipient) out.push(`<p>${e(fill(strings.withoutRecipient, { count: rate.withoutRecipient }))}</p>`);
  if (rate.groups.length > 1) {
    out.push(`<table><thead><tr><th>${e(strings.colGroup)}</th><th>${e(strings.colSent)}</th><th>${e(strings.colAnswered)}</th><th>${e(strings.colRate)}</th></tr></thead><tbody>`);
    for (const g of rate.groups) {
      out.push(`<tr><td>${e(g.group || strings.groupNone)}</td><td class="num">${g.sent}</td><td class="num">${g.answered}</td><td class="num">${pct(g.rate)}</td></tr>`);
    }
    out.push('</tbody></table>');
  }
  out.push('</section>');

  if (!responses.length) {
    out.push(`<p>${e(strings.noResponses)}</p>`);
    return wrap(lang, title, out);
  }

  // ── Summary ──
  out.push('<section data-section="summary">', `<h2>${e(strings.summaryTitle)}</h2>`);
  const rank = ratingRanking(survey, responses);
  if (rank.length) {
    out.push(`<h3>${e(strings.topTitle)}</h3><table><thead><tr><th>${e(strings.colItem)}</th><th>${e(strings.colN)}</th><th>${e(strings.colMean)}</th><th>${e(strings.colTop)}</th></tr></thead><tbody>`);
    for (const r of rank) out.push(`<tr><td>${e(r.text)}</td><td class="num">${r.n}</td><td class="num">${num(r.mean, 2)}</td><td class="num">${pct(r.topShare)}</td></tr>`);
    out.push('</tbody></table>');
  }
  const kano = kanoOverview(survey, responses);
  if (kano.length) {
    out.push(`<h3>${e(strings.kanoTitle)}</h3><table><thead><tr><th>${e(strings.colItem)}</th><th>${e(strings.colCategory)}</th><th>${e(strings.colBetter)}</th><th>${e(strings.colWorse)}</th></tr></thead><tbody>`);
    for (const k of kano) out.push(`<tr><td>${e(k.text)}</td><td>${catLabel(k.category)}</td><td class="num">${num(k.cs, 2)}</td><td class="num">${num(k.ds, 2)}</td></tr>`);
    out.push('</tbody></table>');
  }
  const ft = freeTextSummary(survey, responses, options.vocKeys || []);
  out.push(`<p>${e(fill(strings.freeText, ft))}</p>`, '</section>');

  // ── Group comparison ──
  const cmp = options.groupBy ? groupComparison(survey, responses, options.groupBy) : null;
  if (cmp) {
    const gq = findQuestion(survey, cmp.questionId);
    const head = cmp.groups.map((g) => `<th>${e(g.text)} <span class="few">(${e(fill(strings.nResponses, { n: g.n }))}${g.few ? `, ${e(strings.fewResponses)}` : ''})</span></th>`).join('');
    out.push('<section data-section="groups">', `<h2>${e(fill(strings.groupsTitle, { question: gq.text }))}</h2>`);
    for (const part of cmp.questions) {
      out.push(`<h3>${e(findQuestion(survey, part.questionId).text)}</h3><table><thead><tr><th></th>${head}</tr></thead><tbody>`);
      if (part.type === 'single' || part.type === 'multi') {
        for (const o of part.options) out.push(`<tr><td>${e(o.text)}</td>${o.shares.map((s) => `<td class="num">${pct(s)}</td>`).join('')}</tr>`);
      } else if (part.type === 'rating') {
        for (const row of part.rows) {
          out.push(`<tr><td>${e(row.text)} <span class="few">(${e(fill(strings.meanShort, { value: num(row.overall, 2) }))})</span></td>${row.cells.map((c) => `<td class="num${c.deviates ? ' deviates' : ''}"${c.deviates ? ' data-deviates="1"' : ''}>${num(c.mean, 2)}</td>`).join('')}</tr>`);
        }
      } else {
        for (const row of part.rows) {
          out.push(`<tr${row.differs ? ' class="differs"' : ''}><td>${e(row.text)}${row.differs ? ` <span class="few">(${e(strings.differs)})</span>` : ''}</td>${row.categories.map((c) => `<td>${catLabel(c)}</td>`).join('')}</tr>`);
        }
      }
      out.push('</tbody></table>');
    }
    out.push('</section>');
  }

  // ── All questions ──
  out.push('<section data-section="questions">', `<h2>${e(strings.questionsTitle)}</h2>`);
  documentOrder(survey).forEach(({ question: q }) => {
    const s = questionStats(survey, q, responses);
    if (!s) return;
    out.push(`<article data-question-id="${e(q.id)}"><h3>${e(q.text)}</h3><p class="meta">${e(fill(strings.nResponses, { n: s.n }))}</p>`);
    if (s.type === 'single' || s.type === 'multi') {
      out.push('<table><tbody>');
      for (const o of s.options) out.push(`<tr><td>${e(o.text)}</td><td class="num">${o.count}</td><td class="num">${pct(o.share)}</td><td>${bar(o.share)}</td></tr>`);
      out.push('</tbody></table>');
      if (s.otherTexts.length) {
        out.push(`<p>${e(strings.other)}:</p><ul class="texts">`);
        for (const t of s.otherTexts) out.push(`<li>${e(t.text)}${who(t.recipientId)}</li>`);
        out.push('</ul>');
      }
    } else if (s.type === 'rating') {
      out.push(`<table><thead><tr><th>${e(strings.colItem)}</th><th>${e(strings.colN)}</th><th>${e(strings.colMean)}</th><th>${e(strings.colMedian)}</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>${e(strings.colNa)}</th><th></th></tr></thead><tbody>`);
      for (const r of s.rows) {
        out.push(`<tr><td>${e(r.text)}</td><td class="num">${r.n}</td><td class="num">${num(r.mean, 2)}</td><td class="num">${num(r.median, 1)}</td>${r.dist.map((c) => `<td class="num">${c}</td>`).join('')}<td class="num">${r.na}</td><td>${bar(r.mean === null ? 0 : r.mean / 5)}</td></tr>`);
      }
      out.push('</tbody></table>');
    } else if (s.type === 'kano') {
      out.push(`<table><thead><tr><th>${e(strings.colItem)}</th><th>M</th><th>O</th><th>A</th><th>I</th><th>R</th><th>Q</th><th>${e(strings.colCategory)}</th><th>${e(strings.colBetter)}</th><th>${e(strings.colWorse)}</th>${q.importance ? `<th>${e(strings.colImportance)}</th>` : ''}</tr></thead><tbody>`);
      for (const r of s.rows) {
        const c = r.counts;
        out.push(`<tr><td>${e(r.text)}</td>${[c.M, c.O, c.A, c.I, c.R, c.Q].map((v) => `<td class="num">${v}</td>`).join('')}<td>${catLabel(r.category)}</td><td class="num">${num(r.cs, 2)}</td><td class="num">${num(r.ds, 2)}</td>${q.importance ? `<td class="num">${num(r.importanceMean, 1)}</td>` : ''}</tr>`);
      }
      out.push('</tbody></table>');
    } else if (s.type === 'text') {
      out.push('<ul class="texts">');
      for (const t of s.answers) out.push(`<li>${e(t.text)}${who(t.recipientId)}</li>`);
      out.push('</ul>');
    }
    out.push('</article>');
  });
  out.push('</section>');
  return wrap(lang, title, out);
}

/**
 * Wrap body fragments into the complete HTML document.
 * @param {string} lang  Report language; follows the report strings, not the survey.
 * @param {string} title
 * @param {string[]} body
 * @returns {string}
 */
function wrap(lang, title, body) {
  return [
    '<!DOCTYPE html>',
    `<html lang="${lang}">`,
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escAttr(title)}</title>`,
    `<style>${REPORT_CSS}</style>`,
    '</head>',
    '<body><main>',
    ...body,
    '</main></body>',
    '</html>',
    '',
  ].join('\n');
}
