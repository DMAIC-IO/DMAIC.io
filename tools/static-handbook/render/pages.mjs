/**
 * Page generators for the static handbook.
 *
 *   - renderModulePage   — one full module handbook page
 *   - renderAlgoPage     — one algorithm lab page
 *   - renderLangIndex    — /{lang}/index.html (DMAIC overview with all modules)
 *   - renderPhaseIndex   — optional per-phase landing (currently unused, kept simple)
 *   - renderLabIndex     — /{lang}/lab/index.html (category grid of algorithms)
 *   - renderLangPicker   — /index.html (DE/EN language chooser)
 */

import { renderPage, getStrings, CONSTANTS } from './page-shell.mjs';
import { renderBlocks, firstParagraphText } from './blocks.mjs';
import { escapeHtml, escapeAttr, pick } from './escape.mjs';
import { getModuleName } from '../loaders/load-sources.mjs';
import { renderLatex } from './katex.mjs';
import { CYCLES, getCycle, getPhaseIds } from '../../../js/core/cycles/cycles.js';

const SECTION_ORDER = [
  'overview',
  'methodology',
  'whenToUse',
  'whenNotToUse',
  'workflow',
  'example',
  'interpretation',
  'advanced',
  'pitfalls',
];

// ─── Module page ─────────────────────────────────────────────────

export function renderModulePage({ module, lang, i18n }) {
  const s = getStrings(lang);
  const { id, phase, help, cycles: moduleCycles } = module;

  const name = getModuleName(id, i18n, lang);
  const i18nEntry = i18n?.[lang]?.modules?.[id];
  const tagline = i18nEntry?.description || '';

  const sections = help.sections || {};

  // Render in canonical SECTION_ORDER first, then any extra section keys
  // the module defines (in their declared order) so new section names
  // (e.g. `columnRoles`) don't get silently dropped.
  const known = new Set(SECTION_ORDER);
  const extras = Object.keys(sections).filter(k => !known.has(k));
  const orderedKeys = [...SECTION_ORDER, ...extras];

  const sectionHtmlParts = [];
  let leadText = tagline;

  for (const key of orderedKeys) {
    if (!sections[key]) continue;
    const localized = sections[key][lang] || sections[key].en || sections[key].de;
    if (!localized) continue;

    if (!leadText) {
      const first = firstParagraphText(localized.blocks);
      if (first) leadText = first;
    }

    const heading = localized.title || s.sectionHeadings[key] || key;
    sectionHtmlParts.push(
      `<section class="handbook-section" id="${escapeAttr(key)}"><h2>${escapeHtml(heading)}</h2>${renderBlocks(localized.blocks)}</section>`,
    );
  }

  const phaseLabel = s.phase[phase] || phase;
  const pathFromRoot = `/${lang}/${phase}/${id}.html`;
  const altLang = lang === 'de' ? 'en' : 'de';
  const altPathFromRoot = `/${altLang}/${phase}/${id}.html`;

  const title = `${name} — ${phaseLabel} — ${s.handbookTitle}`;
  const description = leadText || `${name} — ${phaseLabel} — ${s.handbookTitle}`;

  // ─── Per-cycle assignments (DMAIC, DMADV, …) ──────────────
  // Show every cycle this module is part of so cross-cycle users see where
  // it lands. Data modules are cycle-independent — skip the section.
  let cyclesSectionHtml = '';
  if (phase !== 'data') {
    const cycleRows = [];
    for (const c of Object.values(CYCLES)) {
      const mapping = moduleCycles?.[c.id];
      const cycleName = i18n?.[lang]?.cycles?.[c.id]?.name || c.id.toUpperCase();
      if (mapping?.phase) {
        const targetPhaseLabel = s.phase[mapping.phase] || mapping.phase;
        cycleRows.push(`<li><strong>${escapeHtml(cycleName)}</strong>: ${escapeHtml(targetPhaseLabel)}</li>`);
      } else {
        cycleRows.push(`<li>${escapeHtml(s.moduleCyclesUnmappedIn.replace('{cycle}', cycleName))}</li>`);
      }
    }
    if (cycleRows.length > 0) {
      cyclesSectionHtml = `<section class="handbook-section" id="cycles"><h2>${escapeHtml(s.moduleCyclesHeading)}</h2><ul>${cycleRows.join('')}</ul></section>`;
    }
  }

  const body = `
<article class="handbook-article">
  <span class="handbook-article__tag">${escapeHtml(phaseLabel)}</span>
  <h1>${escapeHtml(name)}</h1>
  ${leadText ? `<p class="handbook-article__lead">${escapeHtml(leadText)}</p>` : ''}
  ${sectionHtmlParts.join('\n')}
  ${cyclesSectionHtml}
</article>`;

  const html = renderPage({
    lang,
    title,
    description,
    pathFromRoot,
    altPathFromRoot,
    breadcrumbs: [
      { label: s.handbookTitle, href: `/${lang}/` },
      { label: phaseLabel, href: `/${lang}/#${phase}` },
      { label: name },
    ],
    bodyHtml: body,
    headingKey: name,
  });

  return { html, pathFromRoot, altPathFromRoot };
}

