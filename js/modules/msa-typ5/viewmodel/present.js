/**
 * D.Mike — MSA Typ 5: Bausteine des Viewmodels ohne DOM.
 *
 * Die Meldungs- und Tabellentexte, die Konfiguration der Diagramm-Widgets und das
 * Kommando zum Tausch der positiven Stufe. Alles rein: Eingaben sind Model,
 * `ctx.source`, das Ergebnis der Engine, der Übersetzer `t` und die App-Sprache.
 */
import { setFields } from '../../../core/model.js';
import { requireForm } from '../../../core/validate.js';
import { ratedShare } from '../../../engines/msa-typ5-engine.js';
import { computeGageRunChart, splitPanelRows } from '../../../engines/gage-run-chart-engine.js';
import { readLevels, readAnalysis, ratingRowsOf } from '../domain/read.js';
import { gageRunEncoding } from '../domain/gage-run.js';
import { fmt, fmtP, fmtPct, fmtCI, fmtCriterion, levelClass, kappaClass } from '../domain/format.js';

/** Die Ableitungen aus Model und Arbeitsblatt liegen in `domain/read.js`; hier nur durchgereicht. */
export { readLevels, readAnalysis, ratingRowsOf };

/**
 * @typedef {(key: string, params?: object) => string} T
 * @typedef {import('../domain/rows.js').Row} Row
 */

/** Prüfeinheiten je Streifen des Messverlaufsdiagramms. */
export const PER_ROW = 10;

/** Farben der Prüfer im Signal-Detection-Diagramm, in fester Reihenfolge. */
const APPRAISER_PALETTE = [
  'var(--color-chart-1)', 'var(--color-chart-3)', 'var(--color-chart-5)',
  'var(--color-chart-2)', 'var(--color-chart-7)', 'var(--color-chart-4)',
];

/** @param {any} v @returns {number|null} endliche Zahl oder null (Widget-Eingaben kennen kein NaN) */
const orNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** @param {string} s @returns {string} erster Buchstabe groß */
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ── Ergebnis und Meldungen ─────────────────────────────────────

/**
 * Das Ergebnis, wenn die Analyse eines hat.
 * @param {any} a Wert von `analysis` @returns {any|null}
 */
export function resultOf(a) {
  return a && !a.invalid && a.error == null ? a : null;
}

/**
 * Engine-Code (`E_TOO_FEW_PARTS`) in seinen Text (`errTooFewParts`).
 * @param {{ code: string, params?: object }} msg @param {'err'|'warn'} prefix @param {T} t
 * @returns {string}
 */
function translateCode({ code, params }, prefix, t) {
  const camel = code.replace(/^E_|^W_/, '').split('_').map((w) => w[0] + w.slice(1).toLowerCase()).join('');
  return t(`${prefix}${camel}`, params ?? {});
}

/**
 * Text an Stelle des Ergebnisses: Ablehnung, gescheiterte Rechnung, Fehler
 * der Engine oder der Hinweis, welche Spalten fehlen; leer mit Urteil.
 * @param {any} a Wert von `analysis` @param {{ layout: string }} m Model @param {T} t
 * @returns {string}
 */
export function analysisMessage(a, m, t) {
  if (a?.invalid) return t(a.invalid.key, a.invalid.vars ?? undefined);
  if (a && a.error != null) return t('errCompute', { msg: a.error });
  if (a?.verdict) return '';
  const err = a?.meta?.errors?.[0];
  if (err) return translateCode(err, 'err', t);
  return t(m.layout === 'wide' ? 'emptyStateWide' : 'emptyState');
}

/**
 * Hinweise der Engine als Text.
 * @param {any} r Ergebnis @param {T} t @returns {string[]}
 */
export function warningEntries(r, t) {
  return (r?.meta?.warnings ?? []).map((w) => {
    const params = { ...(w.params || {}) };
    if (Array.isArray(params.appraisers)) params.appraisers = params.appraisers.join(', ');
    return translateCode({ code: w.code, params }, 'warn', t);
  });
}

// ── Kommando ───────────────────────────────────────────────────

/**
 * Die positive Stufe gegen die wirksame negative tauschen (Rumpf des
 * Viewmodel-Kommandos `swapPositive`). Ohne zweite Stufe abgelehnt.
 * @param {{ model: object, levels: { all: string[], negative: string|null } }} vm
 * @returns {void}
 * @throws {Error & { param: string }} wenn die Daten keine zweite Stufe haben
 */
