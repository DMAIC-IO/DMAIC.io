/**
 * D.Mike — Frame · Header action buttons (action-buttons.js)
 * Fullscreen toggle (#fullscreen-btn + icon swap) and Export/Import
 * (#export-btn / #import-btn / #import-file-input, single vs multi-project,
 * migration sessionStorage flag, Ctrl+S export). _downloadJSON is private here.
 * Moved verbatim from app.js (no behavior change).
 */
import { stripPatch }      from '../../core/version-utils.js';
import { VERSION }         from '../../core/version.js';
import { shortcutRegistry } from '../../core/shortcut-registry.js';
import { buildExportScopeDialog } from '../../dialogs/export-scope/export-scope.js';

/** Temporary <a> download helper. */
function downloadJSON(json, filename) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** @param {object} kernel - { stateManager, eventBus, i18n }  @param {object} ui - { modal, notify } */
export function initActionButtons({ stateManager, eventBus, i18n }, { modal, notify }) {
  initFullscreen();
  initExportImport({ stateManager, eventBus, i18n }, { modal, notify });
}

function initFullscreen() {
  const btn = document.getElementById('fullscreen-btn');
  const iconEnter = document.getElementById('fullscreen-icon-enter');
  const iconExit = document.getElementById('fullscreen-icon-exit');
  if (!btn) return;

  function updateIcon() {
    const isFs = Boolean(document.fullscreenElement);
    iconEnter.style.display = isFs ? 'none' : '';
    iconExit.style.display = isFs ? '' : 'none';
  }

  btn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  document.addEventListener('fullscreenchange', updateIcon);
}

function initExportImport({ stateManager, eventBus, i18n }, { modal, notify }) {
  const exportBtn = document.getElementById('export-btn');
  const importBtn = document.getElementById('import-btn');
  const importInput = document.getElementById('import-file-input');

  const exportScopeDialog = buildExportScopeDialog({ i18n, eventBus });

  exportBtn?.addEventListener('click', async () => {
    const projects = stateManager.getProjects();
    const hasMultiple = projects.length > 1;

    if (!hasMultiple) {
      // Single project — export directly
      const json = stateManager.exportJSON();
      const name = (stateManager.get('projectMeta.name') ?? 'projekt').replace(/[^a-z0-9_-]/gi, '_');
      downloadJSON(json, `${name}_${new Date().toISOString().split('T')[0]}.json`);
      eventBus.emit('project:exported');
      notify(`${i18n.t('app.export')  } ✓`, 'success');
      return;
    }

    // Multiple projects — choose scope via dialog
    const scope = await exportScopeDialog.open(modal, { projectCount: projects.length }, {
      confirmLabel: i18n.t('app.export'),
    });
    if (scope === null) return; // cancelled
    const date = new Date().toISOString().split('T')[0];
    if (scope === 'all') {
      const json = await stateManager.exportAllJSON();
      downloadJSON(json, `dmike_alle_projekte_${date}.json`);
    } else {
      const json = stateManager.exportJSON();
      const name = (stateManager.get('projectMeta.name') ?? 'projekt').replace(/[^a-z0-9_-]/gi, '_');
      downloadJSON(json, `${name}_${date}.json`);
    }
    eventBus.emit('project:exported');
    notify(`${i18n.t('app.export')  } ✓`, 'success');
  });

  importBtn?.addEventListener('click', () => importInput?.click());

  importInput?.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const sourceMM = stripPatch(data.appVersion || '0.1.0');
      const targetMM = stripPatch(VERSION);
      const migrated = sourceMM !== targetMM;
      if (data.projects && Array.isArray(data.projects)) {
        // Multi-project import
        await stateManager.importAllJSON(text);
        notify(i18n.t('app.importAllSuccess', { count: data.projects.length }), 'success');
      } else {
        // Single-project import
        await stateManager.importJSON(text);
        notify(`${i18n.t('app.import')  } ✓`, 'success');
      }
      if (migrated) {
        // Persist across the upcoming reload — toast is wiped otherwise.
        sessionStorage.setItem(
          'dmike_import_migrated',
          JSON.stringify({ from: sourceMM, to: targetMM })
        );
      }
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      notify(`${i18n.t('common.error')  }: ${  err.message}`, 'error');
    }
    importInput.value = '';
  });

  // Ctrl+S — export all projects as JSON (configurable via shortcut registry)
  document.addEventListener('keydown', async (e) => {
    if (shortcutRegistry.matches(e, 'global.exportProject')) {
      e.preventDefault();
      const date = new Date().toISOString().split('T')[0];
      const json = await stateManager.exportAllJSON();
      downloadJSON(json, `dmike_alle_projekte_${date}.json`);
      eventBus.emit('project:exported');
      notify(`${i18n.t('app.export')  } ✓`, 'success');
    }
  });
}
