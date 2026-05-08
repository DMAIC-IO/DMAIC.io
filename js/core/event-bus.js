/**
 * D.Mike — Event Bus (event-bus.js)
 * Global pub/sub system for decoupled communication between
 * modules and core components. Modules never reference each
 * other directly — all communication goes through this bus.
 *
 * Standard events:
 *   language:changed  { lang: 'de' }
 *   theme:changed     { theme: 'dark' }
 *   module:added      { moduleId, phase, instanceId }
 *   module:removed    { moduleId, phase, instanceId }
 *   module:activated  { instanceId }
 *   data:changed      { source, key }
 *   project:exported  {}
 *   project:imported  { data }
 *   state:saved       {}
 */
export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /**
   * Subscribe to an event.
   * @param {string} event
   * @param {Function} callback
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);
  }

  /**
   * Unsubscribe from an event.
   * @param {string} event
   * @param {Function} callback
   */
  off(event, callback) {
    this._listeners.get(event)?.delete(callback);
  }

  /**
   * Publish an event with optional arguments.
   * @param {string} event
   * @param {...any} args
   */
  emit(event, ...args) {
    this._listeners.get(event)?.forEach(cb => {
      try {
        cb(...args);
      } catch (err) {
        console.error(`[EventBus] Error in handler for "${event}":`, err);
      }
    });
  }

  /**
   * Subscribe to an event, auto-unsubscribe after the first call.
   * @param {string} event
   * @param {Function} callback
   */
  once(event, callback) {
    const wrapper = (...args) => {
      callback(...args);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }
}
