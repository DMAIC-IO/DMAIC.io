/**
 * chart-core.js — Pure math & SVG primitives for the D.Mike chart framework.
 * No DOM state, no side effects. All functions are stateless and testable in isolation.
 */

// ── Axis Ticks ───────────────────────────────────────────────────────

/**
 * Compute a "nice" rounded number for tick spacing.
 * @param {number} range - The data range
 * @param {boolean} round - true for tick spacing, false for range bounds
 * @returns {number}
 */
export function niceNum(range, round) {
  const exp = Math.floor(Math.log10(range));
  const frac = range / Math.pow(10, exp);
  let nice;
  if (round) {
    if (frac < 1.5) nice = 1;
    else if (frac < 3) nice = 2;
    else if (frac < 7) nice = 5;
    else nice = 10;
  } else if (frac <= 1) nice = 1;
    else if (frac <= 2) nice = 2;
    else if (frac <= 5) nice = 5;
    else nice = 10;
  return nice * Math.pow(10, exp);
}

/**
 * Generate evenly-spaced tick values for a given data range.
 * @param {number} dMin - Data minimum
 * @param {number} dMax - Data maximum
 * @param {number} [maxTicks=8] - Maximum number of ticks
 * @returns {{ ticks: number[], min: number, max: number, step: number }}
 */
export function generateTicks(dMin, dMax, maxTicks = 8) {
  let min = dMin;
  let max = dMax;
  if (min === max) { min -= 1; max += 1; }
  const range = niceNum(max - min, false);
  const step = niceNum(range / (maxTicks - 1), true);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  const precision = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  for (let v = lo; v <= hi + step * 0.001; v += step) {
    ticks.push(parseFloat(v.toFixed(precision)));
  }
  return { ticks, min: lo, max: hi, step };
}

// ── Scales ───────────────────────────────────────────────────────────

/**
 * Create a linear mapping function: domain → range.
 * @param {number} domainMin
 * @param {number} domainMax
 * @param {number} rangeMin
 * @param {number} rangeMax
 * @returns {function(number): number}
 */
export function linearScale(domainMin, domainMax, rangeMin, rangeMax) {
  const dSpan = domainMax - domainMin || 1;
  const rSpan = rangeMax - rangeMin;
  return (val) => rangeMin + (val - domainMin) / dSpan * rSpan;
}

// ── Number Formatting ────────────────────────────────────────────────

/**
 * Format a number with optional fixed decimals and locale support.
 * @param {number} val
 * @param {number|null} [decimals=null] - null = auto precision
 * @param {string} [locale='de'] - 'de' or 'en'
 * @returns {string}
 */
export function formatNum(val, decimals = null, locale = 'de') {
  let str;
  if (decimals === null || decimals === undefined) {
    if (Math.abs(val) >= 1000) str = val.toFixed(0);
    else if (Math.abs(val) >= 1) str = parseFloat(val.toPrecision(4)).toString();
    else str = parseFloat(val.toPrecision(3)).toString();
  } else {
    str = val.toFixed(decimals);
  }
  if (locale === 'de') {
    // Swap . and , for German locale
    // First replace . with placeholder, then handle
    const parts = str.split('.');
    if (parts.length === 2) {
      str = `${parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.')  },${  parts[1]}`;
    } else {
      str = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
  } else {
    const parts = str.split('.');
    if (parts.length === 2) {
      str = `${parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')  }.${  parts[1]}`;
    } else {
      str = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
  }
  return str;
}

// ── SVG Helpers ──────────────────────────────────────────────────────

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Create an SVG element with attributes and optional parent.
 * @param {string} tag - SVG tag name
 * @param {Object} [attrs] - Attribute key/value pairs
 * @param {SVGElement} [parent] - If given, appends the element
 * @returns {SVGElement}
 */
export function svgEl(tag, attrs, parent) {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) {
        el.setAttribute(k, attrs[k]);
      }
    }
  }
  if (parent) parent.appendChild(el);
  return el;
}

/**
 * Create an SVG <text> element.
 * @param {string} text - Text content
 * @param {Object} [attrs] - Attributes
 * @param {SVGElement} [parent]
 * @returns {SVGTextElement}
 */
export function svgText(text, attrs, parent) {
  const el = svgEl('text', attrs, parent);
  el.textContent = text;
  return el;
}

// ── Color Utilities ──────────────────────────────────────────────────

/**
 * Parse an rgba() or rgb() string into components.
 * @param {string} str - e.g. 'rgba(44,95,138,0.8)'
 * @returns {{ r: number, g: number, b: number, a: number }}
 */
