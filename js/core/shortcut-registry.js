/**
 * Shortcut Registry
 * Central source of truth for user-configurable keyboard shortcuts.
 * Hardcoded handlers in modules call `matches(event, id)` instead of
 * checking key combos directly; user overrides are persisted under
 * `settings.shortcuts.<id>` in the global settings blob.
 *
 * Scope semantics for conflict detection only — handlers remain
 * attached where they are; `matches()` returns true based on the
 * configured combo. A `global` binding collides with any other; a
 * non-`global` binding collides only within its own scope and with
 * `global`.
 */

const DEFINITIONS = [
  {
    id: 'global.exportProject',
    category: 'general',
    scope: 'global',
    descriptionKey: 'settings.shortcutsLabel.exportProject',
    defaultCombo: 'Ctrl+S',
  },
  {
    id: 'datagrid.undo',
    category: 'datagrid',
    scope: 'datagrid',
    descriptionKey: 'settings.shortcutsLabel.undo',
    defaultCombo: 'Ctrl+Z',
  },
  {
    id: 'datagrid.redo',
    category: 'datagrid',
    scope: 'datagrid',
    descriptionKey: 'settings.shortcutsLabel.redo',
    defaultCombo: 'Ctrl+Y',
    aliasCombos: ['Ctrl+Shift+Z'],
  },
  {
    id: 'datagrid.selectAll',
    category: 'datagrid',
    scope: 'datagrid',
    descriptionKey: 'settings.shortcutsLabel.selectAll',
    defaultCombo: 'Ctrl+A',
  },
  {
    id: 'datagrid.editCell',
    category: 'datagrid',
    scope: 'datagrid',
    descriptionKey: 'settings.shortcutsLabel.editCell',
    defaultCombo: 'F2',
  },
  {
    id: 'worksheet.openFormulaEditor',
    category: 'worksheet',
    scope: 'worksheet',
    descriptionKey: 'settings.shortcutsLabel.openFormulaEditor',
    defaultCombo: 'F4',
  },
  {
    id: 'worksheet.applyFormula',
    category: 'worksheet',
    scope: 'worksheet',
    descriptionKey: 'settings.shortcutsLabel.applyFormula',
    defaultCombo: 'Ctrl+Enter',
  },
  {
    id: 'vocCtxTree.commit',
    category: 'vocCtxTree',
    scope: 'vocCtxTree',
    descriptionKey: 'settings.shortcutsLabel.vocCommit',
    defaultCombo: 'Ctrl+Enter',
  },
];

const DEFINITION_BY_ID = Object.fromEntries(DEFINITIONS.map(d => [d.id, d]));

/** Normalize a key string for comparison: lowercase, single letter for single letter. */
function normalizeKeyToken(key) {
  if (!key) return '';
  if (key.length === 1) return key.toLowerCase();
  // Preserve case for named keys (Enter, Escape, F1..F12, ArrowLeft, …).
  return key;
}

/**
 * Parse a combo string like "Ctrl+Shift+S" or "F2" into a normalized
 * shape. Modifier order does not matter; Meta is treated as Ctrl
 * (so Cmd-bindings work on macOS).
 */
export function parseCombo(combo) {
  if (typeof combo !== 'string' || !combo.trim()) return null;
  const tokens = combo.split('+').map(t => t.trim()).filter(Boolean);
  const out = { ctrl: false, shift: false, alt: false, key: '' };
  for (const tok of tokens) {
    const low = tok.toLowerCase();
    if (low === 'ctrl' || low === 'control' || low === 'cmd' || low === 'meta') out.ctrl = true;
    else if (low === 'shift') out.shift = true;
    else if (low === 'alt' || low === 'option') out.alt = true;
    else out.key = normalizeKeyToken(tok);
  }
  if (!out.key) return null;
  return out;
}

/** Build a normalized combo from a KeyboardEvent. Returns null for pure modifier presses. */
export function normalizeCombo(event) {
  const k = event.key;
  if (!k || k === 'Control' || k === 'Shift' || k === 'Alt' || k === 'Meta') return null;
  return {
    ctrl: Boolean(event.ctrlKey || event.metaKey),
    shift: Boolean(event.shiftKey),
    alt: Boolean(event.altKey),
    key: normalizeKeyToken(k),
  };
}

/** Render a normalized combo back to a display/storage string. */
export function formatCombo(parsed) {
  if (!parsed) return '';
  const parts = [];
  if (parsed.ctrl) parts.push('Ctrl');
  if (parsed.shift) parts.push('Shift');
  if (parsed.alt) parts.push('Alt');
  // Title-case single letters for nicer display.
  let key = parsed.key;
  if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  return parts.join('+');
}

