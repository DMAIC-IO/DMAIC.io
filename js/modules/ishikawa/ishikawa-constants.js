/**
 * Ishikawa 6M — Shared constants.
 */

export const CATS = [
  { key: 'man',         color: '#2563eb' },
  { key: 'machine',     color: '#7c3aed' },
  { key: 'environment', color: '#059669' },
  { key: 'material',    color: '#d97706' },
  { key: 'measurement', color: '#dc2626' },
  { key: 'method',      color: '#0891b2' },
];

export const STATUS_KEYS = ['open', 'testing', 'confirmed', 'rejected'];
export const STATUS_CSS = { open: 'ishikawa__status-open', testing: 'ishikawa__status-test', confirmed: 'ishikawa__status-confirmed', rejected: 'ishikawa__status-rejected' };

export const EXP_COLS = ['#6366f1','#0891b2','#059669','#d97706','#dc2626','#7c3aed','#db2777','#2563eb','#84cc16','#f97316'];
export const LINE_COLS = ['#2563eb','#dc2626','#059669','#d97706','#7c3aed','#0891b2','#db2777','#84cc16','#f97316','#6366f1','#14b8a6','#f43f5e','#a855f7','#eab308','#22d3ee','#fb7185'];
