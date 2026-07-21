/**
 * D.Mike — Process Map image export helpers (process-map-export.js)
 *
 * Pure rendering of a process-map steps array into a high-DPI PNG (Canvas-2D)
 * or a standalone SVG string. Lifted verbatim from the legacy module
 * (_exportImage / _drawPmapCanvas / _drawPmapSVGOut) so the exported pixels stay
 * byte-identical. No module/DOM dependencies beyond an offscreen <canvas> and
 * the CSS custom properties read from :root.
 */

import { downloadBlob } from '../../core/export-utils.js';

/** Read the themed colour palette from the document root. */
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const cv = (v, fb) => cs.getPropertyValue(v).trim() || fb;
  return {
    bgPrimary:    cv('--color-bg-primary', '#ffffff'),
    bgSecondary:  cv('--color-bg-secondary', '#f8f9fa'),
    bgTertiary:   cv('--color-bg-tertiary', '#e9ecef'),
    border:       cv('--color-border-secondary', '#dee2e6'),
    borderStrong: cv('--color-border-primary', '#cacad0'),
    textPrimary:  cv('--color-text-primary', '#212529'),
    textSecondary: cv('--color-text-secondary', '#6c757d'),
    textTertiary: cv('--color-text-tertiary', '#adb5bd'),
    accent:       cv('--color-accent', '#0066cc'),
    accentBg:     cv('--color-pmap-step-accent-bg', 'rgba(0,102,204,0.10)'),
    inputColor:   cv('--color-pmap-input', '#34c759'),
    inputBg:      cv('--color-pmap-input-bg', 'rgba(52,199,89,0.10)'),
    outputColor:  cv('--color-pmap-output', '#ff9500'),
    outputBg:     cv('--color-pmap-output-bg', 'rgba(255,149,0,0.10)'),
    connector:    cv('--color-pmap-connector', '#dee2e6'),
    va:           cv('--color-pmap-va', '#34c759'),
    vaBg:         cv('--color-pmap-va-bg', 'rgba(52,199,89,0.12)'),
    bnva:         cv('--color-pmap-bnva', '#ff9f0a'),
    bnvaBg:       cv('--color-pmap-bnva-bg', 'rgba(255,159,10,0.12)'),
    nva:          cv('--color-pmap-nva', '#ff3b30'),
    nvaBg:        cv('--color-pmap-nva-bg', 'rgba(255,59,48,0.12)'),
    param:        cv('--color-pmap-param', '#007aff'),
    paramBg:      cv('--color-pmap-param-bg', 'rgba(0,122,255,0.12)'),
    noise:        cv('--color-pmap-noise', '#af52de'),
    noiseBg:      cv('--color-pmap-noise-bg', 'rgba(175,82,222,0.12)'),
  };
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? `${str.slice(0, max - 1)  }…` : str;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function roundRectBottom(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.closePath();
}

/** Compute the per-step layout geometry shared by PNG + SVG renderers. */
function computeLayout(steps) {
  const PAD = 20;
  const CARD_W = 280;
  const IO_PANEL_W = 160;
  const IO_GAP_X = 12;
  const IO_ITEM_H = 28;
  const IO_ITEM_GAP = 6;
  const IO_LABEL_H = 18;
  const HEADER_H = 36;
  const DESC_LINE_H = 18;
  const SUBSTEP_H = 26;
  const SUBSTEPS_BAR_H = 24;
  const CONNECTOR_H = 28;

  const stepLayouts = steps.map((s) => {
    const descH = s.description ? DESC_LINE_H + 8 : 0;
    const subCount = (s.substeps || []).length;
    const subH = subCount > 0 ? SUBSTEPS_BAR_H + subCount * SUBSTEP_H + 8 : SUBSTEPS_BAR_H;
    const cardH = HEADER_H + descH + subH;
    const inCount = s.inputs.filter((io) => io.name).length;
    const outCount = s.outputs.filter((io) => io.name).length;
    const ioH = IO_LABEL_H + 6 + Math.max(inCount, outCount, 0) * (IO_ITEM_H + IO_ITEM_GAP);
    return { cardH, ioH, inCount, outCount, rowH: Math.max(cardH, ioH) };
  });

  const totalH = stepLayouts.reduce((a, l) => a + l.rowH, 0)
    + Math.max(0, steps.length - 1) * CONNECTOR_H;
  const W = PAD * 2 + IO_PANEL_W + IO_GAP_X + CARD_W + IO_GAP_X + IO_PANEL_W;
  const H = PAD * 2 + totalH;
  const cardX = PAD + IO_PANEL_W + IO_GAP_X;

  return {
    PAD, CARD_W, IO_PANEL_W, IO_GAP_X, IO_ITEM_H, IO_ITEM_GAP, IO_LABEL_H,
    HEADER_H, DESC_LINE_H, SUBSTEP_H, SUBSTEPS_BAR_H, CONNECTOR_H,
    stepLayouts, W, H, cardX,
  };
}