function combosEqual(a, b) {
  if (!a || !b) return false;
  return a.ctrl === b.ctrl && a.shift === b.shift && a.alt === b.alt && a.key === b.key;
}

function scopesCollide(a, b) {
  if (a === b) return true;
  return a === 'global' || b === 'global';
}

class ShortcutRegistry {
  constructor() {
    this._stateManager = null;
    this._eventBus = null;
    this._initialized = false;
  }

  init(stateManager, eventBus) {
    this._stateManager = stateManager;
    this._eventBus = eventBus;
    this._initialized = true;
  }

  /** Internal: read the configured combo for an id (override or default). */
  _readBinding(id) {
    const def = DEFINITION_BY_ID[id];
    if (!def) return null;
    const override = this._initialized
      ? this._stateManager.get(`settings.shortcuts.${id}`)
      : null;
    return override || def.defaultCombo;
  }

  /** All combos that should fire this binding (primary + aliases when at default). */
  _allCombosFor(id) {
    const def = DEFINITION_BY_ID[id];
    if (!def) return [];
    const override = this._initialized
      ? this._stateManager.get(`settings.shortcuts.${id}`)
      : null;
    if (override) return [override];
    const out = [def.defaultCombo];
    if (Array.isArray(def.aliasCombos)) out.push(...def.aliasCombos);
    return out;
  }

  /**
   * Does the keyboard event match the configured shortcut?
   * Safe to call before init() (falls back to defaults).
   */
  matches(event, id) {
    if (!event) return false;
    const fired = normalizeCombo(event);
    if (!fired) return false;
    const combos = this._allCombosFor(id);
    for (const c of combos) {
      const parsed = parseCombo(c);
      if (combosEqual(parsed, fired)) return true;
    }
    return false;
  }

  /** Configured combo string for an id ('Ctrl+S' etc.). */
  getCombo(id) {
    return this._readBinding(id);
  }

  /** Definition (immutable metadata) for an id. */
  getDefinition(id) {
    return DEFINITION_BY_ID[id] || null;
  }

  /** All shortcuts as an array, in definition order. */
  getAll() {
    return DEFINITIONS.map(def => ({
      id: def.id,
      category: def.category,
      scope: def.scope,
      descriptionKey: def.descriptionKey,
      defaultCombo: def.defaultCombo,
      aliasCombos: def.aliasCombos || [],
      currentCombo: this._readBinding(def.id),
      isCustom: Boolean(this._initialized && this._stateManager.get(`settings.shortcuts.${def.id}`)),
    }));
  }

  /** Set a user override. Pass a combo string; null/empty resets. */
  setBinding(id, combo) {
    if (!this._initialized) return;
    if (!DEFINITION_BY_ID[id]) return;
    if (!combo) { this.resetBinding(id); return; }
    const parsed = parseCombo(combo);
    if (!parsed) return;
    this._stateManager.set(`settings.shortcuts.${id}`, formatCombo(parsed));
    this._eventBus.emit('shortcuts:changed', { id });
  }

  /** Reset a single binding to default. */
  resetBinding(id) {
    if (!this._initialized) return;
    if (!DEFINITION_BY_ID[id]) return;
    this._stateManager.set(`settings.shortcuts.${id}`, null);
    this._eventBus.emit('shortcuts:changed', { id });
  }

  /** Reset all bindings to defaults. */
  resetAll() {
    if (!this._initialized) return;
    for (const def of DEFINITIONS) {
      this._stateManager.set(`settings.shortcuts.${def.id}`, null);
    }
    this._eventBus.emit('shortcuts:changed', { id: null });
  }

  /**
   * Find shortcuts that would conflict with a given combo in the given
   * scope. Returns array of { id, descriptionKey, scope } — excludes
   * the entry identified by exceptId (used while editing).
   */
  findConflicts(combo, scope, exceptId) {
    const parsed = parseCombo(combo);
    if (!parsed) return [];
    const out = [];
    for (const def of DEFINITIONS) {
      if (def.id === exceptId) continue;
      if (!scopesCollide(def.scope, scope)) continue;
      const candidates = this._allCombosFor(def.id);
      for (const c of candidates) {
        if (combosEqual(parseCombo(c), parsed)) {
          out.push({ id: def.id, descriptionKey: def.descriptionKey, scope: def.scope });
          break;
        }
      }
    }
    return out;
  }
}

export const shortcutRegistry = new ShortcutRegistry();
