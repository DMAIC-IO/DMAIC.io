/**
 * D.Mike — MSA Typ 2: Bausteine des Viewmodels ohne DOM.
 *
 * Die Ableitung aus Model und Arbeitsblatt, der Meldungstext, die Tabellen-
 * zeilen und die Konfiguration der Diagramm-Widgets. Alles rein: Eingaben
 * sind das Ergebnis der Engine und der Übersetzer `t`.
 */
import { readAnalysis } from '../domain/data.js';
import { fmt, fmtP } from '../domain/format.js';
import { panelsFromCells, splitPanelRows } from '../../../engines/gage-run-chart-engine.js';

/** Die Ableitung aus Model und Arbeitsblatt liegt in `domain/data.js`; hier nur durchgereicht. */
export { readAnalysis };

/** Prüfeinheiten je Streifen des Messverlaufsdiagramms. */
export const PER_ROW = 10;

/** Farben der Prüfer, in fester Reihenfolge. */
const OPERATOR_PALETTE = [
  'var(--color-chart-1)', 'var(--color-chart-3)', 'var(--color-chart-5)',
  'var(--color-chart-2)', 'var(--color-chart-7)', 'var(--color-chart-4)',
];

/**
 * Farbe je Prüfer.
 * @param {number} n Anzahl der Prüfer
 * @returns {string[]}
 */
export function operatorColors(n) {
  return Array.from({ length: n }, (_, i) => OPERATOR_PALETTE[i % OPERATOR_PALETTE.length]);
}

/** @param {number} v @returns {number|null} endliche Zahl oder null (Widget-Eingaben kennen kein NaN) */
const orNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** @param {number} v @returns {number} endliche Zahl, sonst 0 (Balken ohne Wert) */
const orZero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Das Ergebnis, wenn die Analyse eines hat.
 * @param {any} a Wert von `analysis`
 * @returns {any|null}
 */
export function resultOf(a) {
  return a && !a.invalid && a.error == null ? a : null;
}

/**
 * Text der Fehlerzeile: Ablehnung der Prüfung oder gescheiterte Rechnung.
 * @param {any} a Wert von `analysis`
 * @param {(key: string, params?: object) => string} t
 * @returns {string}
 */
export function analysisMessage(a, t) {
  if (!a) return '';
  if (a.invalid) return t(a.invalid.key, a.invalid.vars ?? undefined);
  if (a.error != null) return t('errCompute', { msg: a.error });
  return '';
}

/**
 * Kopfzeile des Status: Teile, Prüfer, Wiederholungen, n und Bezug.
 * @param {any} r Ergebnis @param {(key: string) => string} t
 * @returns {string}
 */
export function statusDetail(r, t) {
  if (!r) return '';
  const basis = ` — ${t('basisPrefix')}: ${t(r.verdictBasis === 'tolerance' ? 'verdictBasisTolerance' : 'verdictBasisStudyVar')}`;
  return r.mode === 'typ3'
    ? `— ${r.p} ${t('parts')}, ${r.r} ${t('replicates')} — n = ${r.n}${basis}`
    : `— ${r.p} ${t('parts')}, ${r.o} ${t('operators')}, ${r.r} ${t('replicates')} — n = ${r.n}${basis}`;
}

/**
 * Zeilen der ANOVA-Tabelle; Prüfer und Wechselwirkung nur, wo es sie gibt.
 * @param {any} r Ergebnis @param {(key: string) => string} t @param {string} lang App-Sprache
 * @returns {Array<{ key: string, label: string, ss: string, df: number, ms: string, f: string, p: string, totalClass: string }>}
 */