/**
 * Render the process map to a PNG and trigger a download.
 * @param {Array<object>} steps
 * @param {(key:string)=>string} t i18n translator (bare keys)
 * @param {function} [notify]
 */
export function exportPmapPNG(steps, t, notify) {
  const c = readColors();
  const L = computeLayout(steps);
  const {
    PAD, CARD_W, IO_GAP_X: IO_GX, IO_ITEM_H: IO_IH, IO_ITEM_GAP: IO_IG, IO_LABEL_H: IO_LH,
    HEADER_H: HDR_H, DESC_LINE_H: DESC_LH, SUBSTEP_H: SUB_H, SUBSTEPS_BAR_H: SUB_BAR_H,
    CONNECTOR_H: CONN_H, stepLayouts: layouts, W, H, cardX,
  } = L;
  const IO_PW = L.IO_PANEL_W;

  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  const FONT_SM = '11px "DM Sans", system-ui, sans-serif';
  const FONT_MONO_XS = '11px "JetBrains Mono", monospace';
  const FONT_TITLE = '600 13px "DM Sans", system-ui, sans-serif';
  const FONT_LABEL = '600 10px "DM Sans", system-ui, sans-serif';

  ctx.fillStyle = c.bgPrimary;
  ctx.fillRect(0, 0, W, H);

  let y = PAD;

  steps.forEach((step, idx) => {
    const layout = layouts[idx];
    const rowH = layout.rowH;

    ctx.fillStyle = c.bgSecondary;
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 1;
    roundRect(ctx, cardX, y, CARD_W, layout.cardH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = c.border;
    ctx.beginPath();
    ctx.moveTo(cardX, y + HDR_H);
    ctx.lineTo(cardX + CARD_W, y + HDR_H);
    ctx.stroke();

    const numText = String(idx + 1).padStart(2, '0');
    ctx.font = FONT_MONO_XS;
    const numW = ctx.measureText(numText).width + 12;
    const pillX = cardX + 10;
    const pillY = y + 8;
    const pillH = 20;
    roundRect(ctx, pillX, pillY, numW, pillH, 4);
    ctx.fillStyle = c.accentBg;
    ctx.fill();
    ctx.fillStyle = c.accent;
    ctx.font = FONT_MONO_XS;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(numText, pillX + numW / 2, pillY + pillH / 2);

    let titleOffsetX = pillX + numW + 8;
    if (step.valueType) {
      const vtText = t(step.valueType);
      ctx.font = FONT_LABEL;
      const vtW = ctx.measureText(vtText).width + 10;
      const vtX = pillX + numW + 4;
      const vtColors = { va: [c.va, c.vaBg], bnva: [c.bnva, c.bnvaBg], nva: [c.nva, c.nvaBg] };
      const [vtFg, vtBgColor] = vtColors[step.valueType];
      roundRect(ctx, vtX, pillY, vtW, pillH, 4);
      ctx.fillStyle = vtBgColor;
      ctx.fill();
      ctx.fillStyle = vtFg;
      ctx.font = FONT_LABEL;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(vtText, vtX + vtW / 2, pillY + pillH / 2);
      titleOffsetX = vtX + vtW + 6;
    }

    ctx.fillStyle = c.textPrimary;
    ctx.font = FONT_TITLE;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const title = step.title || t('stepNamePlaceholder');
    ctx.fillText(truncate(title, 28), titleOffsetX, pillY + pillH / 2);

    let contentY = y + HDR_H;
    if (step.description) {
      contentY += 8;
      ctx.fillStyle = c.textSecondary;
      ctx.font = FONT_SM;
      ctx.textAlign = 'left';
      ctx.fillText(truncate(step.description, 42), cardX + 12, contentY + DESC_LH / 2);
    }

    const barY = y + layout.cardH - SUB_BAR_H - ((step.substeps || []).length > 0 ? (step.substeps.length * SUB_H + 8) : 0);
    ctx.strokeStyle = c.border;
    ctx.beginPath();
    ctx.moveTo(cardX, barY);
    ctx.lineTo(cardX + CARD_W, barY);
    ctx.stroke();

    const hasSubsteps = (step.substeps || []).length > 0;
    ctx.fillStyle = hasSubsteps ? c.accent : c.textTertiary;
    ctx.font = FONT_LABEL;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const barLabel = t('substepsLabel') + (hasSubsteps ? ` (${step.substeps.length})` : '');
    ctx.fillText(barLabel, cardX + 24, barY + SUB_BAR_H / 2);
    ctx.fillText(hasSubsteps ? '▾' : '▸', cardX + 10, barY + SUB_BAR_H / 2);

    if (hasSubsteps) {
      const subAreaY = barY + SUB_BAR_H;
      ctx.fillStyle = c.bgTertiary;
      roundRectBottom(ctx, cardX, subAreaY, CARD_W, step.substeps.length * SUB_H + 8, 8);
      ctx.fill();

      step.substeps.forEach((ss, si) => {
        const sy = subAreaY + 4 + si * SUB_H;
        ctx.fillStyle = c.bgSecondary;
        roundRect(ctx, cardX + 8, sy, CARD_W - 16, SUB_H - 2, 4);
        ctx.fill();

        const subNum = `${idx + 1}.${si + 1}`;
        ctx.font = FONT_MONO_XS;
        ctx.fillStyle = c.accent;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(subNum, cardX + 14, sy + (SUB_H - 2) / 2);

        ctx.fillStyle = c.textPrimary;
        ctx.font = FONT_SM;
        ctx.fillText(truncate(ss.title, 30), cardX + 48, sy + (SUB_H - 2) / 2);
      });
    }

    const ioBaseY = y + 4;

    const inX = PAD;
    if (step.inputs.length > 0) {
      ctx.fillStyle = c.inputColor;
      ctx.font = FONT_LABEL;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`● ${  t('inputs').toUpperCase()  } »`, inX, ioBaseY + IO_LH / 2);

      step.inputs.forEach((io, i) => {
        if (!io.name) return;
        const iy = ioBaseY + IO_LH + 6 + i * (IO_IH + IO_IG);
        ctx.fillStyle = c.inputBg;
        roundRect(ctx, inX, iy, IO_PW, IO_IH, 4);
        ctx.fill();

        ctx.fillStyle = c.inputColor;
        ctx.beginPath();
        ctx.arc(inX + 10, iy + IO_IH / 2, 3.5, 0, Math.PI * 2);
        ctx.fill();

        let nameX = inX + 20;
        if (io.inputType) {
          const itLabel = io.inputType === 'param' ? t('inputTypeParam') : t('inputTypeNoise');
          // Classified inputs stay in the input identity color; the x/n
          // letter carries the type, not a competing hue (Bug 015).
          const itFg = c.inputColor;
          const itBg = c.inputBg;
          ctx.font = FONT_LABEL;
          const itW = ctx.measureText(itLabel).width + 6;
          roundRect(ctx, inX + 18, iy + 4, itW, IO_IH - 8, 3);
          ctx.fillStyle = itBg;
          ctx.fill();
          ctx.fillStyle = itFg;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(itLabel, inX + 18 + itW / 2, iy + IO_IH / 2);
          nameX = inX + 18 + itW + 4;
        }

        ctx.fillStyle = c.textPrimary;
        ctx.font = FONT_SM;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(truncate(io.name, io.inputType ? 16 : 20), nameX, iy + IO_IH / 2);
      });
    }

    const outX = cardX + CARD_W + IO_GX;
    if (step.outputs.length > 0) {
      ctx.fillStyle = c.outputColor;
      ctx.font = FONT_LABEL;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`» ${  t('outputs').toUpperCase()  } ●`, outX, ioBaseY + IO_LH / 2);

      step.outputs.forEach((io, i) => {
        if (!io.name) return;
        const iy = ioBaseY + IO_LH + 6 + i * (IO_IH + IO_IG);
        ctx.fillStyle = c.outputBg;
        roundRect(ctx, outX, iy, IO_PW, IO_IH, 4);
        ctx.fill();

        ctx.fillStyle = c.outputColor;
        ctx.beginPath();
        ctx.arc(outX + IO_PW - 10, iy + IO_IH / 2, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = c.textPrimary;
        ctx.font = FONT_SM;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(truncate(io.name, 20), outX + 6, iy + IO_IH / 2);
      });
    }

    y += rowH;

    if (idx < steps.length - 1) {
      const ax = cardX + CARD_W / 2;
      const ay1 = y + 2;
      const ay2 = y + CONN_H - 2;
      ctx.strokeStyle = c.connector;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ax, ay1);
      ctx.lineTo(ax, ay2);
      ctx.stroke();
      ctx.fillStyle = c.connector;
      ctx.beginPath();
      ctx.moveTo(ax - 4, ay2 - 5);
      ctx.lineTo(ax + 4, ay2 - 5);
      ctx.lineTo(ax, ay2);
      ctx.closePath();
      ctx.fill();
      y += CONN_H;
    }
  });

  canvas.toBlob((blob) => downloadBlob(blob, 'process-map.png'), 'image/png');
  notify?.('PNG ✓', 'success');
}

