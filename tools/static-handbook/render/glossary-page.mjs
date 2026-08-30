/**
 * Page generators for the glossary section of the static handbook.
 *
 *   - renderGlossaryIndex     — /{lang}/glossar/index.html (catalog landing)
 *   - renderGlossaryTermPage  — /{lang}/glossar/<id>.html  (one entry)
 *
 * Both pages are SEO-targeted: term pages emit `@type: DefinedTerm`
 * structured data, the index emits `@type: DefinedTermSet`. Module pages
 * already link inline `{{term:id|label}}` markers here via `blocks.mjs`,
 * and each term page links back to the module handbooks under "Verwendet in".
 */

import { renderPage, getStrings } from './page-shell.mjs';
import { escapeHtml, escapeAttr, pick, stripTermTokens } from './escape.mjs';
import { getModuleName } from '../loaders/load-sources.mjs';
import { renderLatex } from './katex.mjs';
import { renderInline } from './inline.mjs';

const APP_ORIGIN = 'https://dmaic.io';

// ─── Per-term page ──────────────────────────────────────────────

export async function renderGlossaryTermPage({ term, glossary, modules, lang, i18n }) {
  const s = getStrings(lang);
  const title = pick(term.title, lang) || term.id;
  const shortText = pick(term.short, lang) || '';
  const pathFromRoot = `/${lang}/glossar/${term.id}.html`;
  const altLang = lang === 'de' ? 'en' : 'de';
  const altPathFromRoot = `/${altLang}/glossar/${term.id}.html`;

  // Build link factories now so block-level inline {{term:…}} markup gets
  // resolved to the correct relative target.
  const blockOpts = {
    glossaryHref: (otherId) =>
      glossary?.termById?.has(otherId) ? `/${lang}/glossar/${otherId}.html` : '',
  };

  const leadHtml = shortText ? await renderInline(shortText, blockOpts) : '';
  const definition = term.definition?.[lang] || term.definition?.en || [];
  const bodyHtml = await renderGlossaryBlocks(definition, blockOpts);

  // Aliases (small text line above body).
  const aliases = term.aliases?.[lang] || term.aliases?.en || [];
  const aliasesHtml = aliases.length
    ? `<p class="handbook-glossary__aliases"><em>${escapeHtml(s.glossaryAliases)}:</em> ${aliases.map(escapeHtml).join(', ')}</p>`
    : '';

  // See also — link to other glossary pages.
  const seeAlsoHtml = renderSeeAlso(term.seeAlso, glossary, lang, s);

  // Used in — link to module handbook pages.
  const usedInHtml = renderUsedIn(term.modules, modules, lang, i18n, s);

  // Algorithm-Lab links.
  const algoHtml = renderAlgoLinks(term.algoLab, lang, s);

  // Sources.
  const sourcesHtml = renderSources(term.sources, s);

  const article = `
<article class="handbook-article handbook-glossary">
  <h1>${escapeHtml(title)}</h1>
  ${shortText ? `<p class="handbook-article__lead">${leadHtml}</p>` : ''}
  ${aliasesHtml}
  <section class="handbook-section handbook-glossary__definition">${bodyHtml}</section>
  ${seeAlsoHtml}
  ${usedInHtml}
  ${algoHtml}
  ${sourcesHtml}
</article>`;

  const description = stripTermTokens(shortText || title).slice(0, 160);

  // DefinedTerm structured data is the SEO-correct schema for a glossary entry.
  const jsonLdOverride = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    name: title,
    description: shortText || title,
    inLanguage: lang,
    url: 'https://dmaic.io' + pathFromRoot,
    termCode: term.id,
    inDefinedTermSet: 'https://dmaic.io' + `/${lang}/glossar/index.html`,
  };

  const html = renderPage({
    lang,
    title: `${title} — ${s.glossaryHandbookTitle} — ${s.handbookTitle}`,
    description,
    pathFromRoot,
    altPathFromRoot,
    breadcrumbs: [
      { label: s.handbookTitle, href: `/${lang}/` },
      { label: s.glossaryHandbookTitle, href: `/${lang}/glossar/` },
      { label: title },
    ],
    bodyHtml: article,
    headingKey: title,
    needsKatex: true,
    jsonLdOverride,
  });

  return { html, pathFromRoot, altPathFromRoot };
}

