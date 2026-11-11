/**
 * Der frühere CSV-Leser der Beispieldatensätze, unverändert — nur noch
 * Vergleichsmaßstab für examples-csv-compare.test.js.
 */
export function legacyParseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  if (rows.length === 0) return { columns: [], rows: [] };

  const headers = rows[0].map(h => h.trim());
  const dataRows = rows.slice(1).filter(r => r.some(c => c.length > 0));

  const columns = headers.map((name, idx) => {
    const values = dataRows.map(r => coerce(r[idx]));
    const type = values.every(v => v == null || typeof v === 'number') ? 'numeric' : 'text';
    return { name, type, values };
  });

  return { columns, rows: dataRows };
}

function coerce(s) {
  if (s == null) return null;
  const trimmed = String(s).trim();
  if (trimmed === '') return null;
  const num = Number(trimmed.replace(',', '.'));
  if (!Number.isNaN(num) && /^-?\d+([.,]\d+)?([eE][-+]?\d+)?$/.test(trimmed)) return num;
  return trimmed;
}

// ─── Seeded PRNG + Normal distribution ─────────────────────────
