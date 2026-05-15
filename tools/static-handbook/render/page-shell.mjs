/**
 * Full HTML page shell for every static handbook page.
 * Produces a self-contained document — no JS required on the client.
 *
 * Includes:
 *   - <head> with title, description, canonical, hreflang, JSON-LD
 *   - Top nav (logo, language switch, "App öffnen" CTA)
 *   - Breadcrumbs
 *   - Main content slot
 *   - Footer with DMAIC.io link + lightweight legal row
 */

import { escapeHtml, escapeAttr } from './escape.mjs';

const SITE_ORIGIN = 'https://dmaic.io/app/latest/docs';
const APP_ORIGIN = 'https://dmaic.io';

const PHASES = ['define', 'measure', 'analyze', 'improve', 'control', 'data'];

const UI_STRINGS = {
  de: {
    navHandbook: 'Handbuch',
    navModules: 'Module',
    navLab: 'Algorithmus-Lab',
    navTraining: 'Schulungen',
    navApp: 'App öffnen',
    home: 'Startseite',
    breadcrumbRoot: 'Handbuch',
    breadcrumbLab: 'Algorithmus-Lab',
    breadcrumbTraining: 'Schulungen',
    trainingIntro: 'Einstieg in die DMAIC-Methodik und Umstiegshilfen für Nutzer aus anderen Statistik-Werkzeugen. Jede Schulungsseite ist bewusst knapp gehalten und verweist auf die passenden Werkzeuge im Handbuch.',
    training: {
      dmaicTitle: 'DMAIC verstehen',
      dmaicShort: 'Die fünf Phasen Define, Measure, Analyze, Improve, Control — worum es geht, wann DMAIC passt und typische Fallstricke.',
      dmadvTitle: 'DMADV verstehen',
      dmadvShort: 'Die Design-for-Six-Sigma-Variante (Define · Measure · Analyze · Design · Verify) — wann sie statt DMAIC eingesetzt wird und wie ihre Phasen ineinandergreifen.',
      trizTitle: 'TRIZ verstehen',
      trizShort: 'Theorie des erfinderischen Problemlösens nach Altschuller — Widersprüche, Idealität, 40 Prinzipien und Widerspruchsmatrix.',
      minitabTitle: 'Für Minitab-Nutzer',
      minitabShort: 'Wo finden Minitab-Nutzer ihre gewohnten Analysen in DMAIC.io wieder — mit Menü-Mapping und Umstiegs-Tipps.',
      jmpTitle: 'Für JMP-Nutzer',
      jmpShort: 'Wo finden JMP-Nutzer Distribution, Fit Y by X, DOE und Quality Tools in DMAIC.io — mit Menü-Mapping und Umstiegs-Tipps.',
    },
    ctaTitle: 'Dieses Werkzeug direkt nutzen',
    ctaBody: 'DMAIC.io ist kostenlos, läuft vollständig in deinem Browser — keine Anmeldung, keine Daten verlassen dein Gerät.',
    ctaButton: 'App öffnen',
    footerTagline: 'Open-Source Six-Sigma-Werkzeug. Läuft zu 100 % in deinem Browser.',
    footerDocs: 'Handbuch',
    footerImprint: 'Impressum',
    footerPrivacy: 'Datenschutz',
    phase: {
      define: 'Define',
      measure: 'Measure',
      analyze: 'Analyze',
      improve: 'Improve',
      control: 'Control',
      design: 'Design',
      verify: 'Verify',
      data: 'Daten & Werkzeuge',
      extras: 'Weitere',
    },
    phaseIntro: {
      define: 'Phase 1 des DMAIC-Zyklus — Problem, Ziele, Scope und Stakeholder definieren.',
      measure: 'Phase 2 des DMAIC-Zyklus — Prozess vermessen, Daten sammeln, Messsysteme validieren.',
      analyze: 'Phase 3 des DMAIC-Zyklus — Ursachen finden, Hypothesen testen, Muster aufdecken.',
      improve: 'Phase 4 des DMAIC-Zyklus — Lösungen entwickeln, testen und Wirkung belegen.',
      control: 'Phase 5 des DMAIC-Zyklus — Verbesserungen absichern und nachhaltig verankern.',
      design: 'Phase 4 des DMADV-Zyklus — Lösung gestalten, Prototypen entwickeln, Entwurf optimieren.',
      verify: 'Phase 5 des DMADV-Zyklus — Entwurf validieren und Übergabe in den Serienbetrieb.',
      data: 'Werkzeuge zur Datenaufbereitung, Visualisierung und -erzeugung — phasen­übergreifend nutzbar.',
      extras: 'Werkzeuge ohne feste Phasenzuordnung im aktiven Zyklus — per Drag & Drop in eine Phase verschiebbar.',
    },
    labIntro: 'Verifizierte statistische Algorithmen mit Formeln, Annahmen und Referenzen. Jeder Algorithmus ist gegen Minitab, R oder NIST-Referenzdaten validiert.',
    algoFormulas: 'Formeln',
    algoAssumptions: 'Annahmen',
    algoLimitations: 'Einschränkungen',
    algoReferences: 'Referenzen',
    algoMinitab: 'Minitab-Entsprechung',
    algoShort: 'Kurzbeschreibung',
    algoLong: 'Beschreibung',
    sectionHeadings: {
      overview: 'Überblick',
      methodology: 'Methodik',
      example: 'Beispiel',
      interpretation: 'Interpretation',
      pitfalls: 'Stolperfallen',
      whenToUse: 'Wann einsetzen',
      whenNotToUse: 'Wann nicht einsetzen',
      workflow: 'Ablauf',
      advanced: 'Erweiterte Optionen',
    },
    handbookTitle: 'DMAIC.io Handbuch',
    handbookSub: 'Die DMAIC-Werkzeugbibliothek — als Nachschlagewerk.',
    modulesHeading: 'Module',
    cyclesHeading: 'Zyklen',
    cyclesIntro: 'DMAIC.io unterstützt mehrere Verbesserungs- und Entwicklungszyklen. Wähle einen Zyklus, um seine Phasen und die zugehörigen Werkzeuge im Überblick zu sehen.',
    cycleIndexHeading: 'Werkzeuge im Zyklus',
    cycleExtrasHeading: 'Weitere Werkzeuge',
    cycleExtrasIntro: 'Diese Werkzeuge haben in diesem Zyklus keine feste Phasen-Zuordnung. In der App erscheinen sie im rechten „Weitere"-Tile und können per Drag & Drop in eine Phase gezogen werden.',
    moduleCyclesHeading: 'Verfügbar in folgenden Zyklen',
    moduleCyclesUnmappedIn: 'Im Zyklus {cycle} ohne feste Phase (im „Weitere"-Tile).',
    examplesHeading: 'Beispieldaten',
    examplesIntro: 'Dieses Modul wird mit den folgenden Beispieldatensätzen ausgeliefert — mit einem Klick in der App ladbar.',
    examplesIndexHeading: 'Beispieldaten — Übersicht',
    examplesIndexIntro: 'Alle Beispieldatensätze und Projektvorlagen, die mit DMAIC.io ausgeliefert werden. Jeder Eintrag öffnet sich per Deeplink direkt im passenden Modul.',
    examplesIndexCount: '{n} Beispiele über {modules} Module',
    examplesIndexInModule: 'Modul: {module}',
    exampleSource: 'Quelle',
    exampleLicense: 'Lizenz',
    exampleSpec: 'Spezifikation',
    exampleColumns: 'Spalten',
    examplePreview: 'Vorschau',
    examplePreviewNote: 'Erste {n} von {total} Zeilen',
    exampleDownload: 'CSV herunterladen',
    exampleProjectDownload: 'JSON herunterladen',
    exampleOpenInApp: 'In der App öffnen',
    exampleAlsoIn: 'Auch genutzt in',
    exampleRuntime: 'Wird zur Laufzeit reproduzierbar erzeugt (Seed im Quellcode).',
    breadcrumbExamples: 'Beispieldaten',
    exampleTypeLabel: {
      dataset: 'Datensatz',
      project: 'Projektvorlage',
      generator: 'Generator',
    },
    langOther: 'English',
    langOtherPath: '/en/',
  },
  en: {
    navHandbook: 'Handbook',
    navModules: 'Modules',
    navLab: 'Algorithm Lab',
    navTraining: 'Training',
    navApp: 'Open App',
    home: 'Home',
    breadcrumbRoot: 'Handbook',
    breadcrumbLab: 'Algorithm Lab',
    breadcrumbTraining: 'Training',
    trainingIntro: 'An introduction to the DMAIC methodology and onboarding guides for users coming from other statistics tools. Every training page is deliberately concise and links back to the matching tools in the handbook.',
    training: {
      dmaicTitle: 'Understanding DMAIC',
      dmaicShort: 'The five phases Define, Measure, Analyze, Improve, Control — what they mean, when DMAIC is the right tool and common pitfalls.',
      dmadvTitle: 'Understanding DMADV',
      dmadvShort: 'The Design-for-Six-Sigma variant (Define · Measure · Analyze · Design · Verify) — when to use it instead of DMAIC and how its phases connect.',
      trizTitle: 'Understanding TRIZ',
      trizShort: 'Altshuller\'s Theory of Inventive Problem Solving — contradictions, ideality, the 40 principles and the contradiction matrix.',
      minitabTitle: 'For Minitab users',
      minitabShort: 'Where Minitab users find their usual analyses inside DMAIC.io — with menu mapping and switching tips.',
      jmpTitle: 'For JMP users',
      jmpShort: 'Where JMP users find Distribution, Fit Y by X, DOE and Quality Tools inside DMAIC.io — with menu mapping and switching tips.',
    },
    ctaTitle: 'Use this tool right away',
    ctaBody: 'DMAIC.io is free, runs entirely in your browser — no sign-up, no data leaves your device.',
    ctaButton: 'Open App',
    footerTagline: 'Open-source Six Sigma toolkit. 100 % in-browser, always.',
    footerDocs: 'Handbook',
    footerImprint: 'Imprint',
    footerPrivacy: 'Privacy',
    phase: {
      define: 'Define',
      measure: 'Measure',
      analyze: 'Analyze',
      improve: 'Improve',
      control: 'Control',
      design: 'Design',
      verify: 'Verify',
      data: 'Data & Tools',
      extras: 'More',
    },
    phaseIntro: {
      define: 'Phase 1 of the DMAIC cycle — define problem, goals, scope and stakeholders.',
      measure: 'Phase 2 of the DMAIC cycle — map the process, collect data, validate measurement systems.',
      analyze: 'Phase 3 of the DMAIC cycle — surface root causes, test hypotheses, uncover patterns.',
      improve: 'Phase 4 of the DMAIC cycle — design, test and prove out improvements.',
      control: 'Phase 5 of the DMAIC cycle — lock in gains and make improvements stick.',
      design: 'Phase 4 of the DMADV cycle — design the solution, build prototypes, optimise the draft.',
      verify: 'Phase 5 of the DMADV cycle — validate the design and hand it over to operations.',
      data: 'Data preparation, visualisation and generation tools — usable across every phase.',
      extras: 'Tools without a fixed phase assignment in the active cycle — drag & drop them into a phase.',
    },
    labIntro: 'Verified statistical algorithms with formulas, assumptions and references. Every algorithm is validated against Minitab, R, or NIST reference data.',
    algoFormulas: 'Formulas',
    algoAssumptions: 'Assumptions',
    algoLimitations: 'Limitations',
    algoReferences: 'References',
    algoMinitab: 'Minitab equivalent',
    algoShort: 'Summary',
    algoLong: 'Description',
    sectionHeadings: {
      overview: 'Overview',
      methodology: 'Methodology',
      example: 'Example',
      interpretation: 'Interpretation',
      pitfalls: 'Pitfalls',
      whenToUse: 'When to use',
      whenNotToUse: 'When not to use',
      workflow: 'Workflow',
      advanced: 'Advanced options',
    },
    handbookTitle: 'DMAIC.io Handbook',
    handbookSub: 'The DMAIC toolbox — as a reference work.',
    modulesHeading: 'Modules',
    cyclesHeading: 'Cycles',
    cyclesIntro: 'DMAIC.io supports multiple improvement and development cycles. Pick a cycle to see its phases and the matching tools at a glance.',
    cycleIndexHeading: 'Tools in this cycle',
    cycleExtrasHeading: 'More tools',
    cycleExtrasIntro: 'These tools have no fixed phase assignment in this cycle. In the app they appear in the trailing "More" tile and can be dragged into a phase.',
    moduleCyclesHeading: 'Available in the following cycles',
    moduleCyclesUnmappedIn: 'No fixed phase in cycle {cycle} (lives in the "More" tile).',
    examplesHeading: 'Examples',
    examplesIntro: 'This module ships with the following example datasets — load any of them in the app with a single click.',
    examplesIndexHeading: 'Examples — overview',
    examplesIndexIntro: 'All example datasets and project templates that ship with DMAIC.io. Every entry opens directly in the matching module via deeplink.',
    examplesIndexCount: '{n} examples across {modules} modules',
    examplesIndexInModule: 'Module: {module}',
    exampleSource: 'Source',
    exampleLicense: 'License',
    exampleSpec: 'Specification',
    exampleColumns: 'Columns',
    examplePreview: 'Preview',
    examplePreviewNote: 'First {n} of {total} rows',
    exampleDownload: 'Download CSV',
    exampleProjectDownload: 'Download JSON',
    exampleOpenInApp: 'Open in app',
    exampleAlsoIn: 'Also used in',
    exampleRuntime: 'Generated at runtime with a reproducible seed (defined in source).',
    breadcrumbExamples: 'Examples',
    exampleTypeLabel: {
      dataset: 'Dataset',
      project: 'Project template',
      generator: 'Generator',
    },
    langOther: 'Deutsch',
    langOtherPath: '/de/',
  },
};

