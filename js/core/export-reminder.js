/**
 * ExportReminder — warns the user when projects haven't been exported
 * after a configurable amount of *net work time*.
 *
 * "Net work time" = wall-clock seconds during which the page is visible
 * AND focused AND a data change occurred within the last ACTIVITY_WINDOW
 * seconds. Idle time, background-tab time, and read-only browsing don't
 * count.
 *
 * Settings (persisted under settings.* via StateManager):
 *   exportReminderEnabled  — boolean, default true
 *   exportReminderMinutes  — number,  default 60
 *   exportReminderSeconds  — accumulated net work seconds, persisted only
 *                            on tab hide / unload / warning fire (avoids
 *                            spamming localStorage every second)
 *   lastExportAt           — ISO timestamp of last reset (export)
 *
 * Reset triggers:
 *   - eventBus 'project:exported' (single + multi + Ctrl+S)
 */

const ACTIVITY_WINDOW_SEC = 30;   // a change "ages out" of activity after 30s of idleness
const TICK_INTERVAL_MS    = 1000;

export class ExportReminder {
  constructor({ stateManager, eventBus, i18n, notify }) {
    this._sm = stateManager;
    this._bus = eventBus;
    this._i18n = i18n;
    this._notify = notify;

    this._lastChangeAt = 0;     // epoch ms of most recent data:changed
    this._lastTickAt = 0;       // epoch ms of previous tick
    this._counterSec = 0;       // in-memory counter; flushed to settings on hide/unload
    this._tickHandle = null;
  }

  init() {
    if (this._tickHandle) return;

    this._counterSec = Number(this._sm.get('settings.exportReminderSeconds')) || 0;

    this._bus.on('data:changed', () => { this._lastChangeAt = Date.now(); });
    this._bus.on('project:exported', () => this.reset());

    this._lastTickAt = Date.now();
    this._tickHandle = setInterval(() => this._tick(), TICK_INTERVAL_MS);

    document.addEventListener('visibilitychange', () => {
      // Drop any accumulated wall-clock gap when the tab returns to visible.
      this._lastTickAt = Date.now();
      if (document.visibilityState === 'hidden') this._persist();
    });
    window.addEventListener('pagehide', () => this._persist());
    window.addEventListener('beforeunload', () => this._persist());
  }

  /** Reset counter and stamp lastExportAt = now. Called on every export. */
  reset() {
    this._counterSec = 0;
    this._sm.set('settings.exportReminderSeconds', 0);
    this._sm.set('settings.lastExportAt', new Date().toISOString());
  }

  _tick() {
    const now = Date.now();
    const dt = now - this._lastTickAt;
    this._lastTickAt = now;

    if (this._sm.get('settings.exportReminderEnabled') === false) return;
    if (!this._isActive()) return;
    if (!this._hasRecentChange(now)) return;

    // Cap dt to guard against suspended timers (e.g. laptop wake).
    this._counterSec += Math.min(dt, TICK_INTERVAL_MS * 2) / 1000;

    if (this._counterSec >= this._thresholdSec()) {
      // Fire warning, then start a fresh window so we re-warn after another full threshold.
      this._counterSec = 0;
      this._sm.set('settings.exportReminderSeconds', 0);
      this._sm.set('settings.lastExportReminderAt', new Date().toISOString());
      this._fireWarning();
    }
  }

  _persist() {
    this._sm.set('settings.exportReminderSeconds', Math.round(this._counterSec));
    // set() debounces saving by 2 s; on tab hide / unload we may not get that
    // window, so flush synchronously here.
    this._sm.save();
  }

  _isActive() {
    return document.visibilityState === 'visible' && document.hasFocus();
  }

  _hasRecentChange(now) {
    return this._lastChangeAt > 0 && (now - this._lastChangeAt) <= ACTIVITY_WINDOW_SEC * 1000;
  }

  _thresholdSec() {
    const min = Number(this._sm.get('settings.exportReminderMinutes')) || 60;
    // Floor at 1 s so a misconfigured 0 doesn't fire every tick.
    return Math.max(1 / 60, min) * 60;
  }

  _fireWarning() {
    const min = Math.max(1, Number(this._sm.get('settings.exportReminderMinutes')) || 60);
    const msg = this._i18n.t('settings.exportReminderToast', { minutes: min });
    this._notify(msg, 'warning');
  }
}
