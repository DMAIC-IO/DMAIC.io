/**
 * Survey builder: the evaluation part of the results tab in the browser —
 * filter, summary, group comparison, question blocks and their charts — with
 * the real module and the real template.
 *
 * The lines, rows and charts of the example are compared with what the
 * earlier results viewmodel showed, frozen in fixtures/legacy-oracles.json
 * (entries `resultsView.example.<variant>`, recorded by
 * fixtures/generate-legacy-oracles.mjs).
 */
import { suite, test, assert, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { mount, stored, settle, until, pick, de, helpEntry } from './view-harness.js';
import ChartManager from '../../../js/core/chart/chart-manager.js';
import { setFields } from '../../../js/core/model.js';

/** @param {string} path relative to this file @returns {Promise<any>} */
async function loadJson(path) {
  return (await fetch(new URL(path, import.meta.url), { cache: 'no-cache' })).json();
}

const EXAMPLE = await loadJson('../../../examples/projects/survey-builder-software.json');
const ORACLES = await loadJson('./fixtures/legacy-oracles.json');

/** The variants of the frozen reference: filter and grouping of `ui`. */
const VARIANTS = {
  all: {},
  grouped: { groupBy: 'q-group' },
  filtered: { filter: { questionId: 'q-erp', optionId: 'o-dynamics' }, groupBy: 'q-group' },
};

/**
 * A fresh copy of the example project on the results tab.
 * @param {object} [ui] filter and grouping
 * @returns {any}
 */
function example(ui = {}) {
  const json = JSON.parse(JSON.stringify(EXAMPLE));
  json.ui = { ...json.ui, ...ui, tab: 'results' };
  return json;
}

/** @param {Element|null} el @returns {boolean} neither it nor an ancestor is hidden by `x-show` */
function shown(el) {
  for (let n = el; n; n = n.parentElement) if (/** @type {HTMLElement} */ (n).style?.display === 'none') return false;
  return Boolean(el);
}

/** @param {Element|null} el @returns {string[]} the trimmed texts of its cells, per row */
const tableTexts = (el) => [...(el?.querySelectorAll('tbody tr') ?? [])].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()));

/** The module's own stylesheet, once (the charts take their height from it). */
function provideStyle() {
  if (document.querySelector('link[data-survey-builder-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('../../../js/modules/survey-builder/resources/style.css', import.meta.url).href;
  link.setAttribute('data-survey-builder-style', '');
  document.head.append(link);
}

/** One rating question with `n` rows and one response rating every row. */
function manyRatings(n) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, text: `Zeile ${i + 1}` }));
  const ratings = Object.fromEntries(rows.map((r, i) => [r.id, (i % 5) + 1]));
  return stored({
    survey: {
      version: 1,
      sections: [{
        id: 's1', title: '', hint: '', when: null, questions: [
          { id: 'q1', type: 'rating', text: 'Bewertung', hint: '', required: false, when: null, rows },
        ],
      }],
    },
    responses: [{ id: 'resp1', surveyVersion: 1, recipientId: null, viaRecipient: false, submittedAt: '2026-10-02T08:00:00.000Z', answers: { q1: { ratings } } }],
    tab: 'results',
  });
}

