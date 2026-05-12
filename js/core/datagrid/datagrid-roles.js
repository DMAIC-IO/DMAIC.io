/**
 * D.Mike — DataGrid Column Roles (datagrid-roles.js)
 *
 * Analytical *role* of a column, independent of its storage *type*.
 *
 * Storage type (`column.type`) — numeric / text / date / binary / … — tells
 * the grid HOW the value is parsed, formatted and edited.
 *
 * Role (`column.role`) — continuous / categorical / ordinal / date /
 * identifier / freeText — tells statistical and charting modules WHAT the
 * column represents semantically. A column of integers may store as
 * `numeric` but represent a categorical factor like "Machine = 1, 2, 3, 4".
 *
 * The flag `column.roleManual === true` indicates the user has explicitly
 * pinned the role; auto re-inference must not override a manual choice
 * unless the role becomes invalid for the new storage type.
 */

export const ROLE = Object.freeze({
  CONTINUOUS:  'continuous',
  CATEGORICAL: 'categorical',
  ORDINAL:     'ordinal',
  DATE:        'date',
  IDENTIFIER:  'identifier',
  FREE_TEXT:   'freeText',
});

export const ALL_ROLES = Object.freeze([
  ROLE.CONTINUOUS,
  ROLE.CATEGORICAL,
  ROLE.ORDINAL,
  ROLE.DATE,
  ROLE.IDENTIFIER,
  ROLE.FREE_TEXT,
]);

// Heuristic thresholds — exposed so tests and future config can tune them.
export const ROLE_HEURISTIC = Object.freeze({
  /** Numeric columns with at most this many distinct non-null values default to categorical. */
  numericCategoricalMaxUnique: 10,
  /** Text columns are categorical only if unique count ≤ this AND ratio < textCategoricalMaxRatio. */
  textCategoricalMaxUnique: 50,
  /** Text columns are categorical only if (uniqueCount / nonNullCount) is below this ratio. */
  textCategoricalMaxRatio: 0.5,
});

/**
 * Roles that are semantically valid for a given storage type.
 * Used to decide whether a `roleManual` value survives a type change.
 *
 * @param {string} type — column.type
 * @returns {string[]} valid roles (never null)
 */
export function validRolesForType(type) {
  switch (type) {
    case 'numeric':
    case 'currency':
    case 'percent':
      return [ROLE.CONTINUOUS, ROLE.CATEGORICAL, ROLE.ORDINAL, ROLE.IDENTIFIER];
    case 'text':
      return [ROLE.CATEGORICAL, ROLE.ORDINAL, ROLE.IDENTIFIER, ROLE.FREE_TEXT];
    case 'binary':
      return [ROLE.CATEGORICAL];
    case 'date':
    case 'time':
      return [ROLE.DATE];
    default:
      return ALL_ROLES.slice();
  }
}

/** @returns {boolean} whether `role` is sensible for storage type `type`. */
export function isRoleValidForType(role, type) {
  return validRolesForType(type).includes(role);
}

/**
 * Default role for an empty column of the given type — used when no data
 * is available yet to drive the heuristic (newly added columns).
 */
export function defaultRoleForType(type) {
  switch (type) {
    case 'numeric':
    case 'currency':
    case 'percent':
      return ROLE.CONTINUOUS;
    case 'binary':
      return ROLE.CATEGORICAL;
    case 'date':
    case 'time':
      return ROLE.DATE;
    case 'text':
    default:
      return ROLE.FREE_TEXT;
  }
}

/**
 * Infer the analytical role of a column from its storage type and current
 * values. Used at import, on type-change (auto re-inference), and as a
 * migration fallback when loading legacy worksheets that lack `role`.
 *
 * Heuristic:
 *   - `binary`     → categorical (always)
 *   - `date|time`  → date (always)
 *   - numeric-ish: ≤ N unique non-null values → categorical, else continuous
 *   - `text`     : low cardinality (count ≤ M AND ratio < R) → categorical,
 *                  otherwise free-text
 *
 * The roles `ordinal` and `identifier` are never inferred automatically —
 * they require an explicit user choice. The heuristic is intentionally
 * conservative; misclassifications are corrected by the user via the
 * column-header badge (Phase 2).
 *
 * @param {{type: string, values?: any[]}} col
 * @returns {string} one of ALL_ROLES
 */
export function inferRole(col) {
  const type = col.type;

  if (type === 'binary') return ROLE.CATEGORICAL;
  if (type === 'date' || type === 'time') return ROLE.DATE;

  const values = (col.values || []).filter(v => v != null && v !== '');
  if (values.length === 0) return defaultRoleForType(type);

  const uniqueCount = new Set(values).size;

  if (type === 'numeric' || type === 'currency' || type === 'percent') {
    return uniqueCount <= ROLE_HEURISTIC.numericCategoricalMaxUnique
      ? ROLE.CATEGORICAL
      : ROLE.CONTINUOUS;
  }

  if (type === 'text') {
    const ratio = uniqueCount / values.length;
    const isCategorical =
      uniqueCount <= ROLE_HEURISTIC.textCategoricalMaxUnique &&
      ratio < ROLE_HEURISTIC.textCategoricalMaxRatio;
    return isCategorical ? ROLE.CATEGORICAL : ROLE.FREE_TEXT;
  }

  return defaultRoleForType(type);
}
