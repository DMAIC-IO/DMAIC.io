const DATA_BASE = 'js/modules/triz-contradiction-matrix/data';
let _dataPromise = null;
const _cache = { parameters: [], principles: [], matrix: [] };

export async function loadData() {
  if (_dataPromise) return _dataPromise;
  _dataPromise = Promise.all([
    fetch(`${DATA_BASE}/parameters.json`, { cache: 'no-cache' }).then(r => r.json()),
    fetch(`${DATA_BASE}/principles.json`, { cache: 'no-cache' }).then(r => r.json()),
    fetch(`${DATA_BASE}/matrix.json`, { cache: 'no-cache' }).then(r => r.json()),
  ]).then(([p, pr, mx]) => {
    _cache.parameters = p.parameters;
    _cache.principles = pr.principles;
    _cache.matrix = mx.cells;
  });
  return _dataPromise;
}

export function getCached() {
  return _cache;
}

function _lookupCached(model) {
  const cache = getCached();
  const i = model.improving;
  const j = model.worsening;
  if (i == null || j == null || i === j) return null;
  const row = cache.matrix[Number(i) - 1];
  if (!row) return null;
  return row[Number(j) - 1] ?? null;
}

export class State {
  improving = null;
  worsening = null;
  problemNote = '';
  showMatrix = false;

  hasContent() {
    return this.improving != null || this.worsening != null || Boolean(this.problemNote);
  }

  get showHint() {
    return !this.improving || !this.worsening;
  }
  get showWarn() {
    return this.improving && this.worsening && this.improving === this.worsening;
  }
  get showNoContradiction() {
    if (!this.improving || !this.worsening || this.improving === this.worsening) return false;
    const pids = _lookupCached(this);
    return !pids || !pids.length;
  }
  get showPrinciples() {
    if (!this.improving || !this.worsening || this.improving === this.worsening) return false;
    const pids = _lookupCached(this);
    return pids && pids.length > 0;
  }
  get principlesList() {
    const pids = _lookupCached(this);
    if (!pids) return [];
    const cache = getCached();
    return pids.map(pid => cache.principles.find(p => p.id === pid)).filter(Boolean);
  }

  toJSON() {
    return {
      improving: this.improving,
      worsening: this.worsening,
      problemNote: this.problemNote,
      showMatrix: this.showMatrix,
    };
  }

  static fromJSON(d) {
    const s = new State();
    if (!d) return s;
    s.improving = d.improving ? Number(d.improving) : null;
    s.worsening = d.worsening ? Number(d.worsening) : null;
    s.problemNote = typeof d.problemNote === 'string' ? d.problemNote : '';
    s.showMatrix = Boolean(d.showMatrix);
    return s;
  }
}