// ─── Index page ─────────────────────────────────────────────────

export async function renderGlossaryIndex({ glossary, modules: _modules, lang, i18n: _i18n }) {
  const s = getStrings(lang);
  const pathFromRoot = `/${lang}/glossar/index.html`;
  const altLang = lang === 'de' ? 'en' : 'de';
  const altPathFromRoot = `/${altLang}/glossar/index.html`;

  const termsByCategory = new Map();
  for (const cat of glossary.categories) termsByCategory.set(cat.id, []);
  for (const term of glossary.terms) {
    const cat = term.category && termsByCategory.has(term.category)
      ? term.category
      : '_other';
    if (!termsByCategory.has(cat)) termsByCategory.set(cat, []);
    termsByCategory.get(cat).push(term);
  }

  const groupHtmlParts = [];
  for (const cat of glossary.categories) {
    const entries = termsByCategory.get(cat.id) || [];
    if (entries.length === 0) continue;
    const catLabel = pick(cat.label, lang) || cat.id;
    const cardParts = await Promise.all(entries
      .slice()
      .sort((a, b) => (pick(a.title, lang) || a.id).localeCompare(pick(b.title, lang) || b.id, lang))
      .map(async (term) => {
        const tTitle = pick(term.title, lang) || term.id;
        const tShort = pick(term.short, lang) || '';
        // Ohne glossaryHref bleiben Begriffsverweise Klartext — die Karte ist
        // selbst ein <a>, ein Link darin wäre ungültiges HTML.
        const desc = tShort ? await renderInline(tShort) : '';
        return `<a class="handbook-card" href="./${escapeAttr(term.id)}.html">
          <div class="handbook-card__title">${escapeHtml(tTitle)}</div>
          ${desc ? `<div class="handbook-card__desc">${desc}</div>` : ''}
        </a>`;
      }));
    const cards = cardParts.join('');
    groupHtmlParts.push(
      `<section class="handbook-phase-group" id="${escapeAttr(cat.id)}">
         <h2>${escapeHtml(catLabel)}</h2>
         <div class="handbook-grid">${cards}</div>
       </section>`,
    );
  }

  const countLine = s.glossaryIndexCount.replace('{n}', String(glossary.terms.length));

  const body = `
<article class="handbook-article">
  <h1>${escapeHtml(s.glossaryHandbookTitle)}</h1>
  <p class="handbook-article__lead">${escapeHtml(s.glossaryIndexIntro)}</p>
  <p><strong>${escapeHtml(countLine)}</strong></p>
  ${groupHtmlParts.join('\n')}
</article>`;

  const jsonLdOverride = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    name: s.glossaryHandbookTitle,
    description: s.glossaryIndexIntro,
    inLanguage: lang,
    url: APP_ORIGIN + pathFromRoot,
    hasDefinedTerm: glossary.terms.map(t => ({
      '@type': 'DefinedTerm',
      name: pick(t.title, lang) || t.id,
      termCode: t.id,
      url: APP_ORIGIN + `/${lang}/glossar/${t.id}.html`,
    })),
  };

  const html = renderPage({
    lang,
    title: `${s.glossaryHandbookTitle} — ${s.handbookTitle}`,
    description: s.glossaryIndexIntro,
    pathFromRoot,
    altPathFromRoot,
    breadcrumbs: [
      { label: s.handbookTitle, href: `/${lang}/` },
      { label: s.glossaryHandbookTitle },
    ],
    bodyHtml: body,
    headingKey: s.glossaryHandbookTitle,
    jsonLdOverride,
  });

  return { html, pathFromRoot, altPathFromRoot };
}

// ─── Helpers ────────────────────────────────────────────────────

/** Async block renderer for glossary content with KaTeX + inline xref support. */
async function renderGlossaryBlocks(blocks, opts) {
  const parts = [];
  for (const b of blocks || []) parts.push(await renderGlossaryBlock(b, opts));
  return parts.join('\n');
}