export function anovaRows(r, t, lang) {
  if (!r) return [];
  const a = r.anova;
  const row = (key, label, s) => ({
    key, label, ss: fmt(s.ss, 4, lang), df: s.df, ms: fmt(s.ms, 4, lang), f: fmt(s.f, 4, lang), p: fmtP(s.pValue, lang), totalClass: '',
  });
  const rows = [row('part', t('sourcePart'), a.part)];
  if (a.operator) rows.push(row('operator', t('sourceOperator'), a.operator));
  if (a.interact) rows.push(row('interact', t('sourceInteract'), a.interact));
  rows.push({
    key: 'equip', label: r.interactionPooled ? t('sourceEquipPooled') : t('sourceEquip'),
    ss: fmt(a.equip.ss, 4, lang), df: a.equip.df, ms: fmt(a.equip.ms, 4, lang), f: '–', p: '–', totalClass: '',
  });
  rows.push({ key: 'total', label: t('sourceTotal'), ss: fmt(a.total.ss, 4, lang), df: a.total.df, ms: '–', f: '–', p: '–', totalClass: 'msa-typ2__anova-total' });
  return rows;
}

/**
 * Zeilen der Tabelle der Varianzkomponenten (Typ 3 ohne Reproduzierbarkeit).
 * @param {any} r Ergebnis @param {(key: string) => string} t @param {string} lang App-Sprache
 * @returns {Array<Record<string, string>>}
 */
export function varCompRows(r, t, lang) {
  if (!r) return [];
  const vc = r.varComp;
  const i2 = '  ';
  const i4 = '    ';
  const defs = r.mode === 'typ3' ? [
    ['grr', t('gageRR')],
    ['repeatability', `${i2}${t('repeatability')}`],
    ['part', t('partToPartVar')],
    ['total', t('sourceTotal')],
  ] : [
    ['grr', t('gageRR')],
    ['repeatability', `${i2}${t('repeatability')}`],
    ['reproducibility', `${i2}${t('reproducibility')}`],
    ['operator', `${i4}${t('sourceOperator')}`],
    ['interact', `${i4}${t('sourceInteract')}`],
    ['part', t('partToPartVar')],
    ['total', t('sourceTotal')],
  ];
  return defs.map(([key, label]) => {
    const v = vc[key];
    return {
      key,
      label,
      variance: fmt(v.variance, 4, lang),
      sigma: fmt(v.sigma, 4, lang),
      studyVar: fmt(v.studyVar, 4, lang),
      pctContribution: fmt(v.pctContribution, 4, lang),
      pctStudyVar: fmt(v.pctStudyVar, 4, lang),
      pctTolerance: v.pctTolerance != null ? fmt(v.pctTolerance, 4, lang) : '–',
      pctProcess: v.pctProcess != null ? fmt(v.pctProcess, 4, lang) : '–',
      totalClass: key === 'total' ? 'msa-typ2__anova-total' : '',
    };
  });
}

/**
 * Balkendiagramm der Variationskomponenten.
 * @param {any} r Ergebnis @param {(key: string) => string} t
 * @returns {object|null}
 */
export function componentsChart(r, t) {
  if (!r) return null;
  const vc = r.varComp;
  const keys = ['grr', 'repeatability', 'reproducibility', 'part'];
  const groups = [
    { name: `%${t('contribution')}`, values: keys.map((k) => orZero(vc[k].pctContribution)), color: 'var(--color-chart-1)' },
    { name: `%${t('studyVar')}`, values: keys.map((k) => orZero(vc[k].pctStudyVar)), color: 'var(--color-chart-2)' },
  ];
  if (vc.grr.pctTolerance != null) {
    groups.push({ name: `%${t('tolerance')}`, values: keys.map((k) => orZero(vc[k].pctTolerance)), color: 'var(--color-chart-3)' });
  }
  return {
    categories: [t('gageRR'), t('repeatability'), t('reproducibility'), t('partToPartVar')],
    groups, yLabel: '%', yMin: 0, showLegend: true,
  };
}

/**
 * Streudiagramm der Messwerte je Teil (Farbe je Prüfer) mit Teilmittelwerten.
 * @param {any} r Ergebnis @param {(key: string) => string} t
 * @returns {object|null}
 */
