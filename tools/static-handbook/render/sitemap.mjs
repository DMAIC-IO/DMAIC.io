/**
 * Build sitemap.xml and robots.txt for the static handbook.
 *
 * URLs are emitted in the order they are registered so the output diff
 * stays stable across runs.
 */

const SITE_ORIGIN = 'https://dmaic.io/app/latest/docs';

export function renderSitemap(paths) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = paths
    .map((p) => {
      const loc = SITE_ORIGIN + normalize(p.path);
      return `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq || 'monthly'}</changefreq>
    <priority>${p.priority ?? '0.7'}</priority>
  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export function renderRobots() {
  return `User-agent: *
Allow: /

Sitemap: ${SITE_ORIGIN}/sitemap.xml
`;
}

// Strip "index.html" suffix from directory URLs so the canonical form
// is /de/ instead of /de/index.html.
function normalize(p) {
  return p.replace(/\/index\.html$/, '/');
}