suite('survey-builder results: filter and grouping', () => {
  test('a filter narrows the figures, the response rate stays', async () => {
    const h = await mount(example());
    const rateBefore = h.$('[data-ref="rateLine"]').textContent;
    assertEqual(h.$('[data-ref="nLine"]').textContent, de('report.nResponses', { n: 6 }));
    pick(h.$('[data-ref="filter"]'), 'q-erp|o-dynamics');
    await settle();
    assertDeepEqual(h.calls('setFilter'), [{ questionId: 'q-erp', optionId: 'o-dynamics' }]);
    assertDeepEqual(h.vm().model.ui.filter, { questionId: 'q-erp', optionId: 'o-dynamics' });
    assertEqual(h.vm().results.n, 1);
    assertEqual(h.$('[data-ref="nLine"]').textContent, de('report.nResponses', { n: 1 }));
    assertEqual(h.$('[data-ref="rateLine"]').textContent, rateBefore);
    assertEqual(h.$('[data-ref="filter"]').value, 'q-erp|o-dynamics');
    pick(h.$('[data-ref="filter"]'), '');
    await settle();
    assertDeepEqual(h.calls('setFilter')[1], { questionId: null, optionId: null });
    assertEqual(h.vm().model.ui.filter, null);
    assertEqual(h.$('[data-ref="nLine"]').textContent, de('report.nResponses', { n: 6 }));
  });

  test('grouping shows one bar group per group in the chart colours, and the comparison table', async () => {
    const h = await mount(example());
    assertEqual(shown(h.$('[data-ref="groups"]')), false);
    pick(h.$('[data-ref="groupBy"]'), 'q-group');
    await settle();
    assertDeepEqual(h.calls('setGroupBy'), [{ questionId: 'q-group' }]);
    assertTrue(shown(h.$('[data-ref="groups"]')), 'comparison shown');
    const cell = h.vm().chartCells.find((c) => c.key === 'g:q-erp');
    assertTrue(Boolean(cell), 'group chart of q-erp');
    assertEqual(cell.kind, 'bar');
    assertDeepEqual(cell.config.groups.map((g) => g.name), ['Handel', 'Industrie']);
    assertDeepEqual(cell.config.groups.map((g) => g.color), ['var(--color-chart-1)', 'var(--color-chart-2)']);
    assertEqual(cell.config.showLegend, true);
    assertDeepEqual(h.$$('[data-ref="groupHeads"] li').map((li) => li.textContent), ORACLES['resultsView.example.grouped'].groupHeads.map((g) => g.label));
    pick(h.$('[data-ref="groupBy"]'), '');
    await settle();
    assertDeepEqual(h.calls('setGroupBy')[1], { questionId: null });
    assertEqual(h.vm().chartCells.some((c) => c.key.startsWith('g:')), false);
  });

  test('a failing filter command is logged and reported, the select shows the filter again', async () => {
    const h = await mount(example());
    const ui = h.vm()._ui;
    const real = ui.model.setFilter;
    const boom = new Error('kaputt');
    ui.model.setFilter = () => { throw boom; };
    const warns = [];
    const warn = console.warn;
    console.warn = (...a) => warns.push(a);
    try {
      pick(h.$('[data-ref="filter"]'), 'q-erp|o-sap');
      await settle();
    } finally {
      console.warn = warn;
      ui.model.setFilter = real;
    }
    assertEqual(warns.length, 1);
    assertEqual(warns[0][1], boom);
    assertDeepEqual(h.notes, [[de('commandFailed'), 'error']]);
    assertEqual(h.$('[data-ref="filter"]').value, '');
    assertEqual(h.vm().model.ui.filter, null);
  });
});