// ─── Algorithm page ──────────────────────────────────────────────

export async function renderAlgoPage({ algorithm, lang, categoryById, i18n }) {
  const s = getStrings(lang);
  const category = categoryById.get(algorithm.category);
  const categoryName = category ? pick(category.name, lang) : algorithm.category;
  const name = pick(algorithm.name, lang);
  const short = pick(algorithm.description?.short, lang);
  const long = pick(algorithm.description?.long, lang);

  const pathFromRoot = `/${lang}/lab/${algorithm.category}/${algorithm.id}.html`;
  const altLang = lang === 'de' ? 'en' : 'de';
  const altPathFromRoot = `/${altLang}/lab/${algorithm.category}/${algorithm.id}.html`;

  const title = `${name} — ${categoryName} — ${s.breadcrumbLab} — DMAIC.io`;
  const description = short || long.slice(0, 160);

  // Meta row
  const metaItems = [];
  if (algorithm.status) {
    metaItems.push(`<div class="algo-meta__item"><span class="algo-meta__label">Status</span><span class="algo-meta__value">${escapeHtml(algorithm.status)}</span></div>`);
  }
  if (algorithm.version) {
    metaItems.push(`<div class="algo-meta__item"><span class="algo-meta__label">Version</span><span class="algo-meta__value">${escapeHtml(algorithm.version)}</span></div>`);
  }
  if (algorithm.documentation?.minitab_equivalent) {
    metaItems.push(`<div class="algo-meta__item"><span class="algo-meta__label">${escapeHtml(s.algoMinitab)}</span><span class="algo-meta__value">${escapeHtml(algorithm.documentation.minitab_equivalent)}</span></div>`);
  }
  const metaHtml = metaItems.length
    ? `<div class="algo-meta">${metaItems.join('')}</div>`
    : '';

  // Formulas — rendered with KaTeX SSR so search engines see the math.
  const formulas = algorithm.documentation?.formulas || [];
  const renderedFormulas = await Promise.all(
    formulas.map(async (f) => {
      const label = escapeHtml(f.label || '');
      const desc = escapeHtml(pick(f.description, lang));
      const math = f.latex ? await renderLatex(f.latex, { displayMode: true }) : '';
      return `<figure class="algo-formula">${
        label ? `<span class="algo-formula__label">${label}</span>` : ''
      }<div class="algo-formula__math">${math}</div>${
        desc ? `<figcaption class="algo-formula__desc">${desc}</figcaption>` : ''
      }</figure>`;
    }),
  );
  const formulasHtml = formulas.length
    ? `<section class="handbook-section"><h2>${escapeHtml(s.algoFormulas)}</h2>${renderedFormulas.join('')}</section>`
    : '';

  // Assumptions
  const assumptions = algorithm.documentation?.assumptions || [];
  const assumptionsHtml = assumptions.length
    ? `<section class="handbook-section"><h2>${escapeHtml(s.algoAssumptions)}</h2><ul class="handbook-block__list">${
        assumptions.map((a) => `<li>${escapeHtml(pick(a, lang))}</li>`).join('')
      }</ul></section>`
    : '';

  // Limitations
  const limitations = algorithm.documentation?.limitations || [];
  const limitationsHtml = limitations.length
    ? `<section class="handbook-section"><h2>${escapeHtml(s.algoLimitations)}</h2><ul class="handbook-block__list">${
        limitations.map((l) => `<li>${escapeHtml(pick(l, lang))}</li>`).join('')
      }</ul></section>`
    : '';

  // References
  const references = algorithm.documentation?.references || [];
  const referencesHtml = references.length
    ? `<section class="handbook-section"><h2>${escapeHtml(s.algoReferences)}</h2><ul class="algo-references">${
        references
          .map((r) => {
            const src = escapeHtml(r.source || '');
            const chap = r.chapter ? ` — ${escapeHtml(r.chapter)}` : '';
            return `<li>${src}${chap}</li>`;
          })
          .join('')
      }</ul></section>`
    : '';

  const body = `
<article class="handbook-article">
  <span class="handbook-article__tag">${escapeHtml(categoryName)}</span>
  <h1>${escapeHtml(name)}</h1>
  ${short ? `<p class="handbook-article__lead">${escapeHtml(short)}</p>` : ''}
  ${metaHtml}
  ${long ? `<section class="handbook-section"><h2>${escapeHtml(s.algoLong)}</h2><p>${escapeHtml(long)}</p></section>` : ''}
  ${formulasHtml}
  ${assumptionsHtml}
  ${limitationsHtml}
  ${referencesHtml}
</article>`;

  const html = renderPage({
    lang,
    title,
    description,
    pathFromRoot,
    altPathFromRoot,
    breadcrumbs: [
      { label: s.handbookTitle, href: `/${lang}/` },
      { label: s.breadcrumbLab, href: `/${lang}/lab/` },
      { label: categoryName, href: `/${lang}/lab/#${algorithm.category}` },
      { label: name },
    ],
    bodyHtml: body,
    headingKey: name,
    needsKatex: formulas.length > 0,
  });

  return { html, pathFromRoot, altPathFromRoot };
}