export function byPartChart(r, t) {
  if (!r) return null;
  /** @type {Record<string, number>} */
  const partIndex = {};
  r.partLabels.forEach((pl, i) => { partIndex[pl] = i; });
  /** @param {(pl: string) => number[]} valuesOf */
  const points = (valuesOf) => {
    const x = [], y = [];
    for (const pl of r.partLabels) {
      for (const v of valuesOf(pl)) { x.push(partIndex[pl]); y.push(orNull(v)); }
    }
    return { x, y };
  };
  let series;
  if (r.mode === 'typ3') {
    series = [{ name: t('chartValues'), color: 'var(--color-chart-1)', ...points((pl) => r.cellData[pl]), symbol: 'circle', strokeWidth: 1.5 }];
  } else {
    const colors = operatorColors(r.o);
    series = r.operatorLabels.map((op, oi) => ({
      name: op, color: colors[oi], ...points((pl) => r.cellData[pl][op]), symbol: 'circle', strokeWidth: 1.5,
    }));
  }
  series.push({
    name: 'x̄ Part',
    color: 'var(--color-text-secondary)',
    x: r.partLabels.map((_, i) => i),
    y: r.partLabels.map((pl) => orNull(r.partMeans[pl])),
    symbol: 'diamond', strokeWidth: 1,
    connectLine: { show: true, width: 1.5, dash: 'dot', color: 'var(--color-text-secondary)' },
  });
  return {
    showLegend: true,
    xLabel: t('partLabel'),
    xMin: -0.5,
    xMax: r.partLabels.length - 0.5,
    series,
    moduleRefLines: [{ dir: 'h', value: r.grandMean, label: 'x̄', dash: 'dash', color: 'var(--color-info)' }],
  };
}

/**
 * Boxplot der Messwerte je Prüfer; bei Typ 3 keiner.
 * @param {any} r Ergebnis @param {(key: string) => string} t
 * @returns {object|null}
 */
export function byOperatorChart(r, t) {
  if (!r || r.mode === 'typ3') return null;
  const colors = operatorColors(r.o);
  const groups = r.operatorLabels.map((op, oi) => {
    const values = [];
    for (const pl of r.partLabels) values.push(...r.cellData[pl][op]);
    return { name: op, values, color: colors[oi] };
  });
  return {
    groups,
    showMean: true,
    showOutliers: true,
    showLegend: false,
    xLabel: t('operatorLabel'),
    moduleRefLines: [{ dir: 'v', value: r.grandMean, label: 'x̄', dash: 'dash', color: 'var(--color-info)' }],
  };
}

/**
 * Wechselwirkung Teil × Prüfer: Zellmittel je Prüfer über die Teile; bei Typ 3 keine.
 * @param {any} r Ergebnis @param {(key: string) => string} t
 * @returns {object|null}
 */
export function interactionChart(r, t) {
  if (!r || r.mode === 'typ3') return null;
  const colors = operatorColors(r.o);
  const series = r.operatorLabels.map((op, oi) => ({
    name: op,
    color: colors[oi],
    x: r.partLabels.map((_, i) => i),
    y: r.partLabels.map((pl) => orNull(r.cellMeans[pl][op])),
    symbol: 'circle', strokeWidth: 1.5,
    connectLine: { show: true, width: 1.5, dash: 'solid', color: colors[oi] },
  }));
  return {
    showLegend: true,
    xLabel: t('partLabel'),
    xMin: -0.5,
    xMax: r.partLabels.length - 0.5,
    series,
  };
}

/**
 * Werte je Untergruppe in Kartenreihenfolge: Prüfer für Prüfer über alle Teile.
 * @param {any} r Ergebnis @param {Record<string, any>} cells Zellmittel oder -spannweiten
 * @returns {{ x: number[], y: Array<number|null> }}
 */
