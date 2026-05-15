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
import { getModuleName, getExamplesForModule } from '../loaders/load-sources.mjs';
import { renderLatex } from './katex.mjs';
import { CYCLES, getCycle, getPhaseIds } from '../../../js/core/cycles/cycles.js';

const APP_ORIGIN = 'https://dmaic.io';

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

export function renderModulePage({ module, lang, i18n, examples }) {
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

  // ─── Examples section (linked detail pages per example) ──
  let examplesSectionHtml = '';
  const moduleExamples = examples ? getExamplesForModule(examples, id) : [];
  if (moduleExamples.length > 0) {
    const cards = moduleExamples.map((ex) => {
      const exName = pick(ex.title, lang) || ex.id;
      const exDesc = pick(ex.description, lang) || '';
      const typeLabel = s.exampleTypeLabel[ex.type] || ex.type;
      const href = `../examples/${ex.id}.html`;
      return `<a class="handbook-card" href="${escapeAttr(href)}"><div class="handbook-card__title">${escapeHtml(exName)} <span style="font-weight:400;color:var(--t3);font-size:.8em;">— ${escapeHtml(typeLabel)}</span></div>${exDesc ? `<div class="handbook-card__desc">${escapeHtml(exDesc)}</div>` : ''}</a>`;
    }).join('');
    examplesSectionHtml = `<section class="handbook-section" id="examples"><h2>${escapeHtml(s.examplesHeading)}</h2><p>${escapeHtml(s.examplesIntro)}</p><div class="handbook-grid">${cards}</div></section>`;
  }

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
  ${examplesSectionHtml}
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

export function renderLangIndex({ modules, lang, i18n, examples }) {
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

  // Promo cards — Training + Lab + Examples — all reachable from the language index.
  const hasExamples = examples?.entries?.length > 0;
  const examplesPromo = hasExamples
    ? `<a class="handbook-card" href="./examples/"><div class="handbook-card__title">${escapeHtml(s.breadcrumbExamples)} →</div><div class="handbook-card__desc">${escapeHtml(s.examplesIndexIntro)}</div></a>`
    : '';
  const labCard = `<section class="handbook-phase-group">
    <h2>${escapeHtml(s.breadcrumbTraining)} &amp; ${escapeHtml(s.breadcrumbLab)}</h2>
    <div class="handbook-grid">
      <a class="handbook-card" href="./training/"><div class="handbook-card__title">${escapeHtml(s.breadcrumbTraining)} →</div><div class="handbook-card__desc">${escapeHtml(s.trainingIntro)}</div></a>
      <a class="handbook-card" href="./lab/"><div class="handbook-card__title">${escapeHtml(s.breadcrumbLab)} →</div><div class="handbook-card__desc">${escapeHtml(s.labIntro)}</div></a>
      ${examplesPromo}
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

// ─── Example detail page ─────────────────────────────────────────

/**
 * Render a per-example detail page — /{lang}/examples/{exampleId}.html.
 *
 * Shows title, description, source/license, spec (modul-spezifisch),
 * column metadata, table preview, and a deeplink that opens the example
 * directly in the app. CSV/JSON files are served from /examples/data/
 * (language-neutral, one copy).
 *
 * @param {object} opts
 * @param {object} opts.example       — catalog entry with optional `previewData`
 * @param {object[]} opts.modules     — all modules (for cross-linking)
 * @param {'de'|'en'} opts.lang
 * @param {object} opts.i18n
 */
export function renderExamplePage({ example, modules, lang, i18n }) {
  const s = getStrings(lang);
  const ex = example;

  const name = pick(ex.title, lang) || ex.id;
  const desc = pick(ex.description, lang) || '';
  const typeLabel = s.exampleTypeLabel[ex.type] || ex.type;

  const pathFromRoot = `/${lang}/examples/${ex.id}.html`;
  const altLang = lang === 'de' ? 'en' : 'de';
  const altPathFromRoot = `/${altLang}/examples/${ex.id}.html`;

  // Primary module (first in modules[]) drives breadcrumb.
  const primaryModuleId = ex.modules?.[0];
  const primaryModule = modules.find(m => m.id === primaryModuleId);
  const primaryModuleName = primaryModuleId ? getModuleName(primaryModuleId, i18n, lang) : null;

  // ─── Meta row (source, license, type) ────────────────────
  const metaItems = [];
  metaItems.push(`<div class="algo-meta__item"><span class="algo-meta__label">${escapeHtml(s.exampleTypeLabel.dataset === typeLabel ? s.exampleTypeLabel.dataset : 'Typ')}</span><span class="algo-meta__value">${escapeHtml(typeLabel)}</span></div>`);
  if (ex.source) {
    metaItems.push(`<div class="algo-meta__item"><span class="algo-meta__label">${escapeHtml(s.exampleSource)}</span><span class="algo-meta__value">${escapeHtml(ex.source)}</span></div>`);
  }
  if (ex.license) {
    metaItems.push(`<div class="algo-meta__item"><span class="algo-meta__label">${escapeHtml(s.exampleLicense)}</span><span class="algo-meta__value">${escapeHtml(ex.license)}</span></div>`);
  }
  const metaHtml = `<div class="algo-meta">${metaItems.join('')}</div>`;

  // ─── Spec (LSL / USL / Target / …) ───────────────────────
  let specHtml = '';
  if (ex.spec && Object.keys(ex.spec).length > 0) {
    const rows = Object.entries(ex.spec).map(([k, v]) =>
      `<li><strong>${escapeHtml(k.toUpperCase())}</strong>: ${escapeHtml(String(v))}</li>`,
    ).join('');
    specHtml = `<section class="handbook-section"><h2>${escapeHtml(s.exampleSpec)}</h2><ul class="handbook-block__list">${rows}</ul></section>`;
  }

  // ─── Columns ─────────────────────────────────────────────
  let columnsHtml = '';
  if (Array.isArray(ex.columns) && ex.columns.length > 0) {
    const rows = ex.columns.map(c => {
      const unit = c.unit ? ` (${escapeHtml(c.unit)})` : '';
      const type = c.type ? ` — ${escapeHtml(c.type)}` : '';
      return `<li><strong>${escapeHtml(c.name)}</strong>${unit}${type}</li>`;
    }).join('');
    columnsHtml = `<section class="handbook-section"><h2>${escapeHtml(s.exampleColumns)}</h2><ul class="handbook-block__list">${rows}</ul></section>`;
  }

  // ─── Generator details (when type === 'generator') ───────
  let generatorHtml = '';
  if (ex.type === 'generator' && ex.generator) {
    const g = ex.generator;
    const paramRows = Object.entries(g.params || {}).map(([k, v]) =>
      `<li><strong>${escapeHtml(k)}</strong>: ${escapeHtml(String(v))}</li>`,
    ).join('');
    generatorHtml = `<section class="handbook-section"><h2>${escapeHtml(typeLabel)}</h2>
      <p>${escapeHtml(s.exampleRuntime)}</p>
      <ul class="handbook-block__list">
        <li><strong>algorithm</strong>: ${escapeHtml(g.algorithm || '')}</li>
        ${g.seed != null ? `<li><strong>seed</strong>: ${escapeHtml(String(g.seed))}</li>` : ''}
      </ul>
      ${paramRows ? `<p><strong>params</strong></p><ul class="handbook-block__list">${paramRows}</ul>` : ''}
    </section>`;
  }

  // ─── Table preview ───────────────────────────────────────
  let previewHtml = '';
  if (ex.previewData && ex.previewData.rows.length > 0) {
    const p = ex.previewData;
    const headerCells = p.header.map(h => `<th>${escapeHtml(h)}</th>`).join('');
    const bodyRows = p.rows.map(r =>
      `<tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`,
    ).join('');
    const note = s.examplePreviewNote
      .replace('{n}', String(p.rows.length))
      .replace('{total}', String(p.totalRows));
    previewHtml = `<section class="handbook-section"><h2>${escapeHtml(s.examplePreview)}</h2>
      <p>${escapeHtml(note)}</p>
      <div class="handbook-block__table-wrap">
        <table class="handbook-block__table">
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    </section>`;
  }

  // ─── Download + deeplink actions ─────────────────────────
  const actions = [];
  if (ex.file && (ex.type === 'dataset' || ex.type === 'project')) {
    // Files are shipped at /examples/data/<basename> — relative path from /{lang}/examples/<id>.html
    const fileBasename = ex.file.split('/').pop();
    const downloadHref = `../../examples/data/${fileBasename}`;
    const downloadLabel = ex.type === 'project' ? s.exampleProjectDownload : s.exampleDownload;
    actions.push(`<a class="handbook-cta__button" href="${escapeAttr(downloadHref)}" download>${escapeHtml(downloadLabel)} ↓</a>`);
  }
  if (primaryModuleId) {
    const deeplink = `${APP_ORIGIN}/?module=${encodeURIComponent(primaryModuleId)}&example=${encodeURIComponent(ex.id)}`;
    actions.push(`<a class="handbook-cta__button" href="${escapeAttr(deeplink)}">${escapeHtml(s.exampleOpenInApp)} →</a>`);
  }
  const actionsHtml = actions.length
    ? `<aside class="handbook-cta"><div style="display:flex;gap:1rem;flex-wrap:wrap;">${actions.join('')}</div></aside>`
    : '';

  // ─── Cross-linked modules (other than primary) ───────────
  let alsoInHtml = '';
  const otherModuleIds = (ex.modules || []).filter(m => m !== primaryModuleId);
  if (otherModuleIds.length > 0) {
    const links = otherModuleIds.map(mid => {
      const m = modules.find(x => x.id === mid);
      if (!m) return null;
      const mName = getModuleName(mid, i18n, lang);
      const href = `../${m.phase}/${mid}.html`;
      return `<a href="${escapeAttr(href)}">${escapeHtml(mName)}</a>`;
    }).filter(Boolean).join(', ');
    if (links) {
      alsoInHtml = `<section class="handbook-section"><h2>${escapeHtml(s.exampleAlsoIn)}</h2><p>${links}</p></section>`;
    }
  }

  const body = `
<article class="handbook-article">
  <span class="handbook-article__tag">${escapeHtml(s.examplesHeading)}</span>
  <h1>${escapeHtml(name)}</h1>
  ${desc ? `<p class="handbook-article__lead">${escapeHtml(desc)}</p>` : ''}
  ${metaHtml}
  ${specHtml}
  ${columnsHtml}
  ${generatorHtml}
  ${previewHtml}
  ${alsoInHtml}
  ${actionsHtml}
</article>`;

  const breadcrumbs = [
    { label: s.handbookTitle, href: `/${lang}/` },
  ];
  if (primaryModule && primaryModuleName) {
    const phaseLabel = s.phase[primaryModule.phase] || primaryModule.phase;
    breadcrumbs.push({ label: phaseLabel, href: `/${lang}/#${primaryModule.phase}` });
    breadcrumbs.push({ label: primaryModuleName, href: `/${lang}/${primaryModule.phase}/${primaryModule.id}.html` });
  }
  breadcrumbs.push({ label: s.breadcrumbExamples });
  breadcrumbs.push({ label: name });

  const html = renderPage({
    lang,
    title: `${name} — ${s.examplesHeading} — ${s.handbookTitle}`,
    description: desc || `${name} — ${s.examplesHeading}`,
    pathFromRoot,
    altPathFromRoot,
    breadcrumbs,
    bodyHtml: body,
    headingKey: name,
    showCta: false,
  });

  return { html, pathFromRoot, altPathFromRoot };
}