// ─── Per-cycle index (/{lang}/cycles/{cycleId}/) ─────────────────

/**
 * Render a per-cycle overview page that groups modules by the cycle's own
 * methodology phases. Modules without a mapping for this cycle are listed
 * under "Weitere" — mirrors the in-app `extras` tile.
 */
export function renderCycleIndex({ cycleId, modules, lang, i18n }) {
  const s = getStrings(lang);
  const cycle = getCycle(cycleId);
  const pathFromRoot = `/${lang}/cycles/${cycleId}/index.html`;
  const altLang = lang === 'de' ? 'en' : 'de';
  const altPathFromRoot = `/${altLang}/cycles/${cycleId}/index.html`;

  const cycleI18n = i18n?.[lang]?.cycles?.[cycleId] || {};
  const cycleName = cycleI18n.name || cycleId.toUpperCase();
  const cycleShort = cycleI18n.short || '';
  const cycleDesc = cycleI18n.description || '';

  // Bucket modules by this cycle's mapping.
  const byPhase = new Map();
  const dataMods = [];
  const extrasMods = [];
  for (const id of getPhaseIds(cycleId)) byPhase.set(id, []);
  for (const mod of modules) {
    if (mod.phase === 'data') { dataMods.push(mod); continue; }
    const target = mod.cycles?.[cycleId]?.phase;
    if (target && byPhase.has(target)) byPhase.get(target).push(mod);
    else extrasMods.push(mod);
  }

  const renderCard = (mod) => {
    const name = getModuleName(mod.id, i18n, lang);
    const i18nEntry = i18n?.[lang]?.modules?.[mod.id];
    let desc = i18nEntry?.description || '';
    if (!desc) {
      const overview = mod.help?.sections?.overview?.[lang] || mod.help?.sections?.overview?.en;
      if (overview) desc = firstParagraphText(overview.blocks);
    }
    // Module pages live under their DMAIC top-level phase — link there.
    const href = `/${lang}/${mod.phase}/${mod.id}.html`;
    return `<a class="handbook-card" href="${escapeAttr(href)}"><div class="handbook-card__title">${escapeHtml(name)}</div>${desc ? `<div class="handbook-card__desc">${escapeHtml(desc)}</div>` : ''}</a>`;
  };

  const groups = [];

  // Data tile (universal, present in every cycle)
  if (dataMods.length > 0) {
    const phaseLabel = s.phase.data;
    const phaseIntro = s.phaseIntro.data;
    groups.push(
      `<section class="handbook-phase-group" id="data"><h2>${escapeHtml(phaseLabel)}</h2><p>${escapeHtml(phaseIntro)}</p><div class="handbook-grid">${dataMods.map(renderCard).join('')}</div></section>`,
    );
  }

  // Methodology phases (in cycle order)
  for (const id of getPhaseIds(cycleId)) {
    const mods = byPhase.get(id) || [];
    if (mods.length === 0) continue;
    const phaseLabel = s.phase[id] || id;
    const phaseIntro = s.phaseIntro[id] || '';
    groups.push(
      `<section class="handbook-phase-group" id="${escapeAttr(id)}"><h2>${escapeHtml(phaseLabel)}</h2>${phaseIntro ? `<p>${escapeHtml(phaseIntro)}</p>` : ''}<div class="handbook-grid">${mods.map(renderCard).join('')}</div></section>`,
    );
  }

  // Extras (modules without mapping for this cycle)
  if (extrasMods.length > 0) {
    groups.push(
      `<section class="handbook-phase-group" id="extras"><h2>${escapeHtml(s.cycleExtrasHeading)}</h2><p>${escapeHtml(s.cycleExtrasIntro)}</p><div class="handbook-grid">${extrasMods.map(renderCard).join('')}</div></section>`,
    );
  }

  const body = `
<article class="handbook-article">
  <span class="handbook-article__tag">${escapeHtml(s.cyclesHeading)}</span>
  <h1>${escapeHtml(cycleName)}${cycleShort ? ` <span style="font-weight:400;font-size:0.6em;color:var(--text-muted)">${escapeHtml(cycleShort)}</span>` : ''}</h1>
  ${cycleDesc ? `<p class="handbook-article__lead">${escapeHtml(cycleDesc)}</p>` : ''}
  ${groups.join('\n')}
</article>`;

  const title = `${cycleName} — ${s.cyclesHeading} — ${s.handbookTitle}`;
  const description = cycleDesc || cycleShort || `${cycleName} — ${s.cyclesHeading}`;

  const html = renderPage({
    lang,
    title,
    description,
    pathFromRoot,
    altPathFromRoot,
    breadcrumbs: [
      { label: s.handbookTitle, href: `/${lang}/` },
      { label: s.cyclesHeading },
      { label: cycleName },
    ],
    bodyHtml: body,
    headingKey: cycleName,
  });

  return { html, pathFromRoot, altPathFromRoot };
}

