#!/usr/bin/env node
/**
 * D.Mike — Static Handbook Generator
 *
 * Reads module handbooks (js/modules/<mod>/<mod>-help.js) and algorithm lab
 * JSONs (js/algorithm-lab/algorithms/**) and produces a fully static set of
 * HTML pages under docs/ that ships inside the per-tag app deployment
 * (/app/<tag>/docs/).
 *
 * Usage:
 *   node tools/static-handbook/build.mjs [--clean]
 *
 * Flags:
 *   --clean    Remove docs/ before regenerating.
 *
 * Why this tool exists:
 *   The app serves these sources through HelpPanel at runtime, but search
 *   engines cannot crawl that JS-rendered content. The static handbook is
 *   the SEO-visible mirror.
 *
 * Invocation: runs as a step in the release workflow
 * (.github/workflows/release-app.yml) before the rsync to the server.
 * Nightly does not generate docs.
 */

import { mkdir, writeFile, rm, copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

import { loadAllSources } from './loaders/load-sources.mjs';
import {
  renderModulePage,
  renderAlgoPage,
  renderLangIndex,
  renderLabIndex,
  renderLangPicker,
  renderTrainingIndex,
  renderTrainingCyclePage,
  renderTrainingTrizPage,
  renderTrainingToolPage,
  renderCycleIndex,
  renderExamplePage,
  renderExamplesIndex,
} from './render/pages.mjs';
import { renderGlossaryIndex, renderGlossaryTermPage } from './render/glossary-page.mjs';
import { renderSitemap, renderRobots } from './render/sitemap.mjs';
import { CYCLES } from '../../js/core/cycles/cycles.js';

const REPO = path.resolve(new URL('../..', import.meta.url).pathname);
const OUT = path.join(REPO, 'docs');
const FONTS_SRC = path.join(REPO, 'assets/fonts');
const CSS_SRC = path.join(REPO, 'tools/static-handbook/render/handbook.css');
const KATEX_CSS_SRC = path.join(REPO, 'node_modules/katex/dist/katex.min.css');
const KATEX_FONTS_SRC = path.join(REPO, 'node_modules/katex/dist/fonts');

const LANGS = ['de', 'en'];

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

async function main() {
  const args = new Set(process.argv.slice(2));
  const t0 = Date.now();

  log(`${COLORS.cyan}▶${COLORS.reset} Static Handbook Generator`);
  log(`${COLORS.dim}  repo: ${REPO}${COLORS.reset}`);
  log(`${COLORS.dim}  out:  ${OUT}${COLORS.reset}`);

  if (args.has('--clean') && existsSync(OUT)) {
    log(`${COLORS.yellow}• Cleaning ${OUT}${COLORS.reset}`);
    await rm(OUT, { recursive: true, force: true });
  }

  // ─── Load sources ──────────────────────────────────────────────
  const sources = await loadAllSources(REPO);
  log(`${COLORS.green}✓${COLORS.reset} Loaded ${sources.modules.length} modules, ${sources.algorithms.algorithms.length} algorithms`);

  // ─── Prepare output dirs ───────────────────────────────────────
  await mkdir(OUT, { recursive: true });
  await mkdir(path.join(OUT, 'assets'), { recursive: true });
  await mkdir(path.join(OUT, 'assets/fonts'), { recursive: true });

  // ─── Copy static assets ────────────────────────────────────────
  await copyFile(CSS_SRC, path.join(OUT, 'assets/handbook.css'));
  await copyFonts();
  await copyKatexAssets();
  await writeFile(path.join(OUT, 'assets/favicon.svg'), FAVICON_SVG, 'utf8');
  await copyExampleFiles(sources.examples);
  log(`${COLORS.green}✓${COLORS.reset} Copied assets (CSS, fonts, KaTeX, favicon, examples)`);

  // ─── Generate pages ────────────────────────────────────────────
  const sitemapEntries = [];
  let pageCount = 0;

  // Root language picker
  await writeOut(path.join(OUT, 'index.html'), renderLangPicker());
  sitemapEntries.push({ path: '/', priority: '1.0', changefreq: 'monthly' });
  pageCount++;

  for (const lang of LANGS) {
    const langDir = path.join(OUT, lang);
    await mkdir(langDir, { recursive: true });

    // Lang index
    const langIndex = renderLangIndex({
      modules: sources.modules,
      lang,
      i18n: sources.i18n,
      examples: sources.examples,
    });
    await writeOut(path.join(OUT, rel(langIndex.pathFromRoot)), langIndex.html);
    sitemapEntries.push({ path: langIndex.pathFromRoot, priority: '0.9', changefreq: 'monthly' });
    pageCount++;

    // Module pages
    for (const mod of sources.modules) {
      const page = await renderModulePage({
        module: mod,
        lang,
        i18n: sources.i18n,
        examples: sources.examples,
        glossary: sources.glossary,
      });
      const dest = path.join(OUT, rel(page.pathFromRoot));
      await writeOut(dest, page.html);
      sitemapEntries.push({ path: page.pathFromRoot, priority: '0.8', changefreq: 'monthly' });
      pageCount++;
    }

    // Glossary index + per-term pages
    if (sources.glossary?.terms?.length) {
      const idx = await renderGlossaryIndex({
        glossary: sources.glossary,
        modules: sources.modules,
        lang,
        i18n: sources.i18n,
      });
      await writeOut(path.join(OUT, rel(idx.pathFromRoot)), idx.html);
      sitemapEntries.push({ path: idx.pathFromRoot, priority: '0.7', changefreq: 'monthly' });
      pageCount++;

      for (const term of sources.glossary.terms) {
        const page = await renderGlossaryTermPage({
          term,
          glossary: sources.glossary,
          modules: sources.modules,
          lang,
          i18n: sources.i18n,
        });
        await writeOut(path.join(OUT, rel(page.pathFromRoot)), page.html);
        sitemapEntries.push({ path: page.pathFromRoot, priority: '0.6', changefreq: 'monthly' });
        pageCount++;
      }
    }

    // Examples landing page — central catalog grouped by phase.
    if (sources.examples?.entries?.length) {
      const examplesIndex = renderExamplesIndex({
        examples: sources.examples.entries,
        modules: sources.modules,
        lang,
        i18n: sources.i18n,
      });
      await writeOut(path.join(OUT, rel(examplesIndex.pathFromRoot)), examplesIndex.html);
      sitemapEntries.push({ path: examplesIndex.pathFromRoot, priority: '0.7', changefreq: 'monthly' });
      pageCount++;
    }

    // Example detail pages
    for (const ex of sources.examples.entries) {
      const page = renderExamplePage({
        example: ex,
        modules: sources.modules,
        lang,
        i18n: sources.i18n,
      });
      const dest = path.join(OUT, rel(page.pathFromRoot));
      await writeOut(dest, page.html);
      sitemapEntries.push({ path: page.pathFromRoot, priority: '0.6', changefreq: 'monthly' });
      pageCount++;
    }

    // Lab index
    const labIndex = renderLabIndex({
      algorithms: sources.algorithms.algorithms,
      categories: sources.algorithms.categories,
      categoryById: sources.algorithms.categoryById,
      lang,
      i18n: sources.i18n,
    });
    await writeOut(path.join(OUT, rel(labIndex.pathFromRoot)), labIndex.html);
    sitemapEntries.push({ path: labIndex.pathFromRoot, priority: '0.8', changefreq: 'monthly' });
    pageCount++;

    // Per-cycle index pages — one per cycle (DMAIC, DMADV, …).
    for (const cycleId of Object.keys(CYCLES)) {
      const cyclePage = renderCycleIndex({
        cycleId,
        modules: sources.modules,
        lang,
        i18n: sources.i18n,
      });
      await writeOut(path.join(OUT, rel(cyclePage.pathFromRoot)), cyclePage.html);
      sitemapEntries.push({ path: cyclePage.pathFromRoot, priority: '0.85', changefreq: 'monthly' });
      pageCount++;
    }

    // Training index + pages (DMAIC methodology, Minitab/JMP migration)
    const trainingIndex = renderTrainingIndex({ lang, i18n: sources.i18n });
    await writeOut(path.join(OUT, rel(trainingIndex.pathFromRoot)), trainingIndex.html);
    sitemapEntries.push({ path: trainingIndex.pathFromRoot, priority: '0.8', changefreq: 'monthly' });
    pageCount++;

    // One training page per cycle (DMAIC, DMADV, …).
    for (const cycleId of Object.keys(CYCLES)) {
      const cyclePage = renderTrainingCyclePage({ lang, i18n: sources.i18n, cycleId });
      await writeOut(path.join(OUT, rel(cyclePage.pathFromRoot)), cyclePage.html);
      sitemapEntries.push({ path: cyclePage.pathFromRoot, priority: '0.7', changefreq: 'monthly' });
      pageCount++;
    }

    // TRIZ methodology page — not a cycle (no phase ids), so it has its own renderer.
    const trizPage = renderTrainingTrizPage({ lang, i18n: sources.i18n });
    await writeOut(path.join(OUT, rel(trizPage.pathFromRoot)), trizPage.html);
    sitemapEntries.push({ path: trizPage.pathFromRoot, priority: '0.7', changefreq: 'monthly' });
    pageCount++;

    for (const topic of ['minitab', 'jmp']) {
      const page = renderTrainingToolPage({ lang, i18n: sources.i18n, topic });
      await writeOut(path.join(OUT, rel(page.pathFromRoot)), page.html);
      sitemapEntries.push({ path: page.pathFromRoot, priority: '0.7', changefreq: 'monthly' });
      pageCount++;
    }

    // Algorithm pages (async due to KaTeX SSR)
    for (const algo of sources.algorithms.algorithms) {
      const page = await renderAlgoPage({
        algorithm: algo,
        lang,
        categoryById: sources.algorithms.categoryById,
        i18n: sources.i18n,
        glossary: sources.glossary,
      });
      const dest = path.join(OUT, rel(page.pathFromRoot));
      await writeOut(dest, page.html);
      sitemapEntries.push({ path: page.pathFromRoot, priority: '0.7', changefreq: 'monthly' });
      pageCount++;
    }
  }

  // ─── Sitemap + robots ──────────────────────────────────────────
  await writeFile(path.join(OUT, 'sitemap.xml'), renderSitemap(sitemapEntries), 'utf8');
  await writeFile(path.join(OUT, 'robots.txt'), renderRobots(), 'utf8');
  log(`${COLORS.green}✓${COLORS.reset} Wrote sitemap.xml (${sitemapEntries.length} URLs) + robots.txt`);

  const dt = ((Date.now() - t0) / 1000).toFixed(2);
  log(`${COLORS.green}✓${COLORS.reset} Generated ${pageCount} pages in ${dt}s`);
}

// ─── Helpers ─────────────────────────────────────────────────────

function log(msg) {
  process.stdout.write(msg + '\n');
}

function rel(absPath) {
  // pathFromRoot always starts with /
  return absPath.replace(/^\//, '');
}

async function writeOut(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

async function copyFonts() {
  const files = await readdir(FONTS_SRC);
  for (const f of files) {
    if (f.endsWith('.woff2')) {
      await copyFile(path.join(FONTS_SRC, f), path.join(OUT, 'assets/fonts', f));
    }
  }
}

/**
 * Copy example data/project files into docs/examples/data/ so the static
 * handbook can serve direct downloads from the detail pages.
 * Generator-type entries have no file — nothing to copy.
 */
async function copyExampleFiles(examples) {
  if (!examples?.entries?.length) return;
  const destDir = path.join(OUT, 'examples', 'data');
  await mkdir(destDir, { recursive: true });
  for (const ex of examples.entries) {
    if (!ex.file) continue;
    const src = path.join(REPO, 'examples', ex.file);
    const dest = path.join(destDir, path.basename(ex.file));
    try {
      await copyFile(src, dest);
    } catch (err) {
      console.warn(`[handbook] Could not copy ${ex.file}: ${err.message}`);
    }
  }
}

async function copyKatexAssets() {
  const katexOut = path.join(OUT, 'assets/katex');
  const katexFontsOut = path.join(katexOut, 'fonts');
  await mkdir(katexFontsOut, { recursive: true });
  await copyFile(KATEX_CSS_SRC, path.join(katexOut, 'katex.min.css'));
  const files = await readdir(KATEX_FONTS_SRC);
  for (const f of files) {
    // woff2 only — modern browsers, smaller payload.
    if (f.endsWith('.woff2')) {
      await copyFile(path.join(KATEX_FONTS_SRC, f), path.join(katexFontsOut, f));
    }
  }
}

// Minimal inline favicon — shared by all pages and the picker.
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#0066cc"/>
  <text x="16" y="23" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="19" fill="#fff">D.</text>
</svg>
`;

main().catch((err) => {
  console.error(`${COLORS.red}✗ build failed:${COLORS.reset}`, err);
  process.exit(1);
});