export function swapPositive(vm) {
  const { all, negative } = vm.levels;
  requireForm('positiveLevel', all, negative != null, 'two rating levels in the data');
  setFields(vm.model, { positiveLevel: negative });
}

// ── Urteil, Kennzahlen, Tabellen ──────────────────────────────

/**
 * Das Kriterium, das das Urteil entschied, oder null.
 * @param {any} r Ergebnis @returns {any|null}
 */
function driverCriterion(r) {
  const v = r?.verdict;
  if (!v?.driver) return null;
  return (v.criteria || []).find((c) => c.id === v.driver) || null;
}

/**
 * Beschriftung eines Kriteriums; unter Bosch mit der Herkunft des κ.
 * @param {any} c @param {T} t @returns {string}
 */
function criterionLabel(c, t) {
  const label = t(`criteria.${c.id}`);
  return c.source ? `${label} (${t(`criteria.source_${c.source}`)})` : label;
}

/**
 * „Ausschlaggebend: <Kriterium> (<Prüfer>) <Wert>“.
 * @param {any} c @param {T} t @param {string} lang @returns {string}
 */
function driverText(c, t, lang) {
  return t('verdictDriver', {
    criterion: criterionLabel(c, t),
    appraiser: c.appraiser ? ` (${c.appraiser})` : '',
    value: fmtCriterion(c.id, c.value, lang),
  });
}

/**
 * Urteil als Text.
 * @param {string} level @param {T} t @returns {string}
 */
export function verdictLabel(level, t) {
  return level ? t(`verdict${cap(level)}`) : '';
}

/**
 * Herkunft der Referenz als Text; ohne Ergebnis ein Strich.
 * @param {any} r Ergebnis @param {T} t @returns {string}
 */
export function referenceSourceLabel(r, t) {
  const src = r?.meta?.referenceSource;
  return src ? t(`labels.referenceSource${cap(src)}`) : '—';
}

/**
 * Unterzeile des Urteils: Fleiss κ mit z-Test, Herkunft der Referenz, ausschlaggebendes Kriterium.
 * @param {any} r Ergebnis @param {T} t @param {string} lang @returns {string}
 */
export function verdictSubline(r, t, lang) {
  if (!r) return '';
  const fk = r.betweenAppraisers?.fleissKappa || {};
  const src = r.meta?.referenceSource || 'none';
  const srcLabel = t(`labels.referenceSource${cap(src)}`);
  // SE0 gilt nur unter H0: Fleiss κ bekommt einen z-Test, kein Intervall.
  const test = Number.isFinite(fk.z) ? ` (z ${fmt(fk.z, 1, lang)}; p ${fmtP(fk.p, lang)})` : '';
  let line = `Fleiss κ = ${fmt(fk.kappa, 3, lang)}${test} · ${t('labels.referenceSource')}: ${srcLabel}`;
  const driver = driverCriterion(r);
  if (driver) line += ` · ${driverText(driver, t, lang)}`;
  return line;
}

/**
 * Deutung als Satz. Ein Urteil unter „gut“ nennt das ausschlaggebende Kriterium.
 * @param {any} r Ergebnis @param {T} t @param {string} lang @returns {string}
 */
export function interpretationText(r, t, lang) {
  const ip = r?.interpretation;
  if (!ip) return '';
  const key = String(ip.textKey).replace(/^modules\.msa-typ5\./, '');
  const driver = driverCriterion(r);
  if (driver && r.verdict.level !== 'good') return t(`${key}_driver`, { decisive: driverText(driver, t, lang) });
  // Die Engine formatiert ihre Zahlen sprachneutral ('0.922').
  const params = { ...(ip.params || {}) };
  if (lang === 'de') {
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === 'string' && /^-?\d+\.\d+$/.test(v)) params[k] = v.replace('.', ',');
    }
  }
  return t(key, params);
}

/**
 * Zeilen der Kriterientabelle; Grenzen mit ≥/≤ nach Richtung, die ausschlaggebende Zeile hervorgehoben.
 * @param {any} r Ergebnis @param {T} t @param {string} lang
 * @returns {Array<Record<string, string>>}
 */