export function getStrings(lang) {
  return UI_STRINGS[lang] || UI_STRINGS.en;
}

export const CONSTANTS = {
  SITE_ORIGIN,
  APP_ORIGIN,
  PHASES,
};

/**
 * Render a complete HTML page.
 *
 * @param {object} opts
 * @param {'de'|'en'} opts.lang
 * @param {string} opts.title            - document <title>
 * @param {string} opts.description      - <meta name="description">
 * @param {string} opts.pathFromRoot     - absolute path of this page (e.g. "/de/define/sipoc.html")
 * @param {string} opts.altPathFromRoot  - mirror path in the other language (for hreflang)
 * @param {Array<{label:string, href?:string}>} opts.breadcrumbs
 * @param {string} opts.bodyHtml         - main content HTML (without CTA/footer)
 * @param {string} [opts.headingKey]     - Schema.org TechArticle headline, defaults to title
 * @param {boolean} [opts.showCta=true]
 */
export function renderPage(opts) {
  const {
    lang,
    title,
    description,
    pathFromRoot,
    altPathFromRoot,
    breadcrumbs,
    bodyHtml,
    headingKey,
    showCta = true,
    needsKatex = false,
  } = opts;

  const s = getStrings(lang);
  const canonical = SITE_ORIGIN + pathFromRoot;
  const altHref = altPathFromRoot ? SITE_ORIGIN + altPathFromRoot : null;
  const otherLang = lang === 'de' ? 'en' : 'de';

  const cssHref = relativeTo(pathFromRoot, '/assets/handbook.css');
  const faviconHref = relativeTo(pathFromRoot, '/assets/favicon.svg');
  const katexCssHref = needsKatex ? relativeTo(pathFromRoot, '/assets/katex/katex.min.css') : null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: headingKey || title,
    inLanguage: lang,
    url: canonical,
    isAccessibleForFree: true,
    publisher: {
      '@type': 'Organization',
      name: 'DMAIC.io',
      url: APP_ORIGIN,
    },
  };

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeAttr(description)}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${escapeAttr(canonical)}">
${altHref ? `<link rel="alternate" hreflang="${otherLang}" href="${escapeAttr(altHref)}">
<link rel="alternate" hreflang="${lang}" href="${escapeAttr(canonical)}">
<link rel="alternate" hreflang="x-default" href="${escapeAttr(SITE_ORIGIN + '/')}">` : ''}
<link rel="icon" type="image/svg+xml" href="${escapeAttr(faviconHref)}">
<link rel="stylesheet" href="${escapeAttr(cssHref)}">${katexCssHref ? `
<link rel="stylesheet" href="${escapeAttr(katexCssHref)}">` : ''}
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeAttr(title)}">
<meta property="og:description" content="${escapeAttr(description)}">
<meta property="og:url" content="${escapeAttr(canonical)}">
<meta property="og:site_name" content="DMAIC.io">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
${renderNav(lang, pathFromRoot, altPathFromRoot)}
<main class="handbook-main">
${renderBreadcrumbs(breadcrumbs)}
${bodyHtml}
${showCta ? renderCta(lang) : ''}
</main>
${renderFooter(lang)}
</body>
</html>
`;
}

function renderNav(lang, currentPath, altPath) {
  const s = getStrings(lang);
  const root = `/${lang}/`;
  const labRoot = `/${lang}/lab/`;
  const trainingRoot = `/${lang}/training/`;
  const otherLangRoot = altPath || `/${lang === 'de' ? 'en' : 'de'}/`;

  const logoHref = relativeTo(currentPath, root);
  const labHref = relativeTo(currentPath, labRoot);
  const trainingHref = relativeTo(currentPath, trainingRoot);
  const altLangHref = relativeTo(currentPath, otherLangRoot);

  return `<header class="handbook-nav">
  <div class="handbook-nav__inner">
    <a href="${escapeAttr(logoHref)}" class="handbook-nav__logo">
      <span class="handbook-nav__mark">D</span>
      <span class="handbook-nav__brand">DMAIC.io <span class="handbook-nav__docs">docs</span></span>
    </a>
    <nav class="handbook-nav__links" aria-label="${escapeAttr(s.navHandbook)}">
      <a href="${escapeAttr(logoHref)}">${escapeHtml(s.navModules)}</a>
      <a href="${escapeAttr(labHref)}">${escapeHtml(s.navLab)}</a>
      <a href="${escapeAttr(trainingHref)}">${escapeHtml(s.navTraining)}</a>
    </nav>
    <div class="handbook-nav__actions">
      <a href="${escapeAttr(altLangHref)}" class="handbook-nav__lang" rel="alternate" hreflang="${lang === 'de' ? 'en' : 'de'}">${escapeHtml(s.langOther)}</a>
      <a href="${APP_ORIGIN}/" class="handbook-nav__cta">${escapeHtml(s.navApp)} →</a>
    </div>
  </div>
