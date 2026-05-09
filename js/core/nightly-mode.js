/**
 * D.Mike — Nightly Mode (nightly-mode.js)
 *
 * Detects whether the app is being served from the nightly subdomain
 * (`nightly.dmaic.io`) and, if so, renders a permanent banner at the top
 * plus a one-time acknowledgement modal explaining that data may break
 * across nightly updates.
 *
 * Stable origin (`dmaic.io`) is unaffected. Storage is origin-scoped, so
 * nightly never touches stable's localStorage.
 */

const ACKNOWLEDGED_KEY = 'dmike_nightly_acknowledged';

/**
 * @returns {boolean} true if running on nightly.* hostname
 */
export function isNightly() {
  return typeof location !== 'undefined' && location.hostname.startsWith('nightly.');
}

/**
 * Mount the nightly banner and (if not yet acknowledged) the welcome modal.
 * No-op when not on the nightly hostname.
 *
 * @param {object} ctx
 * @param {import('../ui/modal.js').Modal} ctx.modal
 * @param {import('./i18n.js').I18n} ctx.i18n
 */
export function initNightlyMode({ modal, i18n }) {
  if (!isNightly()) return;

  document.documentElement.classList.add('is-nightly');
  _renderBanner(i18n);

  if (localStorage.getItem(ACKNOWLEDGED_KEY) !== '1') {
    // Defer slightly so the rest of the app finishes rendering first
    setTimeout(() => _showWelcomeModal(modal, i18n), 50);
  }
}

function _renderBanner(i18n) {
  if (document.getElementById('nightly-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'nightly-banner';
  banner.className = 'nightly-banner';
  banner.setAttribute('role', 'alert');

  const badge = document.createElement('span');
  badge.className = 'nightly-banner__badge';
  badge.dataset.i18n = 'nightly.badge';
  badge.textContent = i18n.t('nightly.badge');

  const text = document.createElement('span');
  text.className = 'nightly-banner__text';
  text.dataset.i18n = 'nightly.banner';
  text.textContent = i18n.t('nightly.banner');

  banner.append(badge, text);
  document.body.prepend(banner);
}

async function _showWelcomeModal(modal, i18n) {
  await modal.alert(
    i18n.t('nightly.modalBody'),
    i18n.t('nightly.modalTitle'),
  );
  try {
    localStorage.setItem(ACKNOWLEDGED_KEY, '1');
  } catch {
    // private mode / quota: harmless, modal will reappear next visit
  }
}
