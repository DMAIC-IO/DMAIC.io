/**
 * Kern-Knöpfe und -Chips: Tokens je Theme, Kontrast der Rollen, Kernregeln.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { APP_DIR } from './build.mjs';

const VARS = readFileSync(join(APP_DIR, 'css/variables.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const COMPONENTS = readFileSync(join(APP_DIR, 'css/components.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Deklarationen des ersten Blocks mit genau diesem Selektor. */
function block(css, selector) {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `Block ${selector} fehlt`);
  const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const LIGHT = block(VARS, ':root');
const DARK = { ...LIGHT, ...block(VARS, '[data-theme="dark"]') };
const DARK_OWN = block(VARS, '[data-theme="dark"]');

/** Löst `var(--x)` rekursiv zu einem Hex-Wert auf. */
function resolve(theme, value) {
  const m = /^var\((--[\w-]+)\)$/.exec(value);
  if (!m) return value;
  assert.ok(m[1] in theme, `${m[1]} fehlt`);
  return resolve(theme, theme[m[1]]);
}

function luminance(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG-Kontrast zweier Hex-Farben. */
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const TOKENS = ['--btn-secondary-bg', '--btn-secondary-bg-hover', '--btn-secondary-border', '--btn-secondary-text',
  '--btn-danger-bg', '--btn-danger-bg-hover', '--btn-danger-text', '--chip-active-text', '--chip-border',
  '--chip-danger-bg', '--chip-danger-text', '--chip-danger-border'];

test('Tokens: alle Knopf-/Chip-Tokens in :root und [data-theme="dark"]', () => {
  for (const t of TOKENS) {
    assert.ok(t in LIGHT, `${t} fehlt in :root`);
    assert.ok(t in DARK_OWN, `${t} fehlt in [data-theme="dark"]`);
  }
});

test('Tokens: Gefahrfläche eigen, --color-error unverändert', () => {
  assert.equal(LIGHT['--btn-danger-bg'], '#d70015');
  assert.equal(DARK_OWN['--btn-danger-bg'], '#ff3b30');
  assert.equal(LIGHT['--color-error'], '#ff3b30');
  assert.ok(!('--color-error' in DARK_OWN), '--color-error bleibt nur in :root');
});

test('Kontrast: Text auf Fläche ≥ 4,5:1 je Rolle und Theme', () => {
  const PAIRS = [
    ['primary', '--color-text-inverse', '--color-accent'],
    ['primary:hover', '--color-text-inverse', '--color-accent-hover'],
    ['secondary', '--btn-secondary-text', '--btn-secondary-bg'],
    ['secondary:hover', '--btn-secondary-text', '--btn-secondary-bg-hover'],
    ['danger', '--btn-danger-text', '--btn-danger-bg'],
    ['danger:hover', '--btn-danger-text', '--btn-danger-bg-hover'],
    ['chip--active', '--chip-active-text', '--color-accent-light'],
    ['chip--danger', '--chip-danger-text', '--chip-danger-bg'],
  ];
  const low = [];
  for (const [name, theme] of [['hell', LIGHT], ['dunkel', DARK]]) {
    for (const [role, fg, bg] of PAIRS) {
      const c = contrast(resolve(theme, `var(${fg})`), resolve(theme, `var(${bg})`));
      if (c < 4.5) low.push(`${name} ${role}: ${c.toFixed(2)}:1`);
    }
  }
  assert.deepEqual(low, []);
});

test('Kontrast: Sekundärknopf hebt sich dunkel von der Karte ab', () => {
  const card = resolve(DARK, 'var(--color-bg-secondary)');
  assert.ok(resolve(DARK, 'var(--btn-secondary-bg)') !== card, 'Fläche ≠ Karte');
  assert.ok(contrast(resolve(DARK, 'var(--btn-secondary-border)'), card) > 1.4);
});

test('Chip-Rahmen = Rahmen des Sekundärknopfs (border-primary), je Theme', () => {
  for (const [name, theme] of [['hell', LIGHT], ['dunkel', DARK]]) {
    assert.equal(resolve(theme, 'var(--chip-border)'), resolve(theme, 'var(--btn-secondary-border)'), name);
    assert.equal(resolve(theme, 'var(--chip-border)'), resolve(theme, 'var(--color-border-primary)'), name);
  }
  const chip = /\.chip \{([^}]*)\}/.exec(COMPONENTS)?.[1] ?? '';
  assert.match(chip, /border:[^;]*var\(--chip-border\)/);
});

test('chip--danger: Fehlertönung aus Tokens, vom aktiven Chip verschieden', () => {
  const rule = /\.chip--danger[,\s][^{]*\{([^}]*)\}/.exec(COMPONENTS)?.[1] ?? '';
  assert.match(rule, /background:\s*var\(--chip-danger-bg\)/);
  assert.match(rule, /color:\s*var\(--chip-danger-text\)/);
  assert.match(rule, /border-color:\s*var\(--chip-danger-border\)/);
  for (const [name, theme] of [['hell', LIGHT], ['dunkel', DARK]]) {
    const bg = resolve(theme, 'var(--chip-danger-bg)');
    assert.notEqual(bg, resolve(theme, 'var(--color-accent-light)'), `${name}: Fläche ≠ aktiver Chip`);
    assert.notEqual(bg, resolve(theme, 'var(--btn-secondary-bg)'), `${name}: Fläche ≠ Chip`);
  }
});

test('components.css: Sperrzustand, Chip und Gefahr-Tokens', () => {
  for (const sel of ['.btn:disabled', '.btn--disabled', '.chip {', '.chip--active', '.chip:disabled', '.chip__dot']) {
    assert.ok(COMPONENTS.includes(sel), `${sel} fehlt`);
  }
  const danger = /\.btn--danger \{([^}]*)\}/.exec(COMPONENTS)?.[1] ?? '';
  assert.match(danger, /var\(--btn-danger-bg\)/);
  assert.doesNotMatch(COMPONENTS.slice(0, COMPONENTS.indexOf('.dmike-del-btn')), /--color-error/, 'Knöpfe nutzen --btn-danger-*');
  assert.doesNotMatch(COMPONENTS, /\.btn--(ghost|icon)\.btn--disabled/, 'Sonderregeln ersetzt durch .btn--disabled');
});

test('Vorlagen: btn--small gibt es nicht (btn--sm)', () => {
  const found = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'chunks') walk(p); } else if (/\.(html|js)$/.test(e.name) && /\bbtn--small\b/.test(readFileSync(p, 'utf8'))) found.push(p.slice(APP_DIR.length + 1));
    }
  };
  walk(join(APP_DIR, 'js'));
  assert.deepEqual(found, []);
});