</header>`;
}

function renderBreadcrumbs(items) {
  if (!items || items.length === 0) return '';
  const parts = items.map((item, idx) => {
    const last = idx === items.length - 1;
    if (last || !item.href) return `<li aria-current="page">${escapeHtml(item.label)}</li>`;
    return `<li><a href="${escapeAttr(item.href)}">${escapeHtml(item.label)}</a></li>`;
  });
  return `<nav class="handbook-breadcrumbs" aria-label="Breadcrumb"><ol>${parts.join('')}</ol></nav>`;
}

function renderCta(lang) {
  const s = getStrings(lang);
  return `<aside class="handbook-cta">
  <h2 class="handbook-cta__title">${escapeHtml(s.ctaTitle)}</h2>
  <p class="handbook-cta__body">${escapeHtml(s.ctaBody)}</p>
  <a href="${APP_ORIGIN}/" class="handbook-cta__button">${escapeHtml(s.ctaButton)} →</a>
</aside>`;
}

function renderFooter(lang) {
  const s = getStrings(lang);
  return `<footer class="handbook-footer">
  <div class="handbook-footer__inner">
    <div class="handbook-footer__brand">
      <span class="handbook-footer__logo">DMAIC.io</span>
      <span class="handbook-footer__tag">${escapeHtml(s.footerTagline)}</span>
    </div>
    <nav class="handbook-footer__links" aria-label="${escapeAttr(s.footerDocs)}">
      <a href="${APP_ORIGIN}/">DMAIC.io</a>
      <a href="/${lang}/">${escapeHtml(s.footerDocs)}</a>
      <a href="${APP_ORIGIN}/#imprint">${escapeHtml(s.footerImprint)}</a>
      <a href="${APP_ORIGIN}/#privacy">${escapeHtml(s.footerPrivacy)}</a>
    </nav>
  </div>
</footer>`;
}

/**
 * Compute a relative URL from one absolute site path to another.
 * Keeps links portable across host configurations and file:// previews.
 */
function relativeTo(from, to) {
  if (!from || !to) return to;
  const fromParts = from.split('/').slice(0, -1); // drop filename
  const toParts = to.split('/');
  // remove common prefix
  let i = 0;
  while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i++;
  const up = fromParts.length - i;
  const rest = toParts.slice(i).join('/');
  const prefix = up === 0 ? './' : '../'.repeat(up);
  const result = prefix + rest;
  return result || './';
}