export function criteriaRows(r, t, lang) {
  const v = r?.verdict;
  if (!v) return [];
  return (v.criteria || []).map((c) => {
    const op = c.direction === 'max' ? '≤' : '≥';
    return {
      key: c.id,
      label: criterionLabel(c, t),
      value: fmtCriterion(c.id, c.value, lang),
      appraiser: c.appraiser ?? '—',
      good: `${op} ${fmtCriterion(c.id, c.limits.good, lang)}`,
      marginal: `${op} ${fmtCriterion(c.id, c.limits.marginal, lang)}`,
      status: verdictLabel(c.level, t),
      ampelClass: levelClass(c.level),
      rowClass: c.id === v.driver ? 'msa-typ5__row--driver' : '',
    };
  });
}

/**
 * Hinweis zur Referenz unter der Kriterientabelle; leer ohne.
 * @param {any} r Ergebnis @param {T} t @returns {string}
 */
export function referenceNoteText(r, t) {
  const note = r?.verdict?.referenceNote;
  return note ? t(`verdictNote.${note}`) : '';
}

/**
 * Farbe der Kachel Fleiss κ: das Urteil, das Fleiss κ selbst unter dem
 * Regelwerk bekommt; ohne eigenes Kriterium keine.
 * @param {any} r Ergebnis @returns {string}
 */
export function fleissKappaClass(r) {
  const c = (r?.verdict?.criteria || []).find((x) => x.id === 'fleissKappa' || (x.id === 'minKappa' && x.source === 'fleiss'));
  if (!c) return '';
  if (c.level === 'good') return 'dmike-kpi--good';
  if (c.level === 'marginal') return 'dmike-kpi--warn';
  return 'dmike-kpi--bad';
}

/** @param {number[]} arr @returns {number|null} Mittelwert der endlichen Werte */
function mean(arr) {
  const clean = arr.filter(Number.isFinite);
  return clean.length ? clean.reduce((s, v) => s + v, 0) / clean.length : null;
}

/**
 * κ eines Prüfers gegen die Referenz: unter Bosch Fleiss κ mit der Referenz als
 * weiterem Prüfer, sonst Cohen κ.
 * @param {any} r Ergebnis @param {any} v Werte des Prüfers @returns {any}
 */
function kappaVsRef(r, v) {
  return r?.verdict?.ruleSet === 'bosch' ? v.vsReference?.fleissKappa : v.vsReference?.kappa;
}

/**
 * Mittelwerte der Kennzahlen über die Prüfer.
 * @param {any} r Ergebnis
 * @returns {{ repeatability: number|null, effectiveness: number|null, kappaVsRef: number|null }}
 */
export function kpiMeans(r) {
  const per = Object.values(r?.perAppraiser || {});
  return {
    repeatability: mean(per.map((x) => x.repeatability?.rate)),
    effectiveness: mean(per.map((x) => x.vsReference?.effectiveness?.rate)),
    kappaVsRef: mean(per.map((x) => kappaVsRef(r, x)?.kappa)),
  };
}

/**
 * Zeilen der Prüfertabelle.
 * @param {any} r Ergebnis @param {string} lang @returns {Array<Record<string, string>>}
 */
export function perAppraiserRows(r, lang) {
  const per = r?.perAppraiser;
  if (!per) return [];
  return Object.entries(per).map(([id, v]) => {
    const rep = v.repeatability;
    const eff = v.vsReference?.effectiveness;
    const bias = v.vsReference?.biasRate;
    return {
      id,
      repeatability: rep ? fmtPct(rep.rate, lang) : '—',
      effectiveness: eff ? fmtPct(eff.rate, lang) : '—',
      // 0/0 (kein Teil dieser Referenzklasse) ist keine Rate von 0 %.
      missRate: fmtPct(ratedShare(v.vsReference?.missRate), lang),
      falseAlarmRate: fmtPct(ratedShare(v.vsReference?.falseAlarmRate), lang),
      biasRate: bias ? fmt(bias.value, 3, lang) : '—',
      within: v.withinKappa ? fmt(v.withinKappa.kappa, 3, lang) : '—',
      withinP: v.withinKappa ? fmtP(v.withinKappa.p, lang) : '—',
    };
  });
}

/** @param {any} k @param {string} lang @returns {string} Intervall oder Strich */
const ciText = (k, lang) => ((k.ci95 && Number.isFinite(k.ci95[0]) && Number.isFinite(k.ci95[1])) ? fmtCI(k.ci95, lang) : '—');

/**
 * Zeilen der Tabelle der Prüferpaare.
 * @param {any} r Ergebnis @param {string} lang @returns {Array<Record<string, string>>}
 */
