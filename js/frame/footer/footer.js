/**
 * D.Mike — Frame · Footer (footer.js)
 * #footer-last-saved / #footer-storage / #footer-version. Fetches ./release.json,
 * formats locale dates, refreshes on state:saved / project:exported /
 * language:changed. Moved verbatim from app.js `_initFooter` (no behavior change).
 */
import { VERSION } from '../../core/version.js';

/** @param {object} kernel - { stateManager, eventBus, i18n } */
export function initFooter({ stateManager, eventBus, i18n }) {
  const footerSaved = document.getElementById('footer-last-saved');
  const footerStorage = document.getElementById('footer-storage');
  const footerVersion = document.getElementById('footer-version');

  if (footerVersion) {
    footerVersion.textContent = `v${VERSION}`;
    fetch('./release.json', { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : null)
      .then(rel => {
        if (!rel?.version) return;
        footerVersion.textContent = `v${rel.version}`;
        if (rel.date) footerVersion.title = rel.title ? `${rel.title} (${rel.date})` : rel.date;
      })
      .catch(() => {});
  }

  const formatWhen = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const locale = i18n.getLanguage() === 'en' ? 'en-US' : 'de-DE';
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString(locale);
    return sameDay ? time : `${d.toLocaleDateString(locale)}, ${time}`;
  };

  const refresh = () => {
    if (footerSaved) {
      const mod = stateManager.get('projectMeta.modified');
      const exp = stateManager.get('settings.lastExportAt');
      const parts = [];
      const modStr = formatWhen(mod);
      if (modStr) parts.push(i18n.t('app.lastChangeInBrowser', { when: modStr }));
      const expStr = formatWhen(exp);
      parts.push(expStr
        ? i18n.t('app.lastExport', { when: expStr })
        : i18n.t('app.lastExportNever'));
      footerSaved.textContent = parts.join(' · ');
    }
    if (footerStorage) {
      const { used, total } = stateManager.getStorageUsage();
      const kb = (used / 1024).toFixed(1);
      const mb = (total / 1024 / 1024).toFixed(0);
      footerStorage.textContent = `${kb} KB / ${mb} MB`;
    }
  };

  refresh();
  eventBus.on('state:saved', refresh);
  eventBus.on('project:exported', refresh);
  eventBus.on('language:changed', refresh);
}