// ─── Language index (DMAIC overview) ─────────────────────────────

export function renderLangIndex({ modules, lang, i18n }) {
  const s = getStrings(lang);
  const pathFromRoot = `/${lang}/index.html`;
  const altLang = lang === 'de' ? 'en' : 'de';
  const altPathFromRoot = `/${altLang}/index.html`;

  // Group by phase in DMAIC order.
  const groups = new Map();
  for (const phase of CONSTANTS.PHASES) groups.set(phase, []);
  for (const mod of modules) {
    if (!groups.has(mod.phase)) groups.set(mod.phase, []);
    groups.get(mod.phase).push(mod);
  }

  const groupHtmlParts = [];
  for (const phase of CONSTANTS.PHASES) {
    const mods = groups.get(phase) || [];
    if (mods.length === 0) continue;

    const phaseLabel = s.phase[phase] || phase;
    const phaseIntro = s.phaseIntro[phase] || '';

    const cards = mods.map((mod) => {
      const name = getModuleName(mod.id, i18n, lang);
      const i18nEntry = i18n?.[lang]?.modules?.[mod.id];
      let desc = i18nEntry?.description || '';
      if (!desc) {
        const overview = mod.help?.sections?.overview?.[lang] || mod.help?.sections?.overview?.en;
        if (overview) desc = firstParagraphText(overview.blocks);
      }
      const href = `./${phase}/${mod.id}.html`;
      return `<a class="handbook-card" href="${escapeAttr(href)}"><div class="handbook-card__title">${escapeHtml(name)}</div>${desc ? `<div class="handbook-card__desc">${escapeHtml(desc)}</div>` : ''}</a>`;
    }).join('');

    groupHtmlParts.push(
      `<section class="handbook-phase-group" id="${escapeAttr(phase)}">
        <h2>${escapeHtml(phaseLabel)}</h2>
        <p>${escapeHtml(phaseIntro)}</p>
        <div class="handbook-grid">${cards}</div>
      </section>`,
    );
  }

  // Cycle picker — links to the per-cycle overview pages.
  const cycleCards = Object.values(CYCLES).map(c => {
    const cycleI18n = i18n?.[lang]?.cycles?.[c.id] || {};
    const cycleName = cycleI18n.name || c.id.toUpperCase();
    const cycleShort = cycleI18n.short || '';
    const cycleDesc = cycleI18n.description || '';
    const href = `./cycles/${c.id}/`;
    return `<a class="handbook-card" href="${escapeAttr(href)}"><div class="handbook-card__title">${escapeHtml(cycleName)}${cycleShort ? ` <span style="font-weight:400;color:var(--text-muted)">— ${escapeHtml(cycleShort)}</span>` : ''}</div>${cycleDesc ? `<div class="handbook-card__desc">${escapeHtml(cycleDesc)}</div>` : ''}</a>`;
  }).join('');
  const cyclesCard = `<section class="handbook-phase-group" id="cycles">
    <h2>${escapeHtml(s.cyclesHeading)}</h2>
    <p>${escapeHtml(s.cyclesIntro)}</p>
    <div class="handbook-grid">${cycleCards}</div>
  </section>`;

  // Promo cards — Training + Lab — both reachable from the language index.
  const labCard = `<section class="handbook-phase-group">
    <h2>${escapeHtml(s.breadcrumbTraining)} &amp; ${escapeHtml(s.breadcrumbLab)}</h2>
    <div class="handbook-grid">
      <a class="handbook-card" href="./training/"><div class="handbook-card__title">${escapeHtml(s.breadcrumbTraining)} →</div><div class="handbook-card__desc">${escapeHtml(s.trainingIntro)}</div></a>
      <a class="handbook-card" href="./lab/"><div class="handbook-card__title">${escapeHtml(s.breadcrumbLab)} →</div><div class="handbook-card__desc">${escapeHtml(s.labIntro)}</div></a>
    </div>
  </section>`;

  const body = `
<article class="handbook-article">
  <h1>${escapeHtml(s.handbookTitle)}</h1>
  <p class="handbook-article__lead">${escapeHtml(s.handbookSub)}</p>
  ${cyclesCard}
  ${groupHtmlParts.join('\n')}
  ${labCard}
</article>`;

  const html = renderPage({
    lang,
    title: `${s.handbookTitle} — Six Sigma · DMAIC`,
    description: s.handbookSub,
    pathFromRoot,
    altPathFromRoot,
    breadcrumbs: [{ label: s.handbookTitle }],
    bodyHtml: body,
    headingKey: s.handbookTitle,
  });

  return { html, pathFromRoot, altPathFromRoot };
}

