/**
 * D.Mike — Frame Helpers (frame/helpers.js)
 * Shared DOM helpers for the application chrome (header, footer, banners).
 */

/**
 * Show or hide the read-only banner depending on the active project's status.
 * When the project is completed the app enters read-only mode (banner + body
 * class); otherwise the banner is hidden.
 *
 * @param {object} stateManager - Persistent state service.
 * @param {object} i18n - Translation helper.
 */
export function updateReadOnlyBanner(stateManager, i18n) {
  let banner = document.getElementById('readonly-banner');
  if (stateManager.isCompleted()) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'readonly-banner';
      banner.className = 'app-readonly-banner';
      const workspace = document.getElementById('app-workspace');
      workspace?.prepend(banner);
    }
    banner.textContent = `🔒 ${  i18n.t('app.projectReadOnly')}`;
    banner.style.display = '';
    document.body.classList.add('dmike--readonly');
  } else {
    if (banner) banner.style.display = 'none';
    document.body.classList.remove('dmike--readonly');
  }
}

/**
 * Global delegated handler — makes every `.dmike-split__output-section`
 * and `.dmike-split__output-section-header` collapsible. Clicking a section
 * label toggles the collapsed state and hides all following siblings up to
 * the next section label.
 */
export function initCollapsibleSections() {
  document.addEventListener('click', (e) => {
    // Don't toggle if user clicked on an interactive control inside a header
    if (e.target.closest('button, input, select, textarea, a')) return;

    // Find the section label that was clicked. Prefer the wrapping header.
    const header = e.target.closest('.dmike-split__output-section-header');
    const label  = e.target.closest('.dmike-split__output-section');
    const toggle = header || label;
    if (!toggle) return;

    // If we're inside a header, the standalone label child is not the toggle.
    if (header && label && label !== header && header.contains(label)) {
      // use header as toggle — already set
    }

    const modifierClass = header
      ? 'dmike-split__output-section-header--collapsed'
      : 'dmike-split__output-section--collapsed';
    const collapsed = toggle.classList.toggle(modifierClass);

    // Walk forward siblings, hide/show until we hit the next section label.
    let sib = toggle.nextElementSibling;
    while (sib) {
      if (sib.classList.contains('dmike-split__output-section') ||
          sib.classList.contains('dmike-split__output-section-header')) {
        break;
      }
      sib.classList.toggle('dmike-split__output-section-hidden', collapsed);
      sib = sib.nextElementSibling;
    }
  });
}