function subgroupSeries(r, cells) {
  const y = [];
  if (r.mode === 'typ3') {
    for (const pl of r.partLabels) y.push(orNull(cells[pl]));
  } else {
    for (const op of r.operatorLabels) {
      for (const pl of r.partLabels) y.push(orNull(cells[pl][op]));
    }
  }
  return { x: y.map((_, i) => i), y };
}

/**
 * Regelkarte (x̄ oder R) mit Mittellinie und Eingriffsgrenzen.
 * @param {string} name Reihenname und y-Beschriftung
 * @param {{ x: number[], y: Array<number|null> }} pts
 * @param {[number, number, number]} limits UCL, CL, LCL
 * @returns {object}
 */
function controlChart(name, pts, [ucl, cl, lcl]) {
  return {
    showLegend: false,
    xLabel: '',
    yLabel: name,
    series: [{
      name,
      color: 'var(--color-text-primary)',
      ...pts,
      symbol: 'circle', strokeWidth: 1,
      connectLine: { show: true, width: 1, dash: 'solid', color: 'var(--color-text-secondary)' },
    }],
    moduleRefLines: [
      { dir: 'h', value: ucl, label: 'UCL', dash: 'dash', color: 'var(--color-error)' },
      { dir: 'h', value: cl, label: 'CL', dash: 'dash', color: 'var(--color-success)' },
      { dir: 'h', value: lcl, label: 'LCL', dash: 'dash', color: 'var(--color-error)' },
    ],
  };
}

/**
 * x̄-Karte nach Prüfer.
 * @param {any} r Ergebnis
 * @returns {object|null}
 */
export function xbarChart(r) {
  if (!r) return null;
  const c = r.controlChart;
  return controlChart('x̄', subgroupSeries(r, r.cellMeans), [c.xbarUCL, c.xbarCL, c.xbarLCL]);
}

/**
 * R-Karte nach Prüfer.
 * @param {any} r Ergebnis
 * @returns {object|null}
 */
export function rChart(r) {
  if (!r) return null;
  const c = r.controlChart;
  return controlChart('R', subgroupSeries(r, r.cellRanges), [c.rUCL, c.rCL, c.rLCL]);
}

/**
 * Das Messverlaufsdiagramm als Streifen zu je `PER_ROW` Prüfeinheiten: gemeinsame
 * y-Domäne und Referenzlinie, Prüfer in fester Reihenfolge, X-Beschriftung nur
 * am letzten Streifen, Legende auf jedem Streifen (sonst fluchten die Felder
 * nicht), wenn es mehr als einen Prüfer gibt. Die Felder entstehen aus den
 * Zellen der Engine, zeigen also genau die gerechneten Zeilen. Typ 3 hat keine
 * Prüferserien und darum keinen Streifen.
 * @param {any} r Ergebnis @param {(key: string) => string} t
 * @returns {Array<{ key: string, config: object, legacyEditKey: string }>}
 */
export function runStrips(r, t) {
  if (!r) return [];
  const g = panelsFromCells(r.partLabels, r.operatorLabels, r.cellData);
  if (!g.n) return [];
  const rows = splitPanelRows(g.panels, PER_ROW);
  return rows.map((panels, i) => {
    const isLast = i === rows.length - 1;
    return {
      key: `strip-${i}`,
      legacyEditKey: i === 0 ? 'gage-run-chart' : `gage-run-chart#${i + 1}`,
      config: {
        title: '',
        showTitle: false,
        xLabel: isLast ? t('parts') : '',
        showXLabel: isLast,
        yLabel: t('measurementColumn'),
        showLegend: g.operators.length > 1,
        panels: panels.map((p) => ({
          part: p.part,
          series: p.series.map((s) => ({ operator: s.operator, values: s.values, mean: orNull(s.mean) })),
        })),
        operators: g.operators,
        refValue: orNull(g.grandMean),
        refLabel: t('chartGageRunMean'),
        showOperatorMean: false,
        connectWithin: true,
        sharedYMin: g.yMin,
        sharedYMax: g.yMax,
      },
    };
  });
}