// ─── Lab index ───────────────────────────────────────────────────

export function renderLabIndex({ algorithms, categories, categoryById, lang, i18n }) {
  const s = getStrings(lang);
  const pathFromRoot = `/${lang}/lab/index.html`;
  const altLang = lang === 'de' ? 'en' : 'de';
  const altPathFromRoot = `/${altLang}/lab/index.html`;

  const byCategory = new Map();
  for (const algo of algorithms) {
    if (!byCategory.has(algo.category)) byCategory.set(algo.category, []);
    byCategory.get(algo.category).push(algo);
  }

  const groupHtmlParts = [];
  for (const cat of categories) {
    const algos = byCategory.get(cat.id);
    if (!algos || algos.length === 0) continue;
    const catName = pick(cat.name, lang);

    const cards = algos.map((algo) => {
      const name = pick(algo.name, lang);
      const shortDesc = pick(algo.description?.short, lang);
      const href = `./${cat.id}/${algo.id}.html`;
      return `<a class="handbook-card" href="${escapeAttr(href)}"><div class="handbook-card__title">${escapeHtml(name)}</div>${shortDesc ? `<div class="handbook-card__desc">${escapeHtml(shortDesc)}</div>` : ''}</a>`;
    }).join('');

    groupHtmlParts.push(
      `<section class="handbook-phase-group" id="${escapeAttr(cat.id)}">
        <h2>${escapeHtml(catName)}</h2>
        <div class="handbook-grid">${cards}</div>
      </section>`,
    );
  }

  const body = `
<article class="handbook-article">
  <h1>${escapeHtml(s.breadcrumbLab)}</h1>
  <p class="handbook-article__lead">${escapeHtml(s.labIntro)}</p>
  ${groupHtmlParts.join('\n')}
</article>`;

  const html = renderPage({
    lang,
    title: `${s.breadcrumbLab} — ${s.handbookTitle}`,
    description: s.labIntro,
    pathFromRoot,
    altPathFromRoot,
    breadcrumbs: [
      { label: s.handbookTitle, href: `/${lang}/` },
      { label: s.breadcrumbLab },
    ],
    bodyHtml: body,
    headingKey: s.breadcrumbLab,
  });

  return { html, pathFromRoot, altPathFromRoot };
}

// ─── Training (Schulungen) ───────────────────────────────────────

const TRAINING_TOPICS = ['dmaic', 'dmadv', 'triz', 'minitab', 'jmp'];

function _trainingNS(i18n, lang, topic) {
  return i18n?.[lang]?.training?.[topic] || i18n?.en?.training?.[topic] || {};
}

/**
 * Training overview page — /{lang}/training/index.html.
 * Three cards: DMAIC methodology, Minitab migration, JMP migration.
 */
