/**
 * license-report — attribution for shipped runtime dependencies.
 * Reads each runtime dep's package.json + LICENSE from node_modules and
 * produces (a) THIRD-PARTY-LICENSES.txt body and (b) a licenses-data ES module.
 * Zero dependencies; deterministic (sorted, no timestamps).
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** The six libraries bundled into the shipped app (package.json dependencies). */
export const RUNTIME_DEPS = [
  '@alpinejs/csp', 'katex', 'opentype.js', 'papaparse', 'prismjs', 'xlsx',
];

/**
 * Bundled assets whose license differs from the npm package they ship with,
 * and which are not npm packages themselves. Each entry is appended verbatim
 * to THIRD-PARTY-LICENSES.txt but NOT to the compact in-app page data.
 */
export const EXTRA_TEXT_ATTRIBUTIONS = [
  {
    name: 'KaTeX fonts (KaTeX_*)',
    license: 'SIL OFL 1.1',
    url: 'https://github.com/KaTeX/KaTeX',
    text: `Copyright (c) 2009-2021, KaTeX Contributors, with Reserved Font Name "KaTeX".

SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting — in part or in whole — any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.`,
  },
];

/** SPDX fallback texts for deps that declare a license but ship no LICENSE file. */
const SPDX_FALLBACK = {
  MIT: `MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,
};

const LICENSE_FILE_RE = /^(LICENSE|LICENCE|COPYING)(\.(txt|md))?$/i;
const NOTICE_FILE_RE = /^NOTICE(\.(txt|md))?$/i;

function readPkg(appDir, dep) {
  const p = join(appDir, 'node_modules', dep, 'package.json');
  return JSON.parse(readFileSync(p, 'utf8'));
}

function findFile(dir, re) {
  if (!existsSync(dir)) return null;
  const name = readdirSync(dir).find(f => re.test(f));
  return name ? join(dir, name) : null;
}

function spdx(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license && pkg.license.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses) && pkg.licenses[0]) return pkg.licenses[0].type;
  return 'UNKNOWN';
}

function homepage(pkg) {
  if (pkg.homepage) return pkg.homepage;
  const repo = pkg.repository;
  const url = typeof repo === 'string' ? repo : (repo && repo.url);
  if (url) return url.replace(/^git\+/, '').replace(/\.git$/, '');
  return `https://www.npmjs.com/package/${pkg.name}`;
}

/**
 * Resolve attribution entries for all runtime deps. Sorted by name.
 * @throws if a dep has neither a LICENSE file nor an SPDX fallback.
 */
export async function collectLicenseData(appDir) {
  const entries = RUNTIME_DEPS.map((dep) => {
    const pkg = readPkg(appDir, dep);
    const depDir = join(appDir, 'node_modules', dep);
    const license = spdx(pkg);
    const licFile = findFile(depDir, LICENSE_FILE_RE);
    let text = licFile ? readFileSync(licFile, 'utf8').trim() : (SPDX_FALLBACK[license] || '');
    const noticeFile = findFile(depDir, NOTICE_FILE_RE);
    if (noticeFile) text += `\n\n--- NOTICE ---\n${readFileSync(noticeFile, 'utf8').trim()}`;
    if (!text) throw new Error(`license-report: no license text for ${dep} (${license})`);
    return { name: pkg.name, version: pkg.version, license, url: homepage(pkg), text };
  });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

/** Render the compact ES module consumed by the licenses page (no full text). */
export function renderLicenseDataModule(entries) {
  const slim = entries.map(({ name, version, license, url }) => ({ name, version, license, url }));
  return `// AUTO-GENERATED by tools/license-report — do not edit.\n`
    + `export const LICENSES = ${JSON.stringify(slim, null, 2)};\n`;
}

/** Render THIRD-PARTY-LICENSES.txt (header block + verbatim license per dep). */
export function renderLicenseText(entries, extraAttributions = EXTRA_TEXT_ATTRIBUTIONS) {
  const head = 'DMAIC.io — Third-Party Open-Source Licenses\n'
    + '===========================================\n\n'
    + 'The DMAIC.io app bundles the following third-party libraries.\n'
    + 'Each is distributed under its own license, reproduced verbatim below.\n';
  const blocks = entries.map(e =>
    `\n${'='.repeat(72)}\n${e.name} ${e.version} — ${e.license}\n${e.url}\n${'='.repeat(72)}\n\n${e.text}\n`);
  const extraBlocks = extraAttributions.map(e =>
    `\n${'='.repeat(72)}\n${e.name} — ${e.license}\n${e.url}\n${'='.repeat(72)}\n\n${e.text}\n`);
  return head + blocks.join('') + extraBlocks.join('');
}