/**
 * Render the process map to a standalone SVG string and trigger a download.
 * @param {Array<object>} steps
 * @param {(key:string)=>string} t i18n translator (bare keys)
 * @param {function} [notify]
 */
export function exportPmapSVG(steps, t, notify) {
  const c = readColors();
  const L = computeLayout(steps);
  const {
    PAD, CARD_W, IO_GAP_X: IO_GX, IO_ITEM_H: IO_IH, IO_ITEM_GAP: IO_IG, IO_LABEL_H: IO_LH,
    HEADER_H: HDR_H, DESC_LINE_H: DESC_LH, SUBSTEP_H: SUB_H, SUBSTEPS_BAR_H: SUB_BAR_H,
    CONNECTOR_H: CONN_H, stepLayouts: layouts, W, H, cardX,
  } = L;
  const IO_PW = L.IO_PANEL_W;

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const svgFill = (color) => {
    if (!color) return 'fill="none"';
    const m = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/);
    if (m) {
      const hex = `#${Number(m[1]).toString(16).padStart(2, '0')}${Number(m[2]).toString(16).padStart(2, '0')}${Number(m[3]).toString(16).padStart(2, '0')}`;
      const a = m[4] !== undefined ? Number(m[4]) : 1;
      return a < 1 ? `fill="${hex}" fill-opacity="${a}"` : `fill="${hex}"`;
    }
    return `fill="${color}"`;
  };

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  svg += `<rect width="${W}" height="${H}" ${svgFill(c.bgPrimary)}/>`;

  let y = PAD;

  steps.forEach((step, idx) => {
    const layout = layouts[idx];
    const rowH = layout.rowH;
    const hasSubsteps = (step.substeps || []).length > 0;

    svg += `<rect x="${cardX}" y="${y}" width="${CARD_W}" height="${layout.cardH}" rx="8" ${svgFill(c.bgSecondary)} stroke="${c.border}"/>`;
    svg += `<line x1="${cardX}" y1="${y + HDR_H}" x2="${cardX + CARD_W}" y2="${y + HDR_H}" stroke="${c.border}"/>`;

    const numText = String(idx + 1).padStart(2, '0');
    const numW = numText.length * 7 + 12;
    const pillX = cardX + 10;
    const pillY = y + 8;
    const pillH = 20;
    svg += `<rect x="${pillX}" y="${pillY}" width="${numW}" height="${pillH}" rx="4" ${svgFill(c.accentBg)}/>`;
    svg += `<text x="${pillX + numW / 2}" y="${pillY + pillH / 2}" fill="${c.accent}" font-size="11" font-family="JetBrains Mono, monospace" text-anchor="middle" dominant-baseline="central">${numText}</text>`;

    let titleSvgX = pillX + numW + 8;
    if (step.valueType) {
      const vtText = t(step.valueType);
      const vtW = vtText.length * 7 + 10;
      const vtX = pillX + numW + 4;
      const vtColors = { va: [c.va, c.vaBg], bnva: [c.bnva, c.bnvaBg], nva: [c.nva, c.nvaBg] };
      const [vtFg, vtBgColor] = vtColors[step.valueType];
      svg += `<rect x="${vtX}" y="${pillY}" width="${vtW}" height="${pillH}" rx="4" ${svgFill(vtBgColor)}/>`;
      svg += `<text x="${vtX + vtW / 2}" y="${pillY + pillH / 2}" fill="${vtFg}" font-size="10" font-weight="600" font-family="DM Sans, system-ui, sans-serif" text-anchor="middle" dominant-baseline="central">${esc(vtText)}</text>`;
      titleSvgX = vtX + vtW + 6;
    }
    const title = step.title || t('stepNamePlaceholder');
    svg += `<text x="${titleSvgX}" y="${pillY + pillH / 2}" fill="${c.textPrimary}" font-size="13" font-weight="600" font-family="DM Sans, system-ui, sans-serif" dominant-baseline="central">${esc(truncate(title, 28))}</text>`;

    if (step.description) {
      svg += `<text x="${cardX + 12}" y="${y + HDR_H + 8 + DESC_LH / 2}" fill="${c.textSecondary}" font-size="11" font-family="DM Sans, system-ui, sans-serif" dominant-baseline="central">${esc(truncate(step.description, 42))}</text>`;
    }

    const barY = y + layout.cardH - SUB_BAR_H - (hasSubsteps ? (step.substeps.length * SUB_H + 8) : 0);
    svg += `<line x1="${cardX}" y1="${barY}" x2="${cardX + CARD_W}" y2="${barY}" stroke="${c.border}"/>`;
    const barColor = hasSubsteps ? c.accent : c.textTertiary;
    const chevron = hasSubsteps ? '▾' : '▸';
    const barLabel = t('substepsLabel') + (hasSubsteps ? ` (${step.substeps.length})` : '');
    svg += `<text x="${cardX + 10}" y="${barY + SUB_BAR_H / 2}" fill="${barColor}" font-size="10" font-weight="600" font-family="DM Sans, system-ui, sans-serif" dominant-baseline="central">${chevron}</text>`;
    svg += `<text x="${cardX + 24}" y="${barY + SUB_BAR_H / 2}" fill="${barColor}" font-size="10" font-weight="600" font-family="DM Sans, system-ui, sans-serif" dominant-baseline="central">${esc(barLabel)}</text>`;

    if (hasSubsteps) {
      const subAreaY = barY + SUB_BAR_H;
      const subAreaH = step.substeps.length * SUB_H + 8;
      svg += `<path d="M${cardX},${subAreaY} L${cardX + CARD_W},${subAreaY} L${cardX + CARD_W},${subAreaY + subAreaH - 8} Q${cardX + CARD_W},${subAreaY + subAreaH} ${cardX + CARD_W - 8},${subAreaY + subAreaH} L${cardX + 8},${subAreaY + subAreaH} Q${cardX},${subAreaY + subAreaH} ${cardX},${subAreaY + subAreaH - 8} Z" ${svgFill(c.bgTertiary)}/>`;

      step.substeps.forEach((ss, si) => {
        const sy = subAreaY + 4 + si * SUB_H;
        svg += `<rect x="${cardX + 8}" y="${sy}" width="${CARD_W - 16}" height="${SUB_H - 2}" rx="4" ${svgFill(c.bgSecondary)}/>`;
        const subNum = `${idx + 1}.${si + 1}`;
        svg += `<text x="${cardX + 14}" y="${sy + (SUB_H - 2) / 2}" fill="${c.accent}" font-size="11" font-family="JetBrains Mono, monospace" dominant-baseline="central">${subNum}</text>`;
        svg += `<text x="${cardX + 48}" y="${sy + (SUB_H - 2) / 2}" fill="${c.textPrimary}" font-size="11" font-family="DM Sans, system-ui, sans-serif" dominant-baseline="central">${esc(truncate(ss.title, 30))}</text>`;
      });
    }

    const ioBaseY = y + 4;

    const inX = PAD;
    if (step.inputs.length > 0) {
      svg += `<text x="${inX}" y="${ioBaseY + IO_LH / 2}" fill="${c.inputColor}" font-size="10" font-weight="600" font-family="DM Sans, system-ui, sans-serif" dominant-baseline="central">${esc(`● ${  t('inputs').toUpperCase()  } »`)}</text>`;

      step.inputs.forEach((io, i) => {
        if (!io.name) return;
        const iy = ioBaseY + IO_LH + 6 + i * (IO_IH + IO_IG);
        svg += `<rect x="${inX}" y="${iy}" width="${IO_PW}" height="${IO_IH}" rx="4" ${svgFill(c.inputBg)}/>`;
        svg += `<circle cx="${inX + 10}" cy="${iy + IO_IH / 2}" r="3.5" fill="${c.inputColor}"/>`;

        let nameXSvg = inX + 20;
        let nameMaxLen = 20;
        if (io.inputType) {
          const itLabel = io.inputType === 'param' ? t('inputTypeParam') : t('inputTypeNoise');
          const itFg = io.inputType === 'param' ? c.param : c.noise;
          const itBgColor = io.inputType === 'param' ? c.paramBg : c.noiseBg;
          const itW = itLabel.length * 7 + 6;
          svg += `<rect x="${inX + 18}" y="${iy + 4}" width="${itW}" height="${IO_IH - 8}" rx="3" ${svgFill(itBgColor)}/>`;
          svg += `<text x="${inX + 18 + itW / 2}" y="${iy + IO_IH / 2}" fill="${itFg}" font-size="10" font-weight="600" font-family="DM Sans, system-ui, sans-serif" text-anchor="middle" dominant-baseline="central">${esc(itLabel)}</text>`;
          nameXSvg = inX + 18 + itW + 4;
          nameMaxLen = 16;
        }
        svg += `<text x="${nameXSvg}" y="${iy + IO_IH / 2}" fill="${c.textPrimary}" font-size="11" font-family="DM Sans, system-ui, sans-serif" dominant-baseline="central">${esc(truncate(io.name, nameMaxLen))}</text>`;
      });
    }

    const outX = cardX + CARD_W + IO_GX;
    if (step.outputs.length > 0) {
      svg += `<text x="${outX}" y="${ioBaseY + IO_LH / 2}" fill="${c.outputColor}" font-size="10" font-weight="600" font-family="DM Sans, system-ui, sans-serif" dominant-baseline="central">${esc(`» ${  t('outputs').toUpperCase()  } ●`)}</text>`;

      step.outputs.forEach((io, i) => {
        if (!io.name) return;
        const iy = ioBaseY + IO_LH + 6 + i * (IO_IH + IO_IG);
        svg += `<rect x="${outX}" y="${iy}" width="${IO_PW}" height="${IO_IH}" rx="4" ${svgFill(c.outputBg)}/>`;
        svg += `<circle cx="${outX + IO_PW - 10}" cy="${iy + IO_IH / 2}" r="3.5" fill="${c.outputColor}"/>`;
        svg += `<text x="${outX + 6}" y="${iy + IO_IH / 2}" fill="${c.textPrimary}" font-size="11" font-family="DM Sans, system-ui, sans-serif" dominant-baseline="central">${esc(truncate(io.name, 20))}</text>`;
      });
    }

    y += rowH;

    if (idx < steps.length - 1) {
      const ax = cardX + CARD_W / 2;
      const ay1 = y + 2;
      const ay2 = y + CONN_H - 2;
      svg += `<line x1="${ax}" y1="${ay1}" x2="${ax}" y2="${ay2}" stroke="${c.connector}" stroke-width="1.5"/>`;
      svg += `<polygon points="${ax - 4},${ay2 - 5} ${ax + 4},${ay2 - 5} ${ax},${ay2}" fill="${c.connector}"/>`;
      y += CONN_H;
    }
  });

  svg += '</svg>';
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'process-map.svg');
  notify?.('SVG ✓', 'success');
}