export function renderTrainingIndex({ lang, i18n }) {
  const s = getStrings(lang);
  const pathFromRoot = `/${lang}/training/index.html`;
  const altLang = lang === 'de' ? 'en' : 'de';
  const altPathFromRoot = `/${altLang}/training/index.html`;

  const cards = TRAINING_TOPICS.map((topic) => {
    const title = s.training[`${topic}Title`];
    const desc = s.training[`${topic}Short`];
    const href = `./${topic}.html`;
    return `<a class="handbook-card" href="${escapeAttr(href)}"><div class="handbook-card__title">${escapeHtml(title)}</div><div class="handbook-card__desc">${escapeHtml(desc)}</div></a>`;
  }).join('');

  const body = `
<article class="handbook-article">
  <span class="handbook-article__tag">${escapeHtml(s.breadcrumbTraining)}</span>
  <h1>${escapeHtml(s.breadcrumbTraining)}</h1>
  <p class="handbook-article__lead">${escapeHtml(s.trainingIntro)}</p>
  <div class="handbook-grid">${cards}</div>
</article>`;

  const html = renderPage({
    lang,
    title: `${s.breadcrumbTraining} — ${s.handbookTitle}`,
    description: s.trainingIntro,
    pathFromRoot,
    altPathFromRoot,
    breadcrumbs: [
      { label: s.handbookTitle, href: `/${lang}/` },
      { label: s.breadcrumbTraining },
    ],
    bodyHtml: body,
    headingKey: s.breadcrumbTraining,
  });

  return { html, pathFromRoot, altPathFromRoot };
}

/**
 * Cycle methodology page — /{lang}/training/{cycleId}.html.
 * Reads from the `training.{cycleId}.*` i18n namespace (same source the app
 * uses for the in-app Training tab) so the static handbook never drifts from
 * it. Phase ids come from the cycle definition in `js/core/cycles/cycles.js`.
 */
export function renderTrainingCyclePage({ lang, i18n, cycleId }) {
  const s = getStrings(lang);
  const ns = _trainingNS(i18n, lang, cycleId);
  const t = (k) => escapeHtml(ns[k] || '');

  const pathFromRoot = `/${lang}/training/${cycleId}.html`;
  const altLang = lang === 'de' ? 'en' : 'de';
  const altPathFromRoot = `/${altLang}/training/${cycleId}.html`;

  const titleLabel = s.training[`${cycleId}Title`] || cycleId.toUpperCase();
  const shortLabel = s.training[`${cycleId}Short`] || '';
  const title = `${titleLabel} — ${s.breadcrumbTraining} — ${s.handbookTitle}`;
  const description = ns.intro || shortLabel;

  const phaseSections = getPhaseIds(cycleId).map(id =>
    `<h3>${t(`${id}Title`)}</h3><p>${t(`${id}Body`)}</p>`
  ).join('');

  const body = `
<article class="handbook-article">
  <span class="handbook-article__tag">${escapeHtml(s.breadcrumbTraining)}</span>
  <h1>${escapeHtml(titleLabel)}</h1>
  <p class="handbook-article__lead">${t('intro')}</p>

  <section class="handbook-section">
    <h2>${t('whyTitle')}</h2>
    <p>${t('whyBody')}</p>
  </section>

  <section class="handbook-section">
    <h2>${t('phasesTitle')}</h2>
    ${phaseSections}
  </section>

  <section class="handbook-section">
    <h2>${t('whenTitle')}</h2>
    <p>${t('whenBody')}</p>
  </section>

  <section class="handbook-section">
    <h2>${t('pitfallsTitle')}</h2>
    <ul class="handbook-block__list">
      <li>${t('pitfall1')}</li>
      <li>${t('pitfall2')}</li>
      <li>${t('pitfall3')}</li>
      <li>${t('pitfall4')}</li>
    </ul>
  </section>

  <section class="handbook-section">
    <h2>${t('appTitle')}</h2>
    <p>${t('appBody')}</p>
  </section>
</article>`;

  const html = renderPage({
    lang,
    title,
    description,
    pathFromRoot,
    altPathFromRoot,
    breadcrumbs: [
      { label: s.handbookTitle, href: `/${lang}/` },
      { label: s.breadcrumbTraining, href: `/${lang}/training/` },
      { label: titleLabel },
    ],
    bodyHtml: body,
    headingKey: titleLabel,
  });

  return { html, pathFromRoot, altPathFromRoot };
}

/**
 * Backwards-compat alias — the old export name was DMAIC-specific.
 * @deprecated use `renderTrainingCyclePage({ lang, i18n, cycleId: 'dmaic' })`
 */
