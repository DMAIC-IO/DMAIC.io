/**
 * Auf ein ausgeführtes Kommando warten (Spec C §7) — für Tests und
 * künftige Tutorials. Hört auf `command:executed`.
 */
import { deepEqual } from './helpers.js';

/**
 * @param {{ on: Function, off: Function }} eventBus
 * @param {{ instance?: string, command?: string, where?: Record<string, any>, timeout?: number }} [filter]
 *   `where`: flacher Teilvergleich auf `args`; `timeout` in ms (ohne: wartet unbegrenzt)
 * @returns {Promise<{ instanceId: string, command: string, args: object, result: any }>}
 */
export function waitForCommand(eventBus, { instance, command, where, timeout } = {}) {
  return new Promise((resolve, reject) => {
    let timer = null;
    const done = () => {
      eventBus.off('command:executed', onEvent);
      if (timer !== null) clearTimeout(timer);
    };
    function onEvent(ev) {
      if (instance !== undefined && ev?.instanceId !== instance) return;
      if (command !== undefined && ev?.command !== command) return;
      if (where && !Object.entries(where).every(([k, v]) => deepEqual(ev?.args?.[k], v))) return;
      done();
      resolve(ev);
    }
    eventBus.on('command:executed', onEvent);
    if (timeout !== undefined) {
      timer = setTimeout(() => {
        done();
        reject(new Error(`waitForCommand: timeout after ${timeout} ms (${command ?? 'any command'})`));
      }, timeout);
    }
  });
}
