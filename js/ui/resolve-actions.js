/**
 * Resolve module action descriptors to render-ready view models.
 * Pure — no Alpine, no DOM. i18n resolution, default variant, and dropdown
 * detection live here so they can be unit-tested in isolation.
 *
 * @param {Array<object>|null|undefined} actions - descriptor list from config.actions
 * @param {(key: string, params?: object) => string} tf - module translation fn (i18n.tf(i18nKey))
 * @param {((agentAction: string) => string|null)} [helpFor] - resolves
 *   `modules.<id>.actions.<aktion>.help`; returns null when the key is
 *   absent. NOT `tf`: `tf` falls back to the key itself, so a missing key
 *   would surface as a tooltip reading "actions.foo.help".
 * @returns {Array<{iconId:string, text:string, tooltip:string|null, help:string|null,
 *   agentAction:string|null, variant:'primary'|'secondary', isDropdown:boolean,
 *   onClick:?function, dynamicText:?function, children:Array<object>}>}
 */
export function resolveActions(actions, tf, helpFor) {
  if (!Array.isArray(actions)) return [];
  return actions.map((a) => {
    const children = Array.isArray(a.children) ? resolveActions(a.children, tf, helpFor) : [];
    // Kein Kollaps bei einem einzigen Kind: Export soll überall gleich als
    // Dropdown erscheinen, egal ob ein oder mehrere Formate (einheitliche UI).
    return {
      iconId: a.icon,
      text: tf(a.title),
      tooltip: a.description ? tf(a.description) : null,
      // Der Hilfetext der zugehörigen Agentenaktion — derselbe Satz, den
      // `module.describe` liefert. Ohne `agentAction` gibt es ihn nicht:
      // `title` ist ein Beschriftungsschlüssel und nur zufällig manchmal
      // gleich dem Methodennamen.
      agentAction: a.agentAction ?? null,
      help: (a.agentAction && helpFor) ? (helpFor(a.agentAction) ?? null) : null,
      variant: a.variant === 'primary' ? 'primary' : 'secondary',
      isDropdown: children.length > 0,
      onClick: a.onClick ?? null,
      dynamicText: a.dynamicText ?? null,
      children,
    };
  });
}