export function renderTrainingDmaicPage({ lang, i18n }) {
  return renderTrainingCyclePage({ lang, i18n, cycleId: 'dmaic' });
}

/**
 * TRIZ methodology page — /{lang}/training/triz.html.
 * TRIZ is a methodology, not a phase-based cycle, so the structure differs
 * from `renderTrainingCyclePage`: the "phases" section is replaced by core
 * concepts and a tools section. Reads from the `training.triz.*` i18n
 * namespace (same source the app uses for the in-app Training tab).
 */
export function renderTrainingTrizPage({ lang, i18n }) {
  const s = getStrings(lang);
  const ns = _trainingNS(i18n, lang, 'triz');
  const t = (k) => escapeHtml(ns[k] || '');

  const pathFromRoot = `/${lang}/training/triz.html`;
  const altLang = lang === 'de' ? 'en' : 'de';
  const altPathFromRoot = `/${altLang}/training/triz.html`;

  const titleLabel = s.training.trizTitle;
  const title = `${titleLabel} — ${s.breadcrumbTraining} — ${s.handbookTitle}`;
  const description = ns.intro || s.training.trizShort;

  const body = `
<article class="handbook-article">
  <span class="handbook-article__tag">${escapeHtml(s.breadcrumbTraining)}</span>
  <h1>${escapeHtml(titleLabel)}</h1>
  <p class="handbook-article__lead">${t('intro')}</p>

  <section class="handbook-section">
    <h2>${t('whyTitle')}</h2>
    <p>${t('whyBody')}</p>
  </section>

  <section class="handbook-section">
    <h2>${t('conceptsTitle')}</h2>
    <h3>${t('contradictionTitle')}</h3>
    <p>${t('contradictionBody')}</p>
    <h3>${t('idealityTitle')}</h3>
    <p>${t('idealityBody')}</p>
    <h3>${t('evolutionTitle')}</h3>
    <p>${t('evolutionBody')}</p>
  </section>

  <section class="handbook-section">
    <h2>${t('toolsTitle')}</h2>
    <h3>${t('tool40Title')}</h3>
    <p>${t('tool40Body')}</p>
    <h3>${t('toolMatrixTitle')}</h3>
    <p>${t('toolMatrixBody')}</p>
    <h3>${t('tool9WindowsTitle')}</h3>
    <p>${t('tool9WindowsBody')}</p>
    <h3>${t('toolArizTitle')}</h3>
    <p>${t('toolArizBody')}</p>
  </section>

  <section class="handbook-section">
    <h2>${t('whenTitle')}</h2>
    <p>${t('whenBody')}</p>
  </section>

  <section class="handbook-section">
    <h2>${t('pitfallsTitle')}</h2>
    <ul class="handbook-block__list">
      <li>${t('pitfall1')}</li>
      <li>${t('pitfall2')}</li>
      <li>${t('pitfall3')}</li>
      <li>${t('pitfall4')}</li>
    </ul>
  </section>

  <section class="handbook-section">
    <h2>${t('appTitle')}</h2>
    <p>${t('appBody')}</p>
  </section>
</article>`;

  const html = renderPage({
    lang,
    title,
    description,
    pathFromRoot,
    altPathFromRoot,
    breadcrumbs: [
      { label: s.handbookTitle, href: `/${lang}/` },
      { label: s.breadcrumbTraining, href: `/${lang}/training/` },
      { label: titleLabel },
    ],
    bodyHtml: body,
    headingKey: titleLabel,
  });

  return { html, pathFromRoot, altPathFromRoot };
}

/**
 * Tool migration page (Minitab or JMP) — /{lang}/training/{topic}.html.
 * Reads from the `training.{topic}.*` i18n namespace.
 */