async function renderGlossaryBlock(block, opts) {
  if (!block || typeof block !== 'object') return '';
  switch (block.type) {
    case 'paragraph':
      return `<p>${await renderInline(block.text || '', opts)}</p>`;
    case 'note':
      return `<aside class="handbook-callout">${await renderInline(block.text || '', opts)}</aside>`;
    case 'list': {
      const items = [];
      for (const it of block.items || []) {
        items.push(`<li>${await renderInline(it || '', opts)}</li>`);
      }
      return `<ul class="handbook-block__list">${items.join('')}</ul>`;
    }
    case 'formula': {
      const html = await renderLatex(block.latex || '', { displayMode: true });
      return `<figure class="handbook-glossary__formula">${html}</figure>`;
    }
    default:
      return block.text ? `<p>${await renderInline(block.text, opts)}</p>` : '';
  }
}

function renderSeeAlso(seeAlsoIds, glossary, lang, s) {
  if (!Array.isArray(seeAlsoIds) || seeAlsoIds.length === 0) return '';
  const items = seeAlsoIds
    .map((id) => {
      const t = glossary?.termById?.get(id);
      if (!t) return '';
      const label = pick(t.title, lang) || id;
      return `<li><a href="./${escapeAttr(id)}.html">${escapeHtml(label)}</a></li>`;
    })
    .filter(Boolean)
    .join('');
  if (!items) return '';
  return `<section class="handbook-section handbook-glossary__seealso">
    <h2>${escapeHtml(s.glossarySeeAlso)}</h2>
    <ul class="handbook-block__list">${items}</ul>
  </section>`;
}

function renderUsedIn(moduleIds, modules, lang, i18n, s) {
  if (!Array.isArray(moduleIds) || moduleIds.length === 0) return '';
  const byId = new Map((modules || []).map(m => [m.id, m]));
  const items = moduleIds
    .map((id) => {
      const mod = byId.get(id);
      if (!mod) return '';
      const name = getModuleName(id, i18n, lang);
      const href = `/${lang}/${mod.phase}/${id}.html`;
      return `<li><a href="${escapeAttr(href)}">${escapeHtml(name)}</a></li>`;
    })
    .filter(Boolean)
    .join('');
  if (!items) return '';
  return `<section class="handbook-section handbook-glossary__used-in">
    <h2>${escapeHtml(s.glossaryUsedIn)}</h2>
    <ul class="handbook-block__list">${items}</ul>
  </section>`;
}

function renderAlgoLinks(algoIds, lang, s) {
  if (!Array.isArray(algoIds) || algoIds.length === 0) return '';
  const items = algoIds
    .map((id) => {
      // `category/algo-id` → `/{lang}/lab/<category>/<id>.html`
      const parts = id.split('/');
      if (parts.length !== 2) return '';
      const [cat, algo] = parts;
      const href = `/${lang}/lab/${cat}/${algo}.html`;
      return `<li><a href="${escapeAttr(href)}">${escapeHtml(id)}</a></li>`;
    })
    .filter(Boolean)
    .join('');
  if (!items) return '';
  return `<section class="handbook-section handbook-glossary__algo">
    <h2>${escapeHtml(s.glossaryAlgoLab)}</h2>
    <ul class="handbook-block__list">${items}</ul>
  </section>`;
}

function renderSources(sources, s) {
  if (!Array.isArray(sources) || sources.length === 0) return '';
  const items = sources
    .map((src) => {
      const label = src.label || '';
      if (!label) return '';
      if (src.url) {
        return `<li><a href="${escapeAttr(src.url)}" rel="noopener" target="_blank">${escapeHtml(label)}</a></li>`;
      }
      return `<li>${escapeHtml(label)}</li>`;
    })
    .filter(Boolean)
    .join('');
  if (!items) return '';
  return `<section class="handbook-section handbook-glossary__sources">
    <h2>${escapeHtml(s.glossarySources)}</h2>
    <ul class="handbook-block__list">${items}</ul>
  </section>`;
}