export function parseRGBA(str) {
  const m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (!m) return { r: 100, g: 100, b: 100, a: 1 };
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] !== undefined ? Number(m[4]) : 1 };
}

/**
 * Stringify RGBA components back to CSS.
 * @param {{ r: number, g: number, b: number, a: number }} c
 * @returns {string}
 */
export function rgbaStr(c) {
  return `rgba(${c.r},${c.g},${c.b},${c.a.toFixed(2)})`;
}

/**
 * Resolve a CSS value (including custom properties) to a computed color.
 * Reads from the document at call time — never cached.
 * @param {string} value - CSS color or custom property like 'var(--color-chart-1)'
 * @returns {string} Computed color string
 */
export function resolveColor(value) {
  if (!value || typeof value !== 'string') return 'rgb(100,100,100)';
  // If it doesn't contain var(, treat as literal
  if (!value.includes('var(')) return value;
  const temp = document.createElement('div');
  temp.style.color = value;
  document.body.appendChild(temp);
  const resolved = getComputedStyle(temp).color;
  document.body.removeChild(temp);
  return resolved;
}

/**
 * Read the full chart color sequence from CSS custom properties.
 * @returns {string[]} Array of 10 resolved color strings
 */
export function getChartColors() {
  const styles = getComputedStyle(document.documentElement);
  const colors = [];
  for (let i = 1; i <= 10; i++) {
    colors.push(styles.getPropertyValue(`--color-chart-${i}`).trim());
  }
  return colors;
}

// ── Data Utilities ───────────────────────────────────────────────────

/**
 * Compute min/max extent for a given axis across all series.
 * @param {Array} series - Array of series objects with x/y arrays
 * @param {string} axis - 'x' or 'y'
 * @returns {{ min: number, max: number }}
 */
export function dataExtent(series, axis) {
  const vals = [];
  series.forEach((s) => {
    (s[axis] || []).forEach((v) => { vals.push(v); });
  });
  if (!vals.length) return { min: 0, max: 1 };
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

// ── Line Dash Patterns ──────────────────────────────────────────────

/**
 * Convert a dash style name to an SVG stroke-dasharray value.
 * @param {string} style - 'solid' | 'dash' | 'dot' | 'dashdot' | 'longdash'
 * @param {number} [width=2] - Stroke width (scales the pattern)
 * @returns {string} SVG stroke-dasharray value, or 'none' for solid
 */
export function dashArray(style, width = 2) {
  switch (style) {
    case 'dash':     return `${width * 4},${width * 2.5}`;
    case 'dot':      return `${width},${width * 2}`;
    case 'dashdot':  return `${width * 4},${width * 2},${width},${width * 2}`;
    case 'longdash': return `${width * 8},${width * 3}`;
    default:         return 'none';
  }
}

// ── Marker Symbols ──────────────────────────────────────────────────

/**
 * Draw a marker symbol at (cx, cy) inside an SVG parent.
 * @param {SVGElement} parent
 * @param {string} symbol - 'circle'|'square'|'diamond'|'triangle'|'triangle-down'|'cross'|'star'
 * @param {number} cx
 * @param {number} cy
 * @param {number} r - Radius
 * @param {string} fill
 * @param {string} stroke
 * @param {number} strokeWidth
 * @param {Object} [extraAttrs]
 * @returns {SVGElement}
 */
export function drawMarker(parent, symbol, cx, cy, r, fill, stroke, strokeWidth, extraAttrs) {
  const sw = strokeWidth !== undefined ? strokeWidth : 1.5;
  const attrs = extraAttrs || {};

  switch (symbol) {
    case 'square':
      return svgEl('rect', Object.assign({
        x: cx - r, y: cy - r, width: r * 2, height: r * 2,
        fill, stroke, 'stroke-width': sw
      }, attrs), parent);

    case 'diamond': {
      const d = `M${cx},${cy - r * 1.2}L${cx + r * 1.2},${cy}L${cx},${cy + r * 1.2}L${cx - r * 1.2},${cy}Z`;
      return svgEl('path', Object.assign({ d, fill, stroke, 'stroke-width': sw }, attrs), parent);
    }

    case 'triangle': {
      const h = r * 1.2;
      const d = `M${cx},${cy - h}L${cx + h},${cy + h * 0.7}L${cx - h},${cy + h * 0.7}Z`;
      return svgEl('path', Object.assign({ d, fill, stroke, 'stroke-width': sw }, attrs), parent);
    }

    case 'triangle-down': {
      const h = r * 1.2;
      const d = `M${cx},${cy + h}L${cx + h},${cy - h * 0.7}L${cx - h},${cy - h * 0.7}Z`;
      return svgEl('path', Object.assign({ d, fill, stroke, 'stroke-width': sw }, attrs), parent);
    }

    case 'cross': {
      const cr = r * 0.35;
      const d = `M${cx - cr},${cy - r}L${cx + cr},${cy - r}L${cx + cr},${cy - cr}` +
                `L${cx + r},${cy - cr}L${cx + r},${cy + cr}L${cx + cr},${cy + cr}` +
                `L${cx + cr},${cy + r}L${cx - cr},${cy + r}L${cx - cr},${cy + cr}` +
                `L${cx - r},${cy + cr}L${cx - r},${cy - cr}L${cx - cr},${cy - cr}Z`;
      return svgEl('path', Object.assign({ d, fill, stroke, 'stroke-width': sw }, attrs), parent);
    }

    case 'star': {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const rad = (i % 2 === 0) ? r * 1.1 : r * 0.5;
        const ang = Math.PI / 2 + i * Math.PI / 5;
        pts.push(`${(cx - Math.cos(ang) * rad).toFixed(2)},${(cy - Math.sin(ang) * rad).toFixed(2)}`);
      }
      return svgEl('polygon', Object.assign({
        points: pts.join(' '), fill, stroke, 'stroke-width': sw
      }, attrs), parent);
    }

    default: // circle
      return svgEl('circle', Object.assign({
        cx, cy, r, fill, stroke, 'stroke-width': sw
      }, attrs), parent);
  }
}