export function pairRows(r, lang) {
  const p = r?.betweenAppraisers?.pairwiseCohenKappa;
  if (!p) return [];
  const ruleSet = r.verdict?.ruleSet;
  return Object.entries(p).map(([pair, k]) => ({
    pair,
    pairLabel: pair.replace('|', ' | '),
    kappa: fmt(k.kappa, 3, lang),
    ci95: ciText(k, lang),
    z: fmt(k.z, 2, lang),
    p: fmtP(k.p, lang),
    ampelClass: kappaClass(k.kappa, ruleSet),
  }));
}

/**
 * Zeilen der Tabelle gegen die Referenz.
 * @param {any} r Ergebnis @param {string} lang @returns {Array<Record<string, string>>}
 */
export function vsRefRows(r, lang) {
  const per = r?.perAppraiser;
  if (!per) return [];
  const ruleSet = r.verdict?.ruleSet;
  return Object.entries(per)
    .filter(([, v]) => kappaVsRef(r, v))
    .map(([id, v]) => {
      const k = kappaVsRef(r, v);
      return {
        id,
        kappa: fmt(k.kappa, 3, lang),
        ci95: ciText(k, lang),
        z: fmt(k.z, 2, lang),
        p: fmtP(k.p, lang),
        ampelClass: kappaClass(k.kappa, ruleSet),
      };
    });
}

/**
 * Zeilen der Teile-Tabelle (von der Engine nach Problemgrad sortiert), auf
 * Wunsch nur die strittigen. Ein Teil ohne Referenz zeigt „—“ statt einer Null.
 * @param {any} r Ergebnis @param {boolean} onlyDisputed
 * @returns {Array<{ part: string, reference: string, ratings: Array<{ appraiser: string, text: string, cellClass: string }>, vsRefErrors: string, mixedAppraisers: string, rowClass: string }>}
 */
export function perPartRows(r, onlyDisputed) {
  const appraisers = Object.keys(r?.perAppraiser || {});
  return (r?.perPart || [])
    .filter((row) => !onlyDisputed || row.isDisputed)
    .map((row) => ({
      part: String(row.part),
      reference: row.reference ?? '—',
      ratings: appraisers.map((a) => {
        const vals = row.byAppraiser[a] || [];
        const mixed = vals.length >= 2 && !vals.every((v) => v === vals[0]);
        const wrong = row.reference !== null && vals.some((v) => v !== row.reference);
        return {
          appraiser: a,
          text: vals.join(', ') || '—',
          cellClass: mixed ? 'msa-typ5__cell--mixed' : (wrong ? 'msa-typ5__cell--wrong' : ''),
        };
      }),
      vsRefErrors: row.vsRefErrors === null ? '—' : String(row.vsRefErrors),
      mixedAppraisers: String(row.mixedAppraisers),
      rowClass: row.isDisputed ? 'msa-typ5__row--disputed' : '',
    }));
}

/**
 * Eine Zeile je Prüfer und Verwechslungsart, dazu „gemischt“ für in sich
 * uneinheitliche Wiederholungen; Prüfer ohne Befund fehlen.
 * @param {any} r Ergebnis @param {T} t
 * @returns {Array<Record<string, string>>}
 */
export function disagreementRows(r, t) {
  const out = [];
  for (const [appraiser, entry] of Object.entries(r?.disagreement || {})) {
    for (const p of entry.confusionPairs || []) {
      out.push({
        key: `${appraiser}|${p.from}|${p.to}`,
        appraiser,
        kind: `${p.from} → ${p.to}`,
        count: String(p.count),
        parts: (p.parts || []).map(String).join(', '),
        rowClass: '',
      });
    }
    if (entry.mixed > 0) {
      out.push({
        key: `${appraiser}|mixed`,
        appraiser,
        kind: t('table.mixedKind'),
        count: String(entry.mixed),
        parts: (entry.mixedParts || []).map(String).join(', '),
        rowClass: 'msa-typ5__row--mixed',
      });
    }
  }
  return out;
}

// ── Diagramme ──────────────────────────────────────────────────

/**
 * Cohen κ je Prüferpaar mit Intervall als Fehlerbalken, Bezugslinien 0,75,
 * 0,40 und Fleiss κ.
 * @param {any} r Ergebnis @param {T} t @param {string} lang
 * @returns {object|null}
 */