export function renderTrainingToolPage({ lang, i18n, topic }) {
  const s = getStrings(lang);
  const ns = _trainingNS(i18n, lang, topic);
  const t = (k) => escapeHtml(ns[k] || '');
  const pageTitle = s.training[`${topic}Title`];

  const pathFromRoot = `/${lang}/training/${topic}.html`;
  const altLang = lang === 'de' ? 'en' : 'de';
  const altPathFromRoot = `/${altLang}/training/${topic}.html`;
  const title = `${pageTitle} — ${s.breadcrumbTraining} — ${s.handbookTitle}`;
  const description = ns.intro || s.training[`${topic}Short`];

  const rows = [];
  for (let i = 1; i <= 8; i++) {
    rows.push(`<tr><td>${t(`row${i}a`)}</td><td>${t(`row${i}b`)}</td><td>${t(`row${i}c`)}</td></tr>`);
  }

  const body = `
<article class="handbook-article">
  <span class="handbook-article__tag">${escapeHtml(s.breadcrumbTraining)}</span>
  <h1>${escapeHtml(pageTitle)}</h1>
  <p class="handbook-article__lead">${t('intro')}</p>

  <section class="handbook-section">
    <h2>${t('conceptsTitle')}</h2>
    <p>${t('conceptsIntro')}</p>
  </section>

  <section class="handbook-section">
    <h2>${t('mappingTitle')}</h2>
    <p>${t('mappingIntro')}</p>
    <div class="handbook-block__table-wrap">
      <table class="handbook-block__table">
        <thead>
          <tr>
            <th>${t('col1')}</th>
            <th>${t('col2')}</th>
            <th>${t('col3')}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.join('')}
        </tbody>
      </table>
    </div>
  </section>

  <section class="handbook-section">
    <h2>${t('workflowTitle')}</h2>
    <p>${t('workflowIntro')}</p>
    <ol class="handbook-block__list">
      <li>${t('workflow1')}</li>
      <li>${t('workflow2')}</li>
      <li>${t('workflow3')}</li>
      <li>${t('workflow4')}</li>
      <li>${t('workflow5')}</li>
    </ol>
  </section>

  <section class="handbook-section">
    <h2>${t('dataTitle')}</h2>
    <p>${t('dataBody')}</p>
  </section>

  <section class="handbook-section">
    <h2>${t('tipsTitle')}</h2>
    <ul class="handbook-block__list">
      <li>${t('tip1')}</li>
      <li>${t('tip2')}</li>
      <li>${t('tip3')}</li>
      <li>${t('tip4')}</li>
    </ul>
  </section>
</article>`;

  const html = renderPage({
    lang,
    title,
    description,
    pathFromRoot,
    altPathFromRoot,
    breadcrumbs: [
      { label: s.handbookTitle, href: `/${lang}/` },
      { label: s.breadcrumbTraining, href: `/${lang}/training/` },
      { label: pageTitle },
    ],
    bodyHtml: body,
    headingKey: pageTitle,
  });

  return { html, pathFromRoot, altPathFromRoot };
}

export { TRAINING_TOPICS };

// ─── Language picker (root index) ────────────────────────────────

export function renderLangPicker() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DMAIC.io Handbook — Documentation</title>
<meta name="description" content="DMAIC.io is a free, open-source Six Sigma toolkit. Handbook available in English and German.">
<link rel="canonical" href="https://docs.dmaic.io/">
<link rel="alternate" hreflang="de" href="https://docs.dmaic.io/de/">
<link rel="alternate" hreflang="en" href="https://docs.dmaic.io/en/">
<link rel="alternate" hreflang="x-default" href="https://docs.dmaic.io/en/">
<link rel="icon" type="image/svg+xml" href="./assets/favicon.svg">
<link rel="stylesheet" href="./assets/handbook.css">
<style>
  .picker {
    min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    padding: 2rem;
  }
  .picker__inner { text-align: center; max-width: 560px; }
  .picker h1 {
    font-family: 'Instrument Serif', serif;
    font-size: clamp(2.4rem, 5vw, 3.6rem);
    font-weight: 400;
    line-height: 1.1;
    margin-bottom: 1rem;
  }
  .picker p { color: var(--t2); margin-bottom: 2rem; font-size: 1.05rem; }
  .picker__btns { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
  .picker__btn {
    display: inline-block;
    padding: .9rem 2.2rem;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--bg-t);
    color: var(--t1);
    font-weight: 600;
  }
  .picker__btn:hover {
    border-color: var(--green);
    background: var(--bg-card);
    color: var(--t1);
    transform: translateY(-1px);
    box-shadow: 0 6px 22px var(--green-glow);
  }
</style>
</head>
<body>
<div class="picker">
  <div class="picker__inner">
    <h1>DMAIC.io <span style="color:var(--t3);font-size:.65em;">docs</span></h1>
    <p>Handbook for the open-source Six Sigma toolkit.<br>Choose your language · Sprache wählen</p>
    <div class="picker__btns">
      <a class="picker__btn" href="./de/" hreflang="de">Deutsch →</a>
      <a class="picker__btn" href="./en/" hreflang="en">English →</a>
    </div>
    <p style="margin-top:2.5rem;font-size:.8rem;color:var(--t3);">
      <a href="https://dmaic.io/">← Back to dmaic.io</a>
    </p>
  </div>
</div>
</body>
</html>
`;
}