// ── Error Bar Resolution ────────────────────────────────────────────

/**
 * Resolve an error bar value to an absolute data coordinate.
 * @param {string} mode - 'absolute' | 'relative' | 'percent'
 * @param {number} baseVal - The data point value
 * @param {number} errVal - The error value
 * @param {number} direction - +1 or -1
 * @returns {number|null}
 */
export function resolveError(mode, baseVal, errVal, direction) {
  if (errVal === null || errVal === undefined) return null;
  switch (mode) {
    case 'absolute': return errVal;
    case 'relative': return baseVal + direction * Math.abs(errVal);
    case 'percent':  return baseVal + direction * Math.abs(baseVal * errVal / 100);
    default: return null;
  }
}

// ── Hatch Patterns ──────────────────────────────────────────────────

/**
 * Create an SVG <pattern> element for hatching.
 * @param {SVGDefsElement} defs
 * @param {string} id - Unique pattern ID
 * @param {Object} config - { pattern, patternColor, patternSolidity, color }
 * @returns {SVGPatternElement}
 */
export function createPattern(defs, id, config) {
  const size = 8;
  const pat = svgEl('pattern', {
    id, patternUnits: 'userSpaceOnUse', width: size, height: size
  }, defs);

  let lineColor;
  if (config.patternColor) {
    lineColor = config.patternColor;
  } else {
    const c = parseRGBA(config.color || 'rgba(100,100,100,1)');
    c.a = 1;
    lineColor = rgbaStr(c);
  }
  const sw = config.patternSolidity ? config.patternSolidity * 2 : 0.8;

  switch (config.pattern) {
    case '/':
      svgEl('line', { x1: 0, y1: size, x2: size, y2: 0, stroke: lineColor, 'stroke-width': sw }, pat);
      break;
    case '\\':
      svgEl('line', { x1: 0, y1: 0, x2: size, y2: size, stroke: lineColor, 'stroke-width': sw }, pat);
      break;
    case '-':
      svgEl('line', { x1: 0, y1: size / 2, x2: size, y2: size / 2, stroke: lineColor, 'stroke-width': sw }, pat);
      break;
    case '|':
      svgEl('line', { x1: size / 2, y1: 0, x2: size / 2, y2: size, stroke: lineColor, 'stroke-width': sw }, pat);
      break;
    case 'x':
      svgEl('line', { x1: 0, y1: size, x2: size, y2: 0, stroke: lineColor, 'stroke-width': sw }, pat);
      svgEl('line', { x1: 0, y1: 0, x2: size, y2: size, stroke: lineColor, 'stroke-width': sw }, pat);
      break;
    case '+':
      svgEl('line', { x1: 0, y1: size / 2, x2: size, y2: size / 2, stroke: lineColor, 'stroke-width': sw }, pat);
      svgEl('line', { x1: size / 2, y1: 0, x2: size / 2, y2: size, stroke: lineColor, 'stroke-width': sw }, pat);
      break;
    case '.':
      svgEl('circle', { cx: size / 2, cy: size / 2, r: sw, fill: lineColor }, pat);
      break;
  }

  return pat;
}
