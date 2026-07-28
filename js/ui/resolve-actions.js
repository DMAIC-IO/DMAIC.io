/**
 * Resolve module action descriptors to render-ready view models.
 * Pure — no Alpine, no DOM. i18n resolution, default variant, and dropdown
 * detection live here so they can be unit-tested in isolation.
 *
 * @param {Array<object>|null|undefined} actions - descriptor list from config.actions
 * @param {(key: string, params?: object) => string} tf - module translation fn (i18n.tf(i18nKey))
 * @returns {Array<{iconId:string, text:string, tooltip:string|null,
 *   variant:'primary'|'secondary', isDropdown:boolean,
 *   onClick:?function, dynamicText:?function, children:Array<object>}>}
 */
export function resolveActions(actions, tf) {
  if (!Array.isArray(actions)) return [];
  return actions.map((a) => {
    const children = Array.isArray(a.children) ? resolveActions(a.children, tf) : [];
    return {
      iconId: a.icon,
      text: tf(a.title),
      tooltip: a.description ? tf(a.description) : null,
      variant: a.variant === 'primary' ? 'primary' : 'secondary',
      isDropdown: children.length > 0,
      onClick: a.onClick ?? null,
      dynamicText: a.dynamicText ?? null,
      children,
    };
  });
}