export function kappaChart(r, t, lang) {
  const entries = Object.entries(r?.betweenAppraisers?.pairwiseCohenKappa || {});
  if (!entries.length) return null;
  const x = entries.map((_, i) => i);
  const y = entries.map(([, k]) => k.kappa);
  const refLines = [
    { dir: 'h', value: 0.75, label: `κ = ${fmt(0.75, 2, lang)}`, dash: 'dash', width: 1, color: 'var(--color-success)' },
    { dir: 'h', value: 0.40, label: `κ = ${fmt(0.40, 2, lang)}`, dash: 'dash', width: 1, color: 'var(--color-warning)' },
  ];
  const fleiss = r.betweenAppraisers?.fleissKappa?.kappa;
  if (Number.isFinite(fleiss)) {
    refLines.push({ dir: 'h', value: fleiss, label: `Fleiss κ = ${fmt(fleiss, 3, lang)}`, dash: 'solid', width: 1, color: 'var(--color-info)' });
  }
  return {
    xLabel: t('table.pair'),
    yLabel: 'Cohen κ',
    showLegend: false,
    xTicks: x,
    xTickLabels: entries.map(([pair]) => pair.replace('|', ' | ')),
    xMin: -0.5,
    xMax: x.length - 0.5,
    yMin: orNull(Math.min(-0.1, ...y, ...entries.map(([, k]) => k.ci95?.[0] ?? 0))),
    yMax: orNull(Math.max(1.05, ...y, ...entries.map(([, k]) => k.ci95?.[1] ?? 0))),
    series: [{
      name: 'κ',
      color: 'var(--color-accent)',
      x,
      y: y.map(orNull),
      symbol: 'circle',
      markerSize: 10,
      strokeWidth: 1.5,
      errorBars: {
        show: true,
        yMode: 'relative',
        yPlus: entries.map(([, k]) => (Number.isFinite(k.ci95?.[1]) ? orNull(Math.max(0, k.ci95[1] - k.kappa)) : 0)),
        yMinus: entries.map(([, k]) => (Number.isFinite(k.ci95?.[0]) ? orNull(Math.max(0, k.kappa - k.ci95[0])) : 0)),
      },
    }],
    refLines,
  };
}

/**
 * Effektivität je Prüfer mit Intervall, Bezugslinien 90 % und 80 %; nur mit Referenz.
 * @param {any} r Ergebnis @param {T} t
 * @returns {object|null}
 */
export function effectivenessChart(r, t) {
  const entries = Object.entries(r?.perAppraiser || {}).filter(([, v]) => v.vsReference?.effectiveness);
  if (!entries.length) return null;
  const x = entries.map((_, i) => i);
  const y = entries.map(([, v]) => v.vsReference.effectiveness.rate);
  return {
    xLabel: t('table.appraiser'),
    yLabel: t('kpi.effectiveness'),
    showLegend: false,
    xTicks: x,
    xTickLabels: entries.map(([id]) => id),
    xMin: -0.5,
    xMax: x.length - 0.5,
    yMin: 0,
    yMax: 1.05,
    series: [{
      name: t('kpi.effectiveness'),
      color: 'var(--color-accent)',
      x,
      y: y.map(orNull),
      symbol: 'circle',
      markerSize: 10,
      strokeWidth: 1.5,
      errorBars: {
        show: true,
        yMode: 'relative',
        yPlus: entries.map(([, v]) => orNull(Math.max(0, (v.vsReference.effectiveness.ci95?.[1] ?? y[0]) - v.vsReference.effectiveness.rate))),
        yMinus: entries.map(([, v]) => orNull(Math.max(0, v.vsReference.effectiveness.rate - (v.vsReference.effectiveness.ci95?.[0] ?? y[0])))),
      },
    }],
    refLines: [
      { dir: 'h', value: 0.90, label: '90 %', dash: 'dash', width: 1, color: 'var(--color-success)' },
      { dir: 'h', value: 0.80, label: '80 %', dash: 'dash', width: 1, color: 'var(--color-warning)' },
    ],
  };
}

/**
 * Signal Detection: d′ gegen das Kriterium c, eine Reihe je Prüfer; nur binär mit Referenz.
 * @param {any} r Ergebnis @param {T} t
 * @returns {object|null}
 */
export function sdtChart(r, t) {
  const per = r?.signalDetection?.perAppraiser || {};
  const ids = Object.keys(per);
  if (!ids.length) return null;
  return {
    xLabel: t('charts.sdtCriterion'),
    yLabel: "d'",
    showLegend: true,
    series: ids.map((id, i) => {
      const ok = Number.isFinite(per[id].criterion);
      return {
        name: id,
        color: APPRAISER_PALETTE[i % APPRAISER_PALETTE.length],
        x: ok ? [per[id].criterion] : [],
        y: ok ? [orNull(per[id].dPrime)] : [],
        symbol: 'circle',
        markerSize: 12,
        strokeWidth: 1.5,
      };
    }),
    refLines: [
      { dir: 'v', value: 0, label: 'c = 0', dash: 'dash', width: 1, color: 'var(--color-text-secondary)' },
      { dir: 'h', value: 0, label: "d' = 0", dash: 'dash', width: 1, color: 'var(--color-text-secondary)' },
    ],
  };
}