// ─── Examples index page ─────────────────────────────────────────

/**
 * Render the central examples landing page — /{lang}/examples/index.html.
 *
 * Groups all examples by the phase of their primary module so visitors can
 * browse the catalog independently of the module hierarchy. Each card links
 * to the per-example detail page; the type (dataset / project / generator)
 * is shown as a badge.
 *
 * @param {object} opts
 * @param {object[]} opts.examples  — full examples.entries list
 * @param {object[]} opts.modules   — all modules (for phase lookup)
 * @param {'de'|'en'} opts.lang
 * @param {object} opts.i18n
 */
export function renderExamplesIndex({ examples, modules, lang, i18n }) {
  const s = getStrings(lang);
  const pathFromRoot = `/${lang}/examples/index.html`;
  const altLang = lang === 'de' ? 'en' : 'de';
  const altPathFromRoot = `/${altLang}/examples/index.html`;

  const moduleById = new Map(modules.map(m => [m.id, m]));

  // Group by primary module's phase. Examples without a known primary
  // module fall back to the "extras" bucket.
  const byPhase = new Map();
  for (const phase of CONSTANTS.PHASES) byPhase.set(phase, []);
  byPhase.set('extras', []);

  const modulesWithExamples = new Set();
  for (const ex of examples) {
    const primaryId = ex.modules?.[0];
    if (primaryId) modulesWithExamples.add(primaryId);
    const mod = primaryId ? moduleById.get(primaryId) : null;
    const phase = mod?.phase && byPhase.has(mod.phase) ? mod.phase : 'extras';
    byPhase.get(phase).push(ex);
  }

  const groupHtmlParts = [];
  for (const [phase, entries] of byPhase) {
    if (entries.length === 0) continue;
    const phaseLabel = s.phase[phase] || phase;

    const cards = entries
      .slice()
      .sort((a, b) => (pick(a.title, lang) || a.id).localeCompare(pick(b.title, lang) || b.id, lang))
      .map((ex) => {
        const name = pick(ex.title, lang) || ex.id;
        const desc = pick(ex.description, lang) || '';
        const typeLabel = s.exampleTypeLabel[ex.type] || ex.type;
        const primaryId = ex.modules?.[0];
        const moduleName = primaryId ? getModuleName(primaryId, i18n, lang) : '';
        const moduleHint = moduleName
          ? s.examplesIndexInModule.replace('{module}', moduleName)
          : '';
        const href = `./${ex.id}.html`;
        return `<a class="handbook-card" href="${escapeAttr(href)}">
          <div class="handbook-card__title">${escapeHtml(name)}</div>
          ${desc ? `<div class="handbook-card__desc">${escapeHtml(desc)}</div>` : ''}
          <div class="handbook-card__meta" style="margin-top:.5rem;display:flex;gap:.5rem;flex-wrap:wrap;font-size:.85em;color:var(--text-muted);">
            <span class="handbook-card__badge">${escapeHtml(typeLabel)}</span>
            ${moduleHint ? `<span>${escapeHtml(moduleHint)}</span>` : ''}
          </div>
        </a>`;
      })
      .join('');

    groupHtmlParts.push(
      `<section class="handbook-phase-group" id="${escapeAttr(phase)}">
        <h2>${escapeHtml(phaseLabel)}</h2>
        <div class="handbook-grid">${cards}</div>
      </section>`,
    );
  }

  const countLine = s.examplesIndexCount
    .replace('{n}', String(examples.length))
    .replace('{modules}', String(modulesWithExamples.size));

  const body = `
<article class="handbook-article">
  <h1>${escapeHtml(s.examplesIndexHeading)}</h1>
  <p class="handbook-article__lead">${escapeHtml(s.examplesIndexIntro)}</p>
  <p><strong>${escapeHtml(countLine)}</strong></p>
  ${groupHtmlParts.join('\n')}
</article>`;

  const html = renderPage({
    lang,
    title: `${s.examplesIndexHeading} — ${s.handbookTitle}`,
    description: s.examplesIndexIntro,
    pathFromRoot,
    altPathFromRoot,
    breadcrumbs: [
      { label: s.handbookTitle, href: `/${lang}/` },
      { label: s.breadcrumbExamples },
    ],
    bodyHtml: body,
    headingKey: s.examplesIndexHeading,
  });

  return { html, pathFromRoot, altPathFromRoot };
}

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