suite('survey-builder results: same as before', () => {
  for (const [variant, ui] of Object.entries(VARIANTS)) {
    test(`chartCells of the example (${variant}) are the earlier chartJobs: overview, groups, questions`, async () => {
      const h = await mount(example(ui));
      const want = ORACLES[`resultsView.example.${variant}`].chartJobs.map((j) => ({ key: j.key, kind: j.type, config: j.config }));
      const got = JSON.parse(JSON.stringify(h.vm().chartCells));
      assertDeepEqual(got.map((c) => c.key), want.map((c) => c.key));
      assertDeepEqual(got, want);
    });

    test(`lines and rows of the example (${variant}) are the earlier ones`, async () => {
      const h = await mount(example(ui));
      const want = ORACLES[`resultsView.example.${variant}`];
      const vm = h.vm();
      assertDeepEqual(JSON.parse(JSON.stringify(vm.filterOptions)), want.filterOptions);
      assertEqual(h.$('[data-ref="filter"]').value, want.filterValue);
      assertEqual(h.$('[data-ref="nLine"]').textContent, want.nLine);
      assertEqual(h.$('[data-ref="rateLine"]').textContent, want.rateLine);
      assertEqual(shown(h.$('[data-ref="withoutRecipient"]')), want.hasWithoutRecipient);
      assertEqual(h.$('[data-ref="withoutRecipient"]').textContent, want.withoutRecipientLine);
      assertEqual(shown(h.$('[data-ref="rateGroups"]')), want.hasRateGroups);
      assertDeepEqual(tableTexts(h.$('[data-ref="rateGroups"]')), want.rateGroups.map((g) => [g.group, String(g.sent), String(g.answered), g.rate]));
      assertDeepEqual(tableTexts(h.$('[data-ref="ranking"]')), want.rankingRows.map((r) => [r.text, String(r.n), r.mean, r.top]));
      assertDeepEqual(tableTexts(h.$('[data-ref="kanoOverview"]')), want.kanoOverviewRows.map((k) => [k.text, k.category, k.cs, k.ds]));
      assertEqual(h.$('[data-ref="freeText"]').textContent, want.freeTextLine);
      assertDeepEqual(JSON.parse(JSON.stringify(vm.groupByOptions)), want.groupByOptions);
      assertEqual(h.$('[data-ref="groups"] .survey-builder__subtitle').textContent, want.groupsTitle);
      assertDeepEqual(JSON.parse(JSON.stringify(vm.comparisonParts)), want.comparisonParts);
      const parts = h.$$('[data-group-question-id]');
      assertDeepEqual(parts.map((p) => p.getAttribute('data-group-question-id')), want.comparisonParts.map((p) => p.questionId));
      for (const [i, part] of want.comparisonParts.entries()) {
        const rows = [...parts[i].querySelectorAll('tbody tr')].map((tr) => [
          tr.querySelector('[data-ref="label"]').textContent, tr.querySelector('[data-ref="note"]').textContent,
          ...[...tr.querySelectorAll('[data-ref="cell"]')].map((td) => td.textContent),
        ]);
        assertDeepEqual(rows, part.rows.map((r) => [r.label, r.note, ...r.cells.map((c) => c.text)]));
      }
      const blocks = h.$$('[data-ref="blocks"] > [data-question-id]');
      assertDeepEqual(blocks.map((b) => [b.getAttribute('data-question-id'), b.querySelector('.survey-builder__block-title').textContent, b.querySelector('[data-ref="blockN"]').textContent]),
        want.blocks.map((b) => [b.key, b.title, b.n]));
    });
  }

  test('Kano categories read the module\'s own kano.cat* texts, never modules.kano', async () => {
    const asked = [];
    const watch = (base) => ({
      ...base,
      t: (k, p) => { asked.push(k); return base.t(k, p); },
      tf: (...a) => { const f = base.tf(...a); return (k, p) => { asked.push(k); return f(k, p); }; },
    });
    const h = await mount(example({ groupBy: 'q-group' }), { i18n: watch });
    const cats = new Set(['M', 'O', 'A', 'I', 'R', 'Q'].map((c) => de(`kano.cat${c}`)));
    const overview = tableTexts(h.$('[data-ref="kanoOverview"]')).map((r) => r[1]);
    assertTrue(overview.length > 0 && overview.every((c) => cats.has(c) || c === '—'), overview.join(','));
    const block = h.$('[data-ref="blocks"] [data-question-id="q-kano"]');
    const inBlock = [...block.querySelectorAll('[data-ref="category"]')].map((td) => td.textContent);
    assertTrue(inBlock.length === 3 && inBlock.every((c) => cats.has(c) || c === '—'), inBlock.join(','));
    const scatter = h.vm().chartCells.find((c) => c.key === 'kano-overview');
    assertEqual(scatter.config.xLabel, de('kano.chartX'));
    assertEqual(scatter.config.yLabel, de('kano.chartY'));
    assertTrue(asked.some((k) => /^kano\.cat[MOAIRQ]$/.test(k)), 'the module asked for its own kano.cat* texts');
    assertEqual(asked.filter((k) => k.startsWith('modules.kano')).length, 0, asked.filter((k) => k.startsWith('modules.kano')).join(','));
  });
});

suite('survey-builder results: summary', () => {
  test('the ranking shows ten rows, opens to all and closes again (state.rankingOpen)', async () => {
    const h = await mount(manyRatings(12));
    const toggle = h.$('[data-ref="rankingToggle"]');
    assertEqual(tableTexts(h.$('[data-ref="ranking"]')).length, 10);
    assertTrue(shown(toggle), 'toggle shown');
    assertEqual(toggle.textContent, de('rankingAll', { count: 12 }));
    toggle.click();
    await settle();
    assertEqual(h.vm().state.rankingOpen, true);
    assertEqual(tableTexts(h.$('[data-ref="ranking"]')).length, 12);
    assertEqual(toggle.textContent, de('rankingTop', { count: 10 }));
    toggle.click();
    await settle();
    assertEqual(h.vm().state.rankingOpen, false);
    assertEqual(tableTexts(h.$('[data-ref="ranking"]')).length, 10);
    assertEqual(shown(h.$('[data-ref="ranking"]')), true);
  });

  test('"Freitexte mit Namen" binds model.ui.reportWithNames and is hidden for an anonymous survey', async () => {
    const h = await mount(example());
    const box = h.$('[data-ref="reportWithNames"]');
    assertTrue(shown(box), 'switch shown');
    assertEqual(box.checked, false);
    box.click();
    await settle();
    assertEqual(h.vm().model.ui.reportWithNames, true);
    setFields(h.vm().model, { ui: { ...h.vm().model.ui, reportWithNames: false } });
    await settle();
    assertEqual(box.checked, false);
    const json = example();
    json.survey.anonymous = true;
    const a = await mount(json);
    assertEqual(shown(a.$('[data-ref="reportWithNamesLabel"]')), false);
  });

  test('question blocks show the option, rating and Kano tables and the answers, names only when not anonymous', async () => {
    const h = await mount(example());
    const group = h.$('[data-ref="blocks"] [data-question-id="q-group"]');
    const stats = h.vm().results.questions.find((q) => q.questionId === 'q-group');
    assertDeepEqual(tableTexts(group).filter((r, i) => i < stats.options.length).map((r) => r[0]), stats.options.map((o) => o.text));
    const rating = h.$('[data-ref="blocks"] [data-question-id="q-rating"]');
    assertEqual(tableTexts(rating).length, 3);
    const wish = h.$('[data-ref="blocks"] [data-question-id="q-wish"]');
    const texts = [...wish.querySelectorAll('[data-ref="answerText"]')].map((s) => s.textContent);
    const want = h.vm().results.questions.find((q) => q.questionId === 'q-wish').answers.filter((a) => a.text.trim()).map((a) => a.text.trim());
    assertDeepEqual(texts, want);
    assertEqual(shown(wish.querySelector('[data-ref="textEmpty"]')), want.length === 0);
    const names = [...wish.querySelectorAll('[data-ref="answerName"]')].filter(shown).map((s) => s.textContent);
    assertTrue(names.length > 0, 'names shown');
    const json = example();
    json.survey.anonymous = true;
    const a = await mount(json);
    assertEqual([...a.$('[data-ref="blocks"] [data-question-id="q-wish"]').querySelectorAll('[data-ref="answerName"]')].filter(shown).length, 0);
  });
});