/**
 * Messverlaufsdiagramm über die Rohbewertungen, als Streifen zu je `PER_ROW`
 * Prüfeinheiten; nur bei numerisch kodierbaren Bewertungen. Gemeinsame
 * y-Domäne und Referenzlinie, X-Beschriftung nur am letzten Streifen, Legende
 * auf jedem (sonst fluchten die Felder nicht).
 * @param {any} r Ergebnis @param {Row[]|null} rows Zeilen der Analyse
 * @param {string} type Merkmalstyp @param {{ positive: string|null, negative: string|null }} levels wirksame Stufen
 * @param {T} t
 * @returns {Array<{ key: string, config: object, legacyEditKey: string }>}
 */
export function runStrips(r, rows, type, levels, t) {
  if (!r) return [];
  const enc = gageRunEncoding(rows, type, levels);
  if (!enc) return [];
  const map = enc.kind === 'binary' ? (/** @type {string} */ v) => (v === enc.pos ? 1 : 0) : Number;
  const yLabel = enc.kind === 'binary'
    ? t('charts.gageRunBinaryAxis', { neg: enc.neg, pos: enc.pos })
    : t('labels.ratingColumn');
  const g = computeGageRunChart({
    parts: rows.map((x) => x.part),
    operators: rows.map((x) => x.appraiser),
    measurements: rows.map((x) => map(x.value)),
  });
  if (!g.n) return [];
  const xLabel = t('labels.partColumn');
  const strips = splitPanelRows(g.panels, PER_ROW);
  return strips.map((panels, i) => {
    const isLast = i === strips.length - 1;
    return {
      key: `strip-${i}`,
      legacyEditKey: i === 0 ? 'gage-run-chart' : `gage-run-chart#${i + 1}`,
      config: {
        title: '',
        showTitle: false,
        xLabel: isLast ? xLabel : '',
        showXLabel: isLast && Boolean(xLabel),
        yLabel,
        showLegend: g.operators.length > 1,
        panels: panels.map((p) => ({
          part: String(p.part),
          series: p.series.map((s) => ({ operator: String(s.operator), values: s.values, mean: orNull(s.mean) })),
        })),
        operators: g.operators.map(String),
        refValue: orNull(g.grandMean),
        refLabel: t('charts.gageRunMean'),
        showOperatorMean: false,
        connectWithin: true,
        sharedYMin: orNull(g.yMin),
        sharedYMax: orNull(g.yMax),
      },
    };
  });
}

/**
 * Konfusions-Heatmaps: erst je Prüfer gegen die Referenz, dann je Paar.
 * @param {any} r Ergebnis @param {T} t
 * @returns {Array<{ key: string, title: string, config: object, legacyEditKey: string }>}
 */
export function heatmaps(r, t) {
  if (!r) return [];
  const items = [];
  for (const [id, v] of Object.entries(r.perAppraiser || {})) {
    const m = v.confusionMatrix;
    if (m && Array.isArray(m.counts)) items.push({ title: `${id} vs. ${t('labels.referenceSource')}`, m });
  }
  for (const [pair, k] of Object.entries(r.betweenAppraisers?.pairwiseCohenKappa || {})) {
    if (!k.confusion || !Array.isArray(k.confusion.counts)) continue;
    const [a, b] = pair.split('|');
    items.push({ title: `${a} vs. ${b}`, m: k.confusion });
  }
  return items.map(({ title, m }, i) => ({
    key: `heatmap-${i}`,
    title,
    legacyEditKey: i === 0 ? 'heatmap' : `heatmap#${i + 1}`,
    config: {
      xCategories: m.cols.map(String),
      yCategories: m.rows.map(String),
      cells: m.counts.map((row) => row.map(orNull)),
      cellGap: 1,
      valueDecimals: 0,
      valueLabel: 'n',
      showCellLabels: true,
      squareCells: true,
      plotMargins: { top: 6, right: 10, bottom: 22, left: 42 },
      colorScheme: 'viridis',
    },
  }));
}