suite('survey-builder results: charts', () => {
  test('the widgets draw inside x-for with a height > 0, one per chart cell', async () => {
    provideStyle();
    const h = await mount(example({ groupBy: 'q-group' }), { chartManager: (bus, i18n) => new ChartManager(bus, i18n) });
    const keys = h.vm().chartCells.map((c) => c.key);
    await until(() => keys.every((k) => h.$(`[data-chart="${k}"] svg`)));
    for (const k of keys) {
      const svg = h.$(`[data-chart="${k}"] svg`);
      assertTrue(Boolean(svg), `no chart for ${k}`);
      const height = svg.getBoundingClientRect().height;
      assertTrue(height > 0, `${k}: height ${height}`);
    }
    assertEqual(h.$$('[data-chart]').length, keys.length);
  });

  test('charts only exist on the results tab', async () => {
    const json = example();
    json.ui.tab = 'draft';
    const h = await mount(json);
    assertEqual(h.$$('[data-chart]').length, 0);
    assertTrue(h.vm().chartCells.length > 0, 'cells are there');
    h.$('[data-tab="results"]').click();
    await settle();
    assertEqual(h.vm().model.tab, 'results');
    assertEqual(h.$$('[data-chart]').length, h.vm().chartCells.length);
  });

  test('no functions and no NaN in the chart configurations', async () => {
    const h = await mount(example({ groupBy: 'q-group' }));
    const walk = (v, path) => {
      assert(typeof v !== 'function', `function at ${path}`);
      assert(!(typeof v === 'number' && Number.isNaN(v)), `NaN at ${path}`);
      if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    };
    walk(h.vm().chartCells, 'chartCells');
  });
});

suite('survey-builder results: help badges', () => {
  test('every caption of the evaluation has a help key that exists', async () => {
    const h = await mount(example({ groupBy: 'q-group' }));
    const part = h.$('[data-ref="evaluation"]');
    const captions = [...part.querySelectorAll('label, th, .dmike-kpi-label')]
      .filter((el) => el.textContent.trim() && !el.closest('[data-group-question-id]'));
    assertTrue(captions.length >= 10, `captions: ${captions.length}`);
    for (const el of captions) {
      const key = el.getAttribute('data-help-key') || el.querySelector('[data-help-key]:not([data-help-key=""])')?.getAttribute('data-help-key');
      assertTrue(Boolean(key), `no help key: ${el.outerHTML.slice(0, 120)}`);
    }
    for (const el of [...part.querySelectorAll('[data-help-key]')].filter((e) => e.getAttribute('data-help-key'))) {
      const key = el.getAttribute('data-help-key');
      assertTrue(key.startsWith('modules.survey-builder.'), key);
      const entry = helpEntry(key.slice('modules.survey-builder.'.length).replace(/\.help$/, ''));
      assertTrue(Boolean(entry && (typeof entry === 'string' || entry.help)), `help text missing: ${key}`);
      assertEqual(el.parentElement.closest('[data-help-key]:not([data-help-key=""])'), null, `badge inside a badge: ${key}`);
    }
  });
});
